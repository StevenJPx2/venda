# @venda/nuxt

Read published content from a [Venda](https://github.com/StevenJPx2/venda) CMS in any Nuxt 4 site. SSR-safe composables, typed entries, and a component for rich-text bodies.

## Setup

```sh
pnpm add @venda/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@venda/nuxt'],
  venda: { apiBase: 'https://api.venda.stevenjohn.co/api' },
});
```

Override the URL per environment with `NUXT_PUBLIC_VENDA_API_BASE`.

## Usage

Everything below is auto-imported.

```vue
<script setup lang="ts">
interface Post { title?: string; excerpt?: string; body?: string }

// Published entries, newest first. `data` defaults to [].
const { data: posts } = await useVendaCollection<Post>('blog', { limit: 3 });

// Sort by a field inside `data`; entries missing it sort last.
const { data: features } = await useVendaCollection('features', { sortBy: 'order' });
</script>

<template>
  <NuxtLink v-for="post in posts" :key="post.id" :to="`/blog/${post.slug}`">
    {{ post.data.title }}
  </NuxtLink>
</template>
```

A single entry resolves to `null` when it doesn't exist or is still a draft, so pages can return a real 404:

```vue
<script setup lang="ts">
const slug = String(useRoute().params.slug);
const { data: post, error } = await useVendaEntry<{ title?: string; body?: string }>('blog', slug);

if (error.value) throw createError({ statusCode: 502, fatal: true });
if (!post.value) throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true });
</script>

<template>
  <h1>{{ post?.data.title }}</h1>
  <VendaContent as="article" :html="post?.data.body" class="prose" />
</template>
```

`<VendaContent>` renders an HTML field from the Venda editor, server-side included. It adds a `venda-content` class for styling and renders nothing when the field is empty. The HTML is **not sanitized**, so only point this module at a Venda instance whose admins you trust.

For fetching outside components (plugins, custom `useAsyncData`), use the underlying client:

```ts
const venda = useVenda();
const entries = await venda.list('blog');
const entry = await venda.get('blog', 'hello-venda'); // rejects with a 404 error if missing
```

## API

| Export | Returns |
| --- | --- |
| `useVendaCollection<T>(collection, { sortBy?, order?, limit? })` | `useAsyncData` result with `VendaEntry<T>[]` |
| `useVendaEntry<T>(collection, slug)` | `useAsyncData` result with `VendaEntry<T> \| null` |
| `useVenda()` | `{ list, get }` promise-based fetchers |
| `<VendaContent :html as?>` | Rendered HTML element |
| `VendaEntry<T>`, `VendaCollectionOptions<T>` | Types, importable from `@venda/nuxt` |

`collection` and `slug` accept refs or getters, so a changing route param refetches automatically.

## Development

```sh
pnpm --filter @venda/nuxt build      # prepare + build to dist/
pnpm --filter @venda/nuxt test       # unit + SSR rendering tests
pnpm --filter @venda/nuxt typecheck
```

The Venda landing site (`apps/landing`) consumes this module from the workspace and serves as its integration test.
