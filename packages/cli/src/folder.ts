// A content folder on disk: its content files (site.ts, <collection>/config.ts
// and entries; anything else is not content and is left alone), and the
// manifest, `.venda/shas.json`, recording the site it came from and the SHA
// each file was pulled at.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { CONTENT_PATH } from '@venda/contract';
import { textSha } from '@venda/content';
import { Schema } from 'effect';
import { CliFailure } from './failure';

const MANIFEST = join('.venda', 'shas.json');

const Manifest = Schema.Struct({
  site: Schema.String,
  files: Schema.Record(Schema.String, Schema.String)
});

const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(Manifest)
);

/** The folder's content files: path → text. */
export async function readFolder(dir: string) {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true
  }).catch(() => []);
  const files = new Map<string, string>();

  for (const entry of entries.filter(each => each.isFile())) {
    const full = join(entry.parentPath, entry.name);
    const path = relative(dir, full).split(sep).join('/');

    if (CONTENT_PATH.test(path)) files.set(path, await readFile(full, 'utf8'));
  }

  return files;
}

/** Each file's git blob SHA. */
export async function shasOf(files: ReadonlyMap<string, string>) {
  const shas = new Map<string, string>();

  for (const [path, text] of files) shas.set(path, await textSha(text));

  return shas;
}

/** The SHAs the folder was pulled at, for `site`; empty when it never was. */
export async function readManifest(dir: string, site: string) {
  const manifest = await readFile(join(dir, MANIFEST), 'utf8').then(
    decodeManifest,
    () => null
  );

  if (manifest !== null && manifest.site !== site)
    throw new CliFailure(
      'OtherSite',
      `${dir} holds content pulled from ${manifest.site}, not ${site}: use another folder`
    );

  return new Map(Object.entries(manifest?.files ?? {}));
}

export async function writeManifest(
  dir: string,
  site: string,
  files: ReadonlyMap<string, string>
) {
  const sorted = Object.fromEntries(
    [...files].sort(([a], [b]) => a.localeCompare(b))
  );

  await mkdir(join(dir, '.venda'), { recursive: true });
  await writeFile(
    join(dir, MANIFEST),
    `${JSON.stringify({ site, files: sorted }, null, 2)}\n`
  );
}

/** Only content paths are ever written or removed, so a site cannot reach outside the folder. */
function inside(dir: string, path: string) {
  if (!CONTENT_PATH.test(path))
    throw new CliFailure('NotContent', `${path} is not a content file`, path);

  return join(dir, ...path.split('/'));
}

export async function writeInto(dir: string, path: string, text: string) {
  const file = inside(dir, path);

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

export const removeFrom = (dir: string, path: string) =>
  rm(inside(dir, path), { force: true });
