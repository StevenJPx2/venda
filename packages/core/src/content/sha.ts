const encoder = new TextEncoder();

/** The SHA git gives a file's content, so exports match what git computes. */
export async function gitBlobSha(content: Uint8Array): Promise<string> {
  const header = encoder.encode(`blob ${content.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + content.byteLength);

  blob.set(header);
  blob.set(content, header.byteLength);

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', blob));

  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

/** The git blob SHA of a file's text. */
export const textSha = (text: string) => gitBlobSha(encoder.encode(text));
