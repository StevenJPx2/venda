# Slice 5: unpublish, trash and restore

Status: **done** (part 1). Scheduling, previews and search follow in later
parts.

- Unpublish writes `draft: true` to the current file. Republish removes that
  flag. Saved working-copy edits are kept, not silently published.
- Trash removes the file and its index entry in one write. Its working
  record becomes `trashed`, retaining ownership, saved edits and the last
  file's SHA. Every file version remains in `content_revisions`.
- Restore reads that saved version, checks it against the current model and
  writes it back as a draft. The working copy and its ownership return too.
- Every action guards the file's SHA and the working record's revision.
  Trash and restore raise the revision, so an old tab cannot become current
  again after an entry returns. Model-dependent writes guard the model too.
- Index writes guard the latest content revision they read from and retry
  at most twice after competing writes. A model edit cannot install an entry
  snapshot taken before an unpublish, trash or publish.
- A trashed slug stays reserved. Ordinary file writes cannot revive it;
  restoration is an explicit operation. Files deleted directly through the
  files API still retain revision history.
- The same publishing permission applies: administrators, editors and an
  author assigned to the entry. Contributors cannot change public state.
- Trash is paged and filtered by the same visibility rules as working
  copies. There is no automatic purge in this part.
- Unpublished copies that have never had a file keep their existing Discard
  action; trash applies to entries with files.

## Delivery

1. Contract and schema: lifecycle endpoints and the trash state on
   `content_work`, with a generated migration.
2. Core and server: atomic transitions, permission checks, guarded file
   writes and tests for concurrent saves, publishes, lifecycle actions,
   file writes and model changes.
3. Admin: entry actions with confirmations, a paged Trash view, and
   `try/slice-5.html` with an interactive trial using the actual admin.
4. The live `lifecycle` suite: the API's transitions and guards on workerd,
   and the same flow through the admin in a browser.
