import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from 'unstorage';
import fsDriver from 'unstorage/drivers/fs';
import memoryDriver from 'unstorage/drivers/memory';
import { afterEach, describe, expect, it } from 'vitest';
import { keyValue, objectStore } from '../src/storage';

const PNG = new Uint8Array([137, 80, 78, 71]);

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function filesystem() {
  const dir = await mkdtemp(join(tmpdir(), 'venda-media-'));

  dirs.push(dir);

  return createStorage({ driver: fsDriver({ base: dir }) });
}

describe('objectStore', () => {
  it.each([
    ['memory', async () => createStorage({ driver: memoryDriver() })],
    ['filesystem', filesystem]
  ])('stores bytes and their content type (%s)', async (_name, make) => {
    const media = objectStore(await make(), { nativeContentType: false });

    await media.put('2026/10/logo.png', PNG, { contentType: 'image/png' });
    const stored = await media.get('2026/10/logo.png');

    expect(stored?.contentType).toBe('image/png');
    expect(new Uint8Array(await new Response(stored?.body).arrayBuffer())).toEqual(PNG);

    await media.delete('2026/10/logo.png');
    expect(await media.get('2026/10/logo.png')).toBeNull();
  });

  // The core uploads the request's File as is.
  it.each([
    ['memory', async () => createStorage({ driver: memoryDriver() })],
    ['filesystem', filesystem]
  ])('accepts an uploaded File (%s)', async (_name, make) => {
    const media = objectStore(await make(), { nativeContentType: false });

    await media.put('upload.png', new File([PNG], 'upload.png', { type: 'image/png' }), { contentType: 'image/png' });
    expect(new Uint8Array(await new Response((await media.get('upload.png'))?.body).arrayBuffer())).toEqual(PNG);
  });
});

describe('keyValue', () => {
  it('expires values even on drivers without TTL', async () => {
    let now = 1_000_000;
    const kv = keyValue(createStorage({ driver: memoryDriver() }), () => now);

    await kv.put('session:a', 'alice', { ttlSeconds: 60 });
    await kv.put('flag', 'on');
    expect(await kv.get('session:a')).toBe('alice');

    now += 60_000;
    expect(await kv.get('session:a')).toBeNull();
    expect(await kv.get('flag')).toBe('on');
  });

  it('treats values it did not write as missing', async () => {
    const storage = createStorage({ driver: memoryDriver() });

    await storage.setItem('legacy', 'plain string');
    expect(await keyValue(storage).get('legacy')).toBeNull();

    await keyValue(storage).delete('legacy');
    expect(await storage.hasItem('legacy')).toBe(false);
  });
});
