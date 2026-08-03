# Oracle Free Tier VPS & Caddy HTTPS Deployment

This guide covers deploying DFilesS on an Oracle Free Tier Linux/Ubuntu VM with Caddy + DuckDNS for HTTPS, and setting up Vercel for the web frontend.

## 1. Instance Setup

Provision an Oracle Linux or Ubuntu ARM/x86 VM. Install Docker, Docker Compose, and Git:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git iptables-persistent ufw
sudo usermod -aG docker $USER
```

Log out and back in after adding the Docker group.

---

## 2. Oracle Firewall (VCN Security List & OS iptables)

> [!CAUTION]
> **Oracle Cloud Network Blocking**:
> Oracle Cloud VMs block inbound traffic on ports 80 and 443 by default at two distinct layers:
> 1. **Oracle Cloud VCN Security List** (or Network Security Group).
> 2. **VM OS-level iptables / ufw rules** baked into Oracle Ubuntu images.
> 
> **You MUST open ports 80 and 443 on both layers before starting Caddy**, otherwise Caddy's Let's Encrypt / ACME challenge will fail with an obscure network timeout.

### A. Oracle Cloud Console (VCN Security List)
1. Go to **Networking** > **Virtual Cloud Networks** > Select your VCN.
2. Click **Security Lists** > Select **Default Security List**.
3. Click **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443`
4. Click **Add Ingress Rules**.

### B. OS Instance Firewall (iptables / ufw)
Run on the VPS instance via SSH:

```bash
# Allow TCP 80 & 443 through iptables
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || true

# Allow TCP 80 & 443 through ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## 3. Free DuckDNS Domain Setup

1. Go to [duckdns.org](https://www.duckdns.org) and log in.
2. Create a free subdomain pointing to your Oracle VPS Public IP (e.g. `my-dfs.duckdns.org`).
3. Update `Caddyfile` in the repo root:
   ```caddy
   my-dfs.duckdns.org {
       reverse_proxy metadata-service:4000
   }
   ```

---

## 4. Environment & Write Secret Protection

Set environment variables in your VPS shell or Compose `.env` file:

```bash
# Optional: Set a shared write secret to protect upload endpoints
export DFS_WRITE_SECRET=<your-chosen-secret-string>
```

> [!WARNING]
> **Secret Hygiene**:
> Never commit actual secret strings (e.g. `DFS_WRITE_SECRET`, database passwords, or API tokens) into git repositories, documentation files, `.env` templates, or Caddyfiles. Always use environment variables or `<placeholder>` text.

- **Write Routes (`POST /files`, `PUT /gateway/...`)**: Protected by `X-DFS-Write-Secret` header if `DFS_WRITE_SECRET` is set, and rate-limited to 30 req/min per IP.
- **Read/Polling Routes (`GET /metrics`, `GET /nodes`, `GET /files`)**: Fully public and unthrottled for dashboard continuous 5s polling.

---

## 5. Host Storage Directories

Run directory creation script before launching containers:

```bash
sudo ./scripts/setup-host-dirs.sh
```

Or manually:

```bash
sudo mkdir -p /var/lib/dfs/postgres \
              /var/lib/dfs/storage-node-1 \
              /var/lib/dfs/storage-node-2 \
              /var/lib/dfs/storage-node-3 \
              /var/lib/dfs/storage-node-4
sudo chown -R 70:70 /var/lib/dfs/postgres
sudo chown -R 0:0 /var/lib/dfs/storage-node-1 /var/lib/dfs/storage-node-2 /var/lib/dfs/storage-node-3 /var/lib/dfs/storage-node-4
sudo chmod 755 /var/lib/dfs/*
```

---

## 6. Deploy Cluster with Caddy

Launch all services including Caddy reverse proxy:

```bash
docker compose up --build -d
docker compose ps
```

Verify HTTPS access:

```bash
curl -i https://my-dfs.duckdns.org/metrics
```

---

## 7. Vercel Frontend Setup

To deploy `apps/dfs-web` on Vercel:

1. Import the repository in Vercel Console.
2. Set Root Directory to `apps/dfs-web`.
3. Add Environment Variable:
   - `VITE_METADATA_URL=https://my-dfs.duckdns.org`
4. Deploy.

Visitors to your Vercel URL can view cluster metrics, file listings, and download files without authentication. Authorized demoers can enter the `Write Secret` on the Upload tab to perform uploads.

---

## 8. Failure Demo & Teardown

Run failure acceptance demo:

```bash
docker compose run --rm cli demo seed
docker kill storage-node-3
docker compose run --rm cli status
docker compose run --rm cli demo heal-watch
```

Teardown cluster:

```bash
docker compose down
```