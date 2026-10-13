// File-first content (docs/architecture.md): sync the files into the index
// and serve published entries from it. Effect code under the new-architecture gate.
export { getPublished, listPublished } from './read';

export * as contentSchema from './schema';

export {
  ContentStore,
  ContentStoreError,
  gitBlobSha,
  type StoredFile
} from './services';

export type {
  ContentCommit,
  ContentSnapshot,
  ContentFileStore
} from './services';

export { getSite, siteSettings } from './site';

export {
  getWorkingCopy,
  saveWorkingCopy,
  discardWorkingCopy,
  rebaseWorkingCopy,
  assignEntryOwner
} from './work';

export { publishWorkingCopy } from './publish';

export { createEntry, type CreateInput } from './create';

export { getSiteDocument, saveSiteFile } from './site-write';

export { syncAll, syncContent, type SyncReport } from './sync';

export {
  getIndexedEntry,
  listCollections,
  listContentProblems,
  listIndexedEntries
} from './admin';

export { snapshotOf } from './snapshot';
