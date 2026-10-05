# Venda redesign

Venda is a writing tool first and a content database second. Writers and
editors use it every day; developers set it up occasionally. The product, the
admin and the architecture follow from that split.

## Principles

1. **Writing is the primary task.** Opening Venda lands on content, not
   statistics. The editor is a full-width canvas; everything that is not the
   words lives in one settings panel.
2. **The shape of content decides the interface.** A blog post, a home page
   and an author record are edited differently, so each collection declares
   its kind and gets the screen that fits it.
3. **Setup is separate from writing.** Data models, team, tokens and
   integrations live under Settings. Writers never see schema controls.
4. **Quiet by default.** One accent colour, neutral greys, no cards inside
   cards, no per-row button bars. Status and metadata are text, not badges.
   Actions appear on hover, in menus or by keyboard.
5. **Every screen works at 390px.** Content first; navigation collapses.

## Content model

Each collection has a **kind**. The kind is chosen when the collection is
created and drives the admin; storage, the API and permissions are identical
for all kinds.

| Kind | For | List | Editor |
| --- | --- | --- | --- |
| `posts` | Dated, listed writing (blog, news, changelog) | Ghost-style list: title, author, date, status | Writing canvas + settings panel |
| `pages` | Standalone pages (About, Pricing) | List | Writing canvas + settings panel |
| `single` | One-of-a-kind content (Home, Site settings) | None: the nav item opens the form | Form |
| `records` | Structured data (Authors, Products, FAQs) | Table with chosen columns | Form, in a side sheet |

`posts` and `pages` require a title field and a rich-text body. A `single`
collection holds exactly one entry with the slug `main`.

```json
{ "name": "Blog", "slug": "blog", "kind": "posts", "schema": { "fields": [ … ] } }
```

Fields gain an **editor placement** in `posts` and `pages`: `canvas` (the
title, the body and the feature image above the title) or `panel` (everything
else). Placement is derived from the field interface and is not configured.

## Admin structure

```
┌────────────────────┬──────────────────────────────────────────┐
│ ◆ Site name        │                                          │
│                    │  Posts                     ⌕  [New post]  │
│ Posts            ● │  All · Drafts · Scheduled · Published     │
│ Pages              │  ──────────────────────────────────────── │
│                    │  Why we moved our CMS to the edge         │
│ Home               │  Ann · 4 Oct                  Published   │
│ Site settings      │  ──────────────────────────────────────── │
│                    │  Roadmap for the autumn                   │
│ Authors            │  Ann · edited 2h ago              Draft   │
│ Products           │                                          │
│                    │                                          │
│ Media              │                                          │
│ ────────────────── │                                          │
│ Settings           │                                          │
│ ○ Ann Lee          │                                          │
└────────────────────┴──────────────────────────────────────────┘
```

- **Navigation** groups collections by kind: writing (`posts`, `pages`), then
  `single`, then `records`, then Media. Settings and the account sit at the
  bottom. There is no dashboard; `/` opens the first writing collection.
- **Lists** are whole-row links. Filters are tabs (All, Drafts, Scheduled,
  Published, Trash) and search is in the header. Row actions (duplicate,
  trash) live in a hover menu and in the editor.
- **Records** show a table whose columns are the collection's first
  half-width fields; a row opens the form in a side sheet.
- **Media** is its own section: a grid with upload, search and details.
- **Settings**: General (site name, URL), Collections (create, edit data
  models), Team (users, invitations), API tokens. Only administrators see
  Collections and Team.

## Editor

```
┌──────────────────────────────────────────────────────────────┐
│ ← Posts          Draft · Saved        Preview  Publish   ⚙   │
├──────────────────────────────────────────┬───────────────────┤
│                                          │ Post settings     │
│        [ feature image ]                 │                   │
│                                          │ URL  /roadmap     │
│        Roadmap for the autumn            │ Publish date      │
│                                          │ Excerpt           │
│        Scheduled publishing, webhooks    │ Tags              │
│        and an MCP server…                │ Featured          │
│                                          │                   │
│        +                                 │ History · Trash   │
└──────────────────────────────────────────┴───────────────────┘
```

- The title is a 40px headline; the body has no frame, no fixed toolbar and
  no label. Formatting appears on selection; `+` and `/` insert blocks.
- The settings panel (⚙) is a persistent right column on wide screens and a
  sheet on narrow ones. It holds the URL, scheduling, every `panel` field,
  and links to history and the trash. It replaces the fields section, the
  entry-settings drawer and the separate history button.
- The top bar shows one status string and at most two actions: Preview and
  the primary publishing action (Publish, Publish changes, or Schedule when a
  publish date is set in the future).

