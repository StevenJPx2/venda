# Slice 4: the GitHub content store

Status: **approved, implementation in progress**. Builds on [architecture.md](../architecture.md), the
Save, Publish and Outside edit flows, and the completed slice 3 write path.

Publishing writes a commit to a configured GitHub repository through a GitHub
App installation. A push outside Venda brings the index up to date without a
deploy. Editors still need only Venda accounts. Autosave remains in D1 and
keeps working when GitHub is unreachable.

## Scope

In:

- GitHub App authentication on workerd, with installation-token renewal.
- Read content from one repository, one branch and one content directory.
- Publish entries and `site.ts` using blob-SHA conditional writes.
- Commit messages and attribution from the authenticated Venda person.
- Signature-verified push webhooks and durable, bounded index sync.
- A scheduled reconciliation pass for missed webhooks and interrupted jobs.
- Settings → Repository, as an admin plugin, with status and sync controls.
- `try/slice-4.html`, deterministic live tests and a real repository contract
  test.

Out:

- GitHub OAuth for editors, a repository picker and App creation in the admin.
- Pull-request publishing, branch switching and automatic protection bypass.
- Git history browsing, scheduling, trash and preview: slice 5.
- Model editing: slice 6. Outside edits to models already sync in this slice.
- R2 uploads, deployment CLI and the SAFT cut-over.
- GitHub Enterprise Server and arbitrary API hosts.

## Configuration and authentication

The repository is deployment configuration, not site copy or browser state.
One deployment has one source. Selecting a different source requires a restart
and an explicit index rebuild, not silently combining two repositories.

Proposed bindings:

| Binding | Holds |
| --- | --- |
| `VENDA_GITHUB_REPOSITORY` | `owner/repository` |
| `VENDA_GITHUB_REPOSITORY_ID` | immutable repository ID, checked against GitHub and webhooks |
| `VENDA_GITHUB_BRANCH` | explicit branch name, such as `main` |
| `VENDA_GITHUB_CONTENT_DIR` | repository-relative directory, default `content` |
| `VENDA_GITHUB_CLIENT_ID` | GitHub App client ID |
| `VENDA_GITHUB_INSTALLATION_ID` | the installation permitted to access this repository |
| `VENDA_GITHUB_AUTHOR_EMAIL` | shared service/noreply email for commit attribution |
| `VENDA_GITHUB_PRIVATE_KEY` | PKCS#8 PEM, a Worker secret |
| `VENDA_GITHUB_WEBHOOK_SECRET` | high-entropy webhook secret, a Worker secret |

- App repository permissions: Contents read/write and the mandatory Metadata
  read permission. Subscribe to push events. No Workflows, Administration or
  user-account permission is needed.
- Exchange an RS256 App JWT for an installation token scoped to the configured
  repository ID and Contents write permission. Use the client ID as issuer;
  set `iat` 60 seconds in the past and expiry within GitHub's ten-minute bound.
- Cache the token only in the isolate, using its returned expiry and one
  in-flight renewal. Tokens are opaque strings, not fixed-length values.
- GitHub downloads PKCS#1 keys. Document conversion to PKCS#8 at setup, then
  use Web Crypto for signing and HMAC verification. Do not build an ASN.1
  parser or a crypto library. No new production dependency is proposed.
- Private keys and tokens never enter D1, the admin, logs or try-page responses.
  Production API calls go only to `https://api.github.com`, with an explicit
  version header (`2026-03-10`). Do not follow an authenticated redirect to an
  arbitrary host.
- Reject partial configuration and simultaneous GitHub and local sources.
  Keep the local folder store for development. A deliberately unconfigured
  deployment may still use bundled read-only content; an invalid GitHub setup
  must never fall back to that copy.

## Reads and snapshots

The GitHub adapter belongs in `packages/server/src/github/`. Core still has no
GitHub or Cloudflare imports. Refactor the store seam where necessary rather
than fitting GitHub behind a mutable, path-only storage cache.

- A sync snapshot resolves the branch head once, enumerates that commit's
  content subtree and reads its blobs by immutable SHA. A branch moving during
  a run cannot pair an old SHA with new bytes.
- Extend the core store with an explicit snapshot operation used by sync.
  Current-file reads used by conflict resolution remain fresh reads. Local
  and test stores implement the same contract, with tests for the read/list
  race rather than assuming a folder is immutable.
- Keep paths relative to the content root. Accept only the supported site,
  collection config and entry paths. Reject traversal, symlinks, submodules
  and writes outside that directory.
- Use Git trees, not the directory Contents endpoint, to enumerate files.
  If a recursive result is truncated, complete enumeration with bounded,
  non-recursive subtree traversal. An incomplete listing is never evidence
  that omitted files were deleted.
- Enforce the existing 1 MB content limit before parsing, including incoming
  GitHub blobs. Malformed content is a Content problem; a transport outage or
  permission error is a source failure, not an invalid file or an empty tree.
