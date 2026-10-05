// File-first content (docs/architecture.md): sync the files into the index
// and serve published entries from it. Effect code under the new-architecture gate.
export { getPublished, listPublished } from './read';

export { ContentStore, ContentStoreError, gitBlobSha, IndexDb, IndexDbError, type SqlValue, type StoredFile } from './services';

export { syncAll, syncContent, type SyncReport } from './sync';
