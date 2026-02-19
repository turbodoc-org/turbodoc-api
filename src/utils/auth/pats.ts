const PAT_PREFIX = "td_pat_";

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const isPatToken = (token: string) => token.startsWith(PAT_PREFIX);

export const generatePatToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${PAT_PREFIX}${toBase64Url(bytes)}`;
};

export const hashPatToken = async (token: string) => {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
};

export const getPatTokenLast4 = (token: string) => token.slice(-4);

export const patPrefix = PAT_PREFIX;
