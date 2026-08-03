export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export async function getJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(joinUrl(baseUrl, path));
  return parseJsonResponse<T>(response);
}

export async function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(joinUrl(baseUrl, path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseJsonResponse<T>(response);
}

export async function deleteRequest(baseUrl: string, path: string): Promise<void> {
  const response = await fetch(joinUrl(baseUrl, path), { method: "DELETE" });
  if (!response.ok) {
    throw new HttpError(`DELETE ${path} failed`, response.status, await response.text());
  }
}

export async function putBytes(baseUrl: string, path: string, bytes: Buffer, headers: Record<string, string>): Promise<void> {
  const response = await fetch(joinUrl(baseUrl, path), {
    method: "PUT",
    headers,
    body: bytes as unknown as BodyInit
  });

  if (!response.ok) {
    throw new HttpError(`PUT ${path} failed`, response.status, await response.text());
  }
}

export async function getBytes(baseUrl: string, path: string): Promise<Buffer> {
  const response = await fetch(joinUrl(baseUrl, path));
  if (!response.ok) {
    throw new HttpError(`GET ${path} failed`, response.status, await response.text());
  }
  return Buffer.from(await response.arrayBuffer());
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(`HTTP request failed with status ${response.status}`, response.status, text);
  }
  return text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
}
