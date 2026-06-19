# Headless ACF Blocks

A standalone mu-plugin that registers custom ACF blocks for the headless WordPress
+ Faust.js frontend. Block PHP render callbacks only power the **WP admin editor
preview** — the live frontend is rendered separately by the Faust.js React app,
using ACF field data pulled in via WPGraphQL.

## Requirements

- ACF Pro
- WPGraphQL
- WPGraphQL for ACF (`wpgraphql-acf`) — **v2.0+** (earlier versions don't support
  ACF Blocks properly; you'll get an unstructured JSON blob instead of typed fields)
- WPGraphQL Content Blocks — **v1.2.0+**

## Installation

1. Copy both `headless-acf-blocks.php` and the `headless-acf-blocks/` folder into
   `wp-content/mu-plugins/`. WordPress only autoloads files placed directly inside
   `mu-plugins/`, not subfolders, so both pieces need to be there:

   ```
   wp-content/mu-plugins/
   ├── headless-acf-blocks.php       ← loader, autoloaded by WP
   └── headless-acf-blocks/          ← actual plugin code
   ```

2. That's it — mu-plugins load automatically, there's no activation step.

## Adding a new block

1. Create a new folder under `headless-acf-blocks/blocks/your-block-name/`.
2. Add a `block.json` (copy `hero-section/block.json` as a starting point and
   change `name`, `title`, `description`, `renderCallback`).
3. Add a `render.php` with a namespaced render function matching the
   `renderCallback` value in your `block.json`.
4. Add an ACF field group as JSON in `acf-json/`, with:
   - `location` → `param: "block"`, `value: "acf/your-block-name"`
   - `show_in_graphql: 1`
   - `graphql_field_name` set to whatever you want the field group exposed as
   - `map_graphql_types_from_location_rules: 0` and an explicit `graphql_types`
     array (see note below on why this matters for blocks specifically)

No changes are needed in `inc/block-loader.php` — it auto-discovers every folder
under `blocks/` that contains a `block.json`.

## ⚠️ Important: confirm the GraphQL type name before building any frontend code

WPGraphQL for ACF's automatic location-rule-to-schema mapping is reliable for
post type / taxonomy locations, but **block locations need the `graphql_types`
field set explicitly** — don't rely on it being auto-derived.

The `"AcfHeroSection"` value used in `acf-json/group_hero_section.json` is a
reasonable guess based on WPGraphQL's typical PascalCase conversion of
`acf/hero-section`, but **this is not guaranteed and must be confirmed**, not
assumed. After activating, always:

1. Go to **GraphQL → GraphiQL IDE** in the WP admin.
2. Open the schema docs panel and search for "Hero" (or your block's name) to
   find the actual generated type name.
3. Alternatively, add the block to a real page, save, and run:

   ```graphql
   query {
     page(id: "2", idType: DATABASE_ID) {
       editorBlocks {
         name
         __typename
       }
     }
   }
   ```

   The `__typename` value returned for your block is the authoritative type
   name. If it doesn't match what's in `graphql_types` in your field group
   JSON, update the JSON to match and re-save the field group in the admin
   (or delete + let ACF re-sync from JSON) — then the field group's data will
   actually attach to the right block type in the schema.

Only once this is confirmed should you write the matching Faust.js block
component and GraphQL fragment, since the Faust component's key must exactly
match this `__typename`.

## Folder structure

```
headless-acf-blocks/
├── inc/
│   └── block-loader.php       Auto-discovers and registers every block.json
│                               under blocks/. Also registers the
│                               "headless-blocks" inserter category and
│                               points ACF's local JSON save/load here.
├── blocks/
│   └── hero-section/
│       ├── block.json          Block metadata + ACF registration config
│       └── render.php          Minimal editor-preview-only render callback
└── acf-json/
    └── group_hero_section.json ACF field group, version-controlled
```

## A note on ACF local JSON sync

This plugin points ACF's local JSON save/load paths at its own `acf-json/`
folder (see `block-loader.php`). This means:

- If you edit a field group in the WP admin, ACF will **auto-save** the
  change back to the matching JSON file in this folder — commit that change.
- If you edit the JSON file directly and reload the field group screen in
  admin, ACF will pick up the change automatically.
- Don't hand-edit the `key` values (`group_hero_section`, `field_hero_heading`,
  etc.) once a block is in use — ACF uses these as stable identifiers, and
  changing them will orphan existing field data.
