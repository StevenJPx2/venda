// Base64 for GitHub's JSON bodies and JWTs, over bytes, so text outside
// Latin-1 survives the round trip (btoa alone takes only Latin-1).
const encoder = new TextEncoder();

const decoder = new TextDecoder();

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

/** GitHub wraps base64 bodies across lines; whitespace is ignored. */
export function bytesFromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/\s/g, ''));

  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export const base64FromText = (text: string) =>
  base64FromBytes(encoder.encode(text));

export const textFromBase64 = (text: string) =>
  decoder.decode(bytesFromBase64(text));

/** The URL-safe, unpadded form JWTs use. */
export const base64Url = (bytes: Uint8Array) =>
  base64FromBytes(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
