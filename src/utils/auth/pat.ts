export const PAT_PREFIX = "td_pat_";

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const generatePatToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${PAT_PREFIX}${base64UrlEncode(bytes)}`;
};

export const hashToken = async (token: string) => {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hashBuffer));
};
