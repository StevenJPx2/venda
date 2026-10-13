// A whole content folder into the site (`import`, over whatever is there,
// keeping files the index cannot read as problems) and out of it (`export`).
import { MAX_FILES_PER_WRITE, MAX_WRITE_BYTES } from '@venda/contract';
import { request, siteFile } from '../client';
import { inBatches, plural, report, type Context } from '../context';
import { CliFailure } from '../failure';
import { readFolder, writeInto } from '../folder';

export interface FolderFile {
  readonly path: string;
  readonly text: string;
}

const encoder = new TextEncoder();

// JSON escaping can make a file's text longer on the wire than on disk.
const BATCH_BYTES = Math.floor(MAX_WRITE_BYTES * 0.8);

/** Files grouped into requests the API takes: at most 200 files and 20 MB each. */
export function batchesOf(files: ReadonlyArray<FolderFile>) {
  const batches: FolderFile[][] = [];
  let current: FolderFile[] = [];
  let bytes = 0;

  for (const file of files) {
    const size = encoder.encode(JSON.stringify(file)).byteLength;

    if (
      current.length === MAX_FILES_PER_WRITE ||
      (current.length > 0 && bytes + size > BATCH_BYTES)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }

    current.push(file);
    bytes += size;
  }

  if (current.length) batches.push(current);

  return batches;
}

export async function importFolder(context: Context, dir: string) {
  const files = [...(await readFolder(dir))].map(([path, text]) => ({
    path,
    text
  }));

  if (files.length === 0)
    throw new CliFailure(
      'NoContent',
      `${dir} has no content files: site.ts, <collection>/config.ts or <collection>/<slug>.md`
    );

  let imported = 0;
  let unchanged = 0;

  for (const batch of batchesOf(files)) {
    const answer = await request(
      context.api.files.import({ payload: { files: batch } })
    );

    imported += answer.imported;
    unchanged += answer.unchanged;
  }

  return report(
    `Imported ${plural(imported, 'file')} from ${dir}; ${unchanged} unchanged. Files the site cannot read are listed in Content problems.`,
    { imported, unchanged }
  );
}

export async function exportFolder(context: Context, dir: string) {
  const listed = await request(context.api.files.list());
  let written = 0;

  await inBatches(listed, async ({ path }) => {
    const file = await siteFile(context.api, path);

    if (file === null) return;

    await writeInto(dir, path, file.text);
    written++;
  });

  return report(`Exported ${plural(written, 'file')} into ${dir}`, {
    exported: written
  });
}
