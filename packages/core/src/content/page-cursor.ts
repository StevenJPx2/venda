// New entries page before indexed files. Each phase has its own keyset; the
// opaque cursor switches to files only after all matching new entries.
import { Option, Schema } from 'effect';

export const PAGE_SIZE = 50;

const Cursor = Schema.fromJsonString(
  Schema.Struct({
    phase: Schema.Literals(['new', 'files']),
    key: Schema.String,
    slug: Schema.String
  })
);

export type EntryCursor = typeof Cursor.Type;

export const encodeCursor = Schema.encodeSync(Cursor);

const decode = Schema.decodeUnknownOption(Cursor);

export const pageCursor = (text: string | undefined) =>
  text === undefined ? undefined : Option.getOrUndefined(decode(text));