## Visual system

| Token | Value |
| --- | --- |
| Accent | Ghost-like green, `#15803d` (dark mode `#4ade80`) |
| Neutrals | Zinc scale; text `zinc-900`, secondary `zinc-500`, lines `zinc-200` |
| UI type | Inter, 14px base, 500 for labels, 600 for headings |
| Editor type | Title 40/48 bold; body 18/32; max width 680px |
| Radius | 6px controls, 10px sheets; no shadows except sheets and menus |
| Density | 40px rows in lists and nav; 56px top bars |

Status is a coloured dot plus text (Published green, Scheduled blue, Draft
grey, Unpublished changes amber). Destructive actions are red text, never red
filled buttons outside confirmations. Dark mode follows the system.

## Craft standards

Drawn from Emil Kowalski's design-engineering skills (`emil-design-eng`,
`apple-design`, `review-animations`, `break-ui`). Every screen is reviewed
against them before it ships.

**Motion**

| Rule | Value |
| --- | --- |
| Should it animate? | Not keyboard-triggered actions, not things seen 100+ times a day (list navigation, the command palette, switching collections). Sheets, popovers and toasts animate. |
| Easing | Entering and exiting: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. Sheets: `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Moving on screen: `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`. Never `ease-in`. |
| Duration | Press 120ms; tooltips and popovers 150–200ms; sheets 240ms. Nothing in the UI over 300ms. Exits are faster than entrances, except ambient exits the user isn't watching: chrome fading while you type leaves over 280ms and returns in 150ms. |
| Properties | `transform` and `opacity` only; never `transition: all`. |
| Entrances | From `scale(0.97)` plus `opacity: 0`, never from `scale(0)`. Popovers scale from their trigger (`transform-origin` on the trigger side); dialogs stay centred. |
| Press feedback | Every pressable element scales to `0.97` on `:active`. |
| Hover | Only behind `@media (hover: hover) and (pointer: fine)`. |
| Interruptible | Transitions, not keyframes, for anything that can be toggled quickly. |
| Reduced motion | Slides become short opacity fades; `prefers-reduced-transparency` makes translucent chrome solid. |

**Type**

- Tracking depends on size: headings `-0.022em`, the 40px title `-0.025em`,
  body `0`, small caps labels `+0.04em`. Leading tightens as size grows
  (title 1.15, body 1.7, UI 1.45).
- Hierarchy comes from weight and size together; one heading weight (600).
- Numbers that change (word count, dates in lists) use `tabular-nums`.

**Materials**

- Sticky chrome is translucent (`backdrop-filter`) with content scrolling
  under it, and gains its hairline only once content scrolls beneath it.
- A parallel panel (entry settings) has no scrim; a blocking task (confirm
  delete) dims the page.

**Worst-case data**

Lists, nav and the editor are checked with long unbroken titles, 60-character
slugs, one-letter names, non-Latin text, 1,000+ entries and empty states
before they are considered done.

## Architecture changes

- **Collection kinds** add a `kind` column (default `records` for existing
  collections, `posts` for collections with a title and rich-text body) and a
  `single` invariant enforced by the API.
- **Lists are queried server-side.** `GET /api/collections/:id/entries`
  gains `status`, `q`, `sort` and cursor pagination, so lists stay fast past
  hundreds of entries and the client stops filtering.
- **Authors on entries.** List rows and the API return the creator's display
  name, so lists can show "Ann · 4 Oct" without the admin-only users endpoint.
- **Media gets a list endpoint** (`GET /api/media` with paging) and records
  alt text, so the Media section and image pickers browse existing uploads.
- **The admin is rebuilt** as a fresh Nuxt UI app with its own small
  component set (nav, list row, status, settings panel, sheet). Nuxt UI's
  theme is configured to the tokens above; dashboard templates and stat
  cards are not used.
- The core, permissions, rich text and lifecycle are kept: they are not what
  makes the admin look wrong, and the new screens use them unchanged.

## Delivery

1. Visual system and shell: theme tokens, nav, settings area, empty states.
2. Posts and pages: list, editor, settings panel; live suites updated.
3. `single` and `records` kinds: form, table, side sheet.
4. Media section and image picker.
5. Settings: general, collections (data model editor rebuilt), team, tokens.
6. Mobile pass and dark mode; screenshot review of every screen at 1440 and 390.

The roadmap's remaining feature steps continue on this foundation.

## Open questions

- Should `posts` show the author by default, or only when a collection has
  more than one writer?
- Is green the accent, or should Venda have its own brand colour?
