---
title: Modeling content with JSON
excerpt: Evolve your schema without a migration every time.
tags: [modeling]
publishedAt: 2026-09-22T15:36:51Z
---

Every entry stores its fields as a JSON object, so a collection can grow new fields without a database migration.

## A convention, not a cage

The editor treats `title` and `body` specially: title is a plain field and body is rich text saved as HTML. Everything else lives alongside them as ordinary JSON.

1. Create a collection
2. Write entries with the rich-text editor
3. Add extra fields whenever you need them
