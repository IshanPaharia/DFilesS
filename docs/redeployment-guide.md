# Redeployment & Environment Update Guide (VPS & Vercel)

This guide provides step-by-step instructions for updating environment variables, pulling the latest code, opening firewall ports, and redeploying DFilesS on both your **Oracle Cloud VPS** and **Vercel Frontend**.

---

## Part 1: Oracle VPS Redeployment

### 1. SSH into VPS & Pull Latest Code

```bash
ssh ubuntu@<your-vps-public-ip>
cd ~/DFilesS
git pull origin main
```

---

### 2. Verify Oracle Cloud Firewall (Ports 80 & 443)

Caddy requires ports 80 and 443 to be reachable from the internet for Let's Encrypt / ACME TLS certificate issuance.

#### A. Oracle Cloud VCN Console
1. Open **Oracle Cloud Console** > **Networking** > **Virtual Cloud Networks**.
2. Select your VCN > **Security Lists** > **Default Security List**.
3. Add Ingress Rule:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443`

#### B. OS Instance Firewall (Ubuntu)
Run on the VPS instance via SSH:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save || true

sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

### 3. Update Environment Variables (`.env`)

Create or update `.env` in your VPS project root (`~/DFilesS/.env`):

```bash
cat << 'EOF' > .env
# Database configuration
DATABASE_URL=postgres://dfs:dfs@postgres:5432/dfs

# Optional: Shared Secret for write routes (POST /files, PUT /gateway/...)
# Leave empty if you want public uploads, or set a secure string to restrict uploads
DFS_WRITE_SECRET=your-secret-key-here
EOF
```

> [!WARNING]
> Never commit your actual `DFS_WRITE_SECRET` string to GitHub. Keep it in `.env` or system environment variables.

---

### 4. Update `Caddyfile` for Domain

Edit `Caddyfile` to use your DuckDNS domain:

```caddy
your-subdomain.duckdns.org {
    reverse_proxy metadata-service:4000
}
```

---

### 5. Ensure Host Storage Directories & Rebuild Containers

```bash
# Ensure host data directories exist with proper permissions
sudo ./scripts/setup-host-dirs.sh

# Rebuild images and restart containers in background
docker compose up --build -d
```

---

### 6. Verify VPS Deployment

```bash
# Check container status
docker compose ps

# Check Caddy SSL & Metadata service responsiveness
curl -i https://your-subdomain.duckdns.org/metrics

# View logs if needed
docker compose logs -f caddy metadata-service
```

---

## Part 2: Vercel Frontend Redeployment

### 1. Update Environment Variables in Vercel

1. Log into your [Vercel Dashboard](https://vercel.com).
2. Select your **`dfs-web`** project.
3. Go to **Settings** > **Environment Variables**.
4. Add or edit the variable:
   - **Key**: `VITE_METADATA_URL`
   - **Value**: `https://your-subdomain.duckdns.org`
   - **Target**: Select `Production`, `Preview`, and `Development`.
5. Click **Save**.

---

### 2. Trigger Redeployment

#### Option A: Automatic Push Trigger
Push any new commit to your default GitHub branch (`main`). Vercel will automatically build and deploy with the updated environment variables.

#### Option B: Manual Redeployment in Vercel Console
1. In Vercel Console, go to the **Deployments** tab.
2. Click the three dots (`...`) next to your latest deployment.
3. Click **Redeploy**.
4. **Ensure "Use existing Build Cache" is UNCHECKED** so Vercel picks up the newly updated environment variables during `vite build`.
5. Click **Redeploy**.

---

### 3. Verify Live Web App

1. Open your Vercel deployment URL (e.g. `https://dfs-web.vercel.app`).
2. **Dashboard & Metrics (Public)**:
   - Verify the **Cluster** tab loads metrics and node statuses automatically via 5-second polling.
   - Verify the **Files** tab lists existing files and file downloads work without any authentication prompts.
3. **Uploads (Protected by Secret)**:
   - Navigate to the **Upload** tab.
   - If `DFS_WRITE_SECRET` is set on your VPS, enter the secret in the **Write Secret** input box.
   - Select a test file and click **Start Upload**.
   - Verify that chunks are chunked, uploaded via `/gateway/...`, and committed successfully.

---

## Quick Reference Summary

| Location | Action | Command / Location |
| :--- | :--- | :--- |
| **Oracle VPS** | Pull Code | `git pull origin main` |
| **Oracle VPS** | Set Write Secret | Edit `~/DFilesS/.env` (`DFS_WRITE_SECRET=...`) |
| **Oracle VPS** | Firewall Ports | `sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT` & `443` |
| **Oracle VPS** | Restart Stack | `docker compose up --build -d` |
| **Vercel** | Set API Endpoint | Settings > Environment Variables > `VITE_METADATA_URL=https://...` |
| **Vercel** | Deploy | Deployments > `...` > Redeploy (uncached) |
