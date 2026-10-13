---
title: Hello, Venda
excerpt: Why we built a CMS entirely on Cloudflare.
tags: [announcement, edge]
publishedAt: 2026-09-22T15:36:49Z
---

Venda is a small headless CMS that runs entirely on Cloudflare: **Workers** for the API, **D1** for content, **R2** for media and **KV** for cache.

## Why the edge?

There is nothing to provision and nothing idling. When nobody is reading, it costs close to nothing; when everyone is, it is already close to them.

- No servers or containers to patch
- Content stored in SQLite on D1
- Media served from R2 with zero egress fees

> This page is itself a Venda entry, rendered from the public content API.
