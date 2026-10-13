// The GitHub App's own credential: an RS256 JWT, valid for minutes, exchanged
// for an installation token. Web Crypto signs it; it reads PKCS#8 keys only.
import { base64Url, bytesFromBase64 } from './encoding';

const encoder = new TextEncoder();

const PKCS8 = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/;

/** GitHub's download is PKCS#1; the setup docs convert it once with openssl. */
const KEY_FORMAT_HELP =
  'VENDA_GITHUB_PRIVATE_KEY must be a PKCS#8 key ("BEGIN PRIVATE KEY"). Convert the key GitHub gave you with: openssl pkcs8 -topk8 -nocrypt -in app.pem -out app-pkcs8.pem';

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = PKCS8.exec(pem)?.[1];

  if (body === undefined) throw new Error(KEY_FORMAT_HELP);

  return crypto.subtle.importKey(
    'pkcs8',
    bytesFromBase64(body),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

interface JwtHeader {
  readonly alg: 'RS256';
  readonly typ: 'JWT';
}

interface JwtClaims {
  readonly iat: number;
  readonly exp: number;
  readonly iss: string;
}

/**
 * Issued a minute in the past against clock drift, and expiring inside
 * GitHub's ten-minute limit.
 */
export function jwtClaims(clientId: string, nowSeconds: number): JwtClaims {
  return { iat: nowSeconds - 60, exp: nowSeconds + 540, iss: clientId };
}

export async function appJwt(
  key: CryptoKey,
  clientId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  const part = (value: JwtHeader | JwtClaims) =>
    base64Url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part(jwtClaims(clientId, nowSeconds))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(unsigned)
  );

  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
