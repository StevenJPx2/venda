---
title: Edge-first content delivery
excerpt: Serving published content from the public API, close to every reader.
tags: [performance, kv]
publishedAt: 2026-09-22T15:36:50Z
---

Published entries are exposed through a tiny public API:

```
GET /api/content/:collection
GET /api/content/:collection/:slug
```

Responses carry `Cache-Control: public, max-age=60`, and every write invalidates the collection's cache key in KV.

## Drafts stay private

Only entries with status *published* are returned. Drafts are visible in the admin and nowhere else.