- A missing branch is an error. A valid tree with no content directory is an
  empty source only after the repository and branch have been verified.

## Publishing

Keep the slice 3 working-copy and frozen-intent flow. Only its final file write
changes from the local folder to GitHub.

- Extend `ContentCommit` with a message and author metadata. They are currently
  absent from the implemented service, despite appearing in the slice 3 plan.
  Freeze entry attribution with the publish intent so retries do not change it
  when another person resumes publishing or the person's profile changes.
- Proposed attribution: author name `Ann Lee via Venda`, using a configured
  service/noreply email rather than exposing each person's account email in
  git. Leave the committer to the authenticated GitHub App. Do not claim
  cryptographic signing as a requirement of this slice.
- Use `PUT /repos/{owner}/{repo}/contents/{path}` on the configured branch,
  with Base64 content and the expected blob SHA. Omit `sha` only for creation.
  Keep commit messages short: `Publish journal/first-light` or `Update site
  settings`.
- Before a write, compare the current file: the target SHA means the intent
  already succeeded; the base SHA means the conditional write may proceed;
  anything else is `Conflict`. The PUT remains the race guard, not that read.
- On GitHub 409 or 422, re-read the file to distinguish a genuine changed-file
  conflict, already-committed bytes and other GitHub errors. Do not turn every
  validation, branch-protection or rate-limit error into `Conflict`.
- After an uncertain write, re-read before retrying. Equivalent bytes are
  success without a duplicate commit. Never retry by substituting GitHub's
  latest SHA for the copy's expected base.
- Update the derived index immediately on confirmed publication, as today;
  no webhook is required for the author to see their published changes.
- Use at most three attempts within ten seconds for transient failures. Respect
  `Retry-After` and rate-limit reset times: if a required wait exceeds that
  budget, report the failure and retain the intent. Never sleep for a minute
  inside an interactive publish request.
- Autosave and existing indexed reads do not call GitHub. A publishing outage
  preserves the copy and intent and displays a useful, sanitized error.

## Webhooks and durable sync

`POST /api/webhooks/github` is a server integration endpoint, not a browser
session API. It must run before normal content freshness/startup work.

- Read raw bytes under a separate 25 MB webhook cap. Verify
  `X-Hub-Signature-256` with HMAC-SHA256 and Web Crypto verification before
  parsing or changing state. Reject missing, malformed or wrong signatures.
- Decode only the payload fields needed. Check repository ID, installation ID,
  event type and the exact `refs/heads/<branch>` value. Valid but irrelevant
  events are acknowledged without queuing work. Handle signed ping events.
- Persist delivery identity and a source-dirty generation in D1 atomically,
  then acknowledge promptly, within GitHub's ten-second response window.
  Duplicate deliveries are harmless; prune their retained identities.
- A webhook is an invalidation signal, not a trusted file listing. GitHub caps
  push commit arrays, and deliveries may be missed, duplicated or reordered.
  Resolve the current branch from GitHub, not an older delivery's `after` SHA.
  A deleted branch records a source error, not mass deletion of content.
- Persist snapshot identity, enumeration/index cursor, progress, retry time
  and a lease with a monotonically increasing fencing token. Jobs resume after
  isolate termination. D1 owns coordination; an in-memory promise is not a
  cross-isolate lock.
- Each invocation indexes at most 200 files, with a separate external-request
  and wall-time budget. Smaller batches are allowed. Configs precede affected
  entries. Persist continuation work rather than draining `syncAll()` in the
  request that received the webhook.
- Fence all index changes, including deletions and problem records. An expired
  job cannot write after another worker has claimed it. A publish or General
  save advances the source generation atomically with index finalization, so
  an older snapshot cannot overwrite a newer locally confirmed commit.
- Where sync invalidates an entry after a model change, it must not continue
  serving that entry against an obsolete model while its re-read is pending.
  Keep working copies and ownership intact; outside-file changes are surfaced
  by the existing SHA comparison.
- A minute Nitro task resumes outstanding work and checks the branch at a
  slower reconciliation interval (proposed five minutes), using authenticated
  conditional requests where supported. It repairs missed webhooks, including
  on an idle site. Rate-limited jobs defer until the documented retry time.
- Background work after a response is only an optional fast path, not the
  durability mechanism. Cloudflare's `waitUntil` extension is bounded.
- Start GitHub deployments from persisted index state, not a complete remote
  sync in every cold isolate. On first setup, report indexing progress and
  continue in bounded jobs. On outages, retain the last successful index and
  retry later; never mistake a failed listing for a successful empty source.
- Remove the GitHub equivalent of today's per-request remote version check
  and blanket invalidation after any mutation. Auth and autosave mutations do
  not dirty the content source. Publish, General saves, verified webhooks and
  reconciliation request sync explicitly.

