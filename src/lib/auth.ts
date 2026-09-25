/**
 * Optional passphrase gate. When TRAJECTORY_PASSPHRASE is set, every request
 * must carry a session cookie holding an HMAC derived from the secret. Uses
 * Web Crypto so it runs in both the Edge middleware and Node actions.
 */
export const SESSION_COOKIE = "trajectory_session";

function secret(): string {
  return process.env.TRAJECTORY_SESSION_SECRET ?? process.env.TRAJECTORY_PASSPHRASE ?? "";
}

export function authEnabled(): boolean {
  return Boolean(process.env.TRAJECTORY_PASSPHRASE);
}

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sessionToken(): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("trajectory-session-v1"));
  return toBase64Url(sig);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!cookieValue) return false;
  return constantTimeEqual(cookieValue, await sessionToken());
}