The deployed GitHub integration initially targets Workers Paid. The existing
200-file parsing budget is not a promise that it fits Free's CPU and external
subrequest limits. Verify Nitro's task wiring against the pinned version and
its emitted Worker; use the preset's scheduled task support, not a parallel
custom Worker entrypoint.

## API and admin

Add an administrator-only repository contract group and proof-checked core
operations:

- `GET /api/admin/repository`: source kind, safe repository/branch/directory,
  last successful sync, indexed head, pending progress and last sanitized error.
- `POST /api/admin/repository/sync`: request reconciliation or a full index
  rebuild. Return accepted job status, not a long-running HTTP response.
- Coalesce repeated requests. A full rebuild resets derived file markers and
  problems, not users, copies, owners or publish intents.

Settings → Repository is a lazy page in `@venda/views-core`:

- Show the configured source and a clear status: ready, indexing or unable to
  reach the repository. Local and bundled sources have truthful status too.
- Provide Sync now and a confirmed Rebuild index action, plus progress and the
  last failure. Keep the screen description configurable through `site.ts`.
- Do not display credentials, add a GitHub login button or fetch off-origin.
- Existing editor Publish and conflict notices serve the GitHub store too.

## Verification

- **Adapter tests:** JWT claims and signature; Unicode Base64; token renewal
  single-flight; malformed responses; path bounds; snapshot consistency;
  truncated trees; idempotent writes; creation races; lost acknowledgements;
  branch protection; 401, 403, 409, 422, 429 and transient server failures.
- **Core/job tests:** bounded continuation; lease expiry and stale-worker
  fencing; duplicate/out-of-order deliveries; deletions after complete
  enumeration only; model changes; publish racing sync; source failures versus
  content problems; full rebuild keeps operational state.
- **Live workerd suites:** a local GitHub-protocol test server, test RSA keys
  and a signed webhook sender exercise the actual adapter and task flow. Test
  token refresh, publish, outside push, webhook validation, interrupted sync,
  outage/recovery and concurrent publication. No GitHub credentials are needed
  for the normal gate; there is no fake-store branch in production code.
- **Browser suite:** Repository status/actions/progress, publishing through
  the GitHub adapter, conflict notices and autosave during an outage. Continue
  enforcing the admin's same-origin boundary.
- **Real repository contract:** a separately invoked test against a private
  throwaway repository with an installed test App, running the adapter on
  workerd. Verify real token exchange, SHA behaviour, commit attribution,
  outside changes and real signed push delivery to a reachable test endpoint.
  Use a unique test prefix and clean only files created by that test. Explicitly
  authorize repository/App creation and a tunnel before performing them.
- **`try/slice-4.html`:** API console, links to Repository and the editor, and
  pass/fail checks for publish, outside push, conflict, duplicate webhook and
  outage/recovery. A labelled local GitHub simulator is the default; the page
  and admin still present one origin and never expose test credentials. An
  explicit GitHub mode can target only a confirmed throwaway repository.
- Run `pnpm lint:fix`, `pnpm check` and `pnpm e2e` before every commit. Keep the
  function-size, Fallow and Worker bundle gates unchanged.

**Done** when publishing makes a verified real-repository commit, an outside
push reaches the index, sync resumes safely after termination, outages preserve
copies and the last index, Repository explains the state, and the gate, live
suites, real contract test and try page all pass. A missing test App is a
blocker, not permission to declare the slice done with only a simulator.

## Delivery

- Commit 1 (**done**): store snapshot seam, commit metadata, GitHub
  auth/read/write adapter, deterministic workerd contract tests and the
  initial try page.
  - Each source supplies a whole `ContentFileStore`; sync reads a pinned
    snapshot; files over 1 MB become problems without being read.
  - Commit attribution is frozen with the publish intent (`publish_author`).
  - `scripts/github-simulator.mjs`; server tests (25), `pnpm e2e github` (8
    checks on workerd) and `try/slice-4.html` (4 checks) run against it.
  - Change from the plan: the simulator is opt-in, `pnpm try --github`, so
    plain `pnpm try` keeps serving `.try/content` live from disk.
  - Interim until commit 2: a request checks the branch head at most every
    30 seconds, and after writes.
- Commit 2: durable sync jobs, fencing, verified webhook ingress, reconciliation
  task and outage-safe startup, with concurrency and recovery tests.
- Commit 3: repository contract/proofs and Settings → Repository; browser and
  try-page coverage, plus setup documentation.
- Commit 4: real App/repository validation, fixes found there and final
  architecture/roadmap updates.

Repository/App setup and pushing to `origin` are separate authorization
choices.

## Documentation consulted

- [GitHub App JWTs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)
- [Installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [App private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
- [Repository contents API](https://docs.github.com/en/rest/repos/contents)
- [Git trees API](https://docs.github.com/en/rest/git/trees)
- [Webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Nitro Cloudflare tasks](https://nitro.build/deploy/providers/cloudflare)
