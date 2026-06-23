# Headless ACF Blocks

A standalone mu-plugin that registers custom ACF blocks for the headless
WordPress + Faust.js frontend. Content managers edit pages using these blocks
in the normal WP block editor; the actual frontend rendering happens in React,
in the Faust.js app, using field data pulled in via WPGraphQL.

**Block PHP render callbacks in this plugin only power the WP admin editor
preview.** They do not affect what visitors see. Don't spend time making them
pixel-perfect — they just need to look reasonable enough for an editor to know
what they're looking at.

## Stack this plugin depends on

- ACF Pro
- WPGraphQL
- WPGraphQL for ACF (`wpgraphql-acf`) — **v2.0+** (earlier versions return ACF
  block fields as an unstructured JSON blob instead of typed GraphQL fields)
- WPGraphQL Content Blocks — **v1.2.0+**
- Faust.js **3.0.0** on the frontend, specifically `@faustwp/blocks` for
  mapping block typenames to React components

## Installation

Copy both `headless-acf-blocks.php` and the `headless-acf-blocks/` folder into
`wp-content/mu-plugins/`. WordPress only autoloads files placed **directly**
inside `mu-plugins/`, not subfolders — so both pieces need to be there
side-by-side:

```
wp-content/mu-plugins/
├── headless-acf-blocks.php       ← loader, autoloaded by WP
└── headless-acf-blocks/          ← actual plugin code
```

This is a true mu-plugin (must-use): it's always active, has no
activation/deactivation step, and won't appear in the toggleable Plugins list
(it shows greyed-out under "Must Use").

---

## The full workflow for adding a new block

This is the most important part of this README — follow these steps **in
this order**. Skipping the "confirm in GraphiQL" steps is the single biggest
source of wasted time on this project so far; see "Lessons learned" below for
why.

### 1. Scaffold the block's PHP side

Create a new folder: `headless-acf-blocks/blocks/your-block-name/`, containing:

- **`block.json`** — copy `hero-section/block.json` or
  `sale-countdown-hero/block.json` as a starting point. Change `name`,
  `title`, `description`, and `acf.renderCallback` (point it at a
  namespaced function in your new `render.php`).
- **`render.php`** — a namespaced render function matching
  `renderCallback`. This is editor-preview-only — keep it simple (see the
  two existing blocks for the pattern: pull fields with `get_field()`, echo
  a rough approximation of the content, done).

No changes are needed in `inc/block-loader.php` — it auto-discovers every
folder under `blocks/` that contains a `block.json` and registers it on
`init`. You only touch the loader if you need genuinely new shared
infrastructure (like a new block category).

### 2. Add the ACF field group as local JSON

Add a JSON file to `headless-acf-blocks/acf-json/` (**not** inside the block's
own folder — this plugin's `acf-json/` directory is what ACF reads from and
writes to, configured in `block-loader.php`).

Easiest approach: build the field group in the WP admin UI first (on a
throwaway page/post), since ACF will auto-save it as JSON into this folder
the moment you click Save. Then open that generated file and add the three
GraphQL-specific keys ACF's UI doesn't expose directly:

```json
{
  "show_in_graphql": 1,
  "graphql_field_name": "yourBlockName",
  "map_graphql_types_from_location_rules": 0,
  "graphql_types": ["AcfYourBlockName"]
}
```

**Why `map_graphql_types_from_location_rules: 0` plus an explicit
`graphql_types` array, instead of letting it auto-map:** WPGraphQL for ACF's
automatic location-rule-to-schema mapping is reliable for post type /
taxonomy locations, but is **not reliable for `param: "block"` locations**.
Don't rely on auto-mapping for blocks — always set `graphql_types` explicitly.

The `"AcfYourBlockName"` value is a *guess* at this stage, based on
WPGraphQL's usual PascalCase conversion of `acf/your-block-name`. It has been
right both times we've used this plugin so far — but **don't treat it as
guaranteed until you confirm it in step 3.**

### 3. ⚠️ Confirm the real GraphQL shape in GraphiQL before writing any React

This is the step that's bitten us before — see "Lessons learned." Do not skip
it, and do not write the Faust component first and "fix it later."

1. Add the block to a real page in the editor, fill in some test content, and
   save.
2. In WP Admin → **GraphQL → GraphiQL IDE**, run:

   ```graphql
   query {
     page(id: "2", idType: DATABASE_ID) {
       editorBlocks {
         name
         __typename
         ... on AcfYourBlockName {
           yourBlockName {
             # try the fields you expect, e.g.:
             heading
           }
         }
       }
     }
   }
   ```

   Swap `"2"` for a real page ID, and `AcfYourBlockName` / `yourBlockName` for
   your actual guessed names.
3. **Check `__typename` matches** what you put in `graphql_types`. If it
   doesn't, fix the JSON, not your component — re-save the field group in
   admin (or delete and let ACF re-sync from the JSON file) so the change
   takes effect.
4. **Check every field's actual resolved shape**, especially:
   - **Image fields** resolve as a connection: `{ node { sourceUrl, altText,
     mediaDetails { width height } } }`, not a flat object with `.url`.
   - **Link fields** resolve as `{ url, title, target }`.
   - **Date/time fields** resolve as RFC3339 strings — see the timezone note
     below before trusting this blindly.
   - **Repeater fields** resolve as a plain array of objects with the
     sub-field names as keys.
   - Field names convert from ACF's `snake_case` to GraphQL `camelCase`
     (`background_image` → `backgroundImage`).

Only once you've seen the real response should you write the matching Faust
component and fragment. Guessing the shape and fixing it after the fact in
React is exactly how we lost time earlier in this project.

### 4. Write the Faust.js component

In the frontend repo's `wp-blocks/` folder, create `YourBlockName.js`:

```jsx
import { gql } from '@apollo/client';

export default function YourBlockName(props) {
  const { yourBlockName } = props; // matches graphql_field_name
  // ...render using the CONFIRMED shape from step 3, not a guess
}

YourBlockName.displayName = 'AcfYourBlockName'; // must match __typename exactly

YourBlockName.fragments = {
  key: `AcfYourBlockNameFragment`,
  entry: gql`
    fragment AcfYourBlockNameFragment on AcfYourBlockName {
      yourBlockName {
        # exactly the fields confirmed in step 3
      }
    }
  `,
};
```

Register it in `wp-blocks/index.js`:

```js
import { CoreBlocks } from '@faustwp/blocks';
import YourBlockName from './YourBlockName';

export default {
  ...CoreBlocks,
  AcfYourBlockName: YourBlockName, // key = __typename, confirmed in step 3
};
```

### 5. Add the fragment to every page query that might use this block

This is a manual, per-page step — **there is no automatic "include all
blocks" mechanism**, and we deliberately don't use one (see "Lessons
learned"). For each page template/query that should support this block:

```js
const GET_PAGE = gql`
  ${blocks.AcfYourBlockName.fragments.entry}
  query GetPage($slug: ID!) {
    page(id: $slug, idType: URI) {
      editorBlocks(flat: false) {
        name
        __typename
        id: clientId
        parentClientId
        ...${blocks.AcfYourBlockName.fragments.key}
        # ...plus every other block fragment this page supports
      }
    }
  }
`;
```

**If you forget this step**, the block will come back from GraphQL with only
`name`/`__typename`/`id`/`parentClientId` and no actual field data — and
depending on which Faust block component is involved, this can surface as a
confusing, unrelated-looking error rather than a clean "missing field"
message. If you ever see `useBlocksTheme hook was called outside of context`
and the provider is clearly already set up correctly, check this first.

---

## Lessons learned (read this before debugging weird errors)

A few real issues came up building this plugin's first two blocks, worth
knowing about up front so you don't lose time re-discovering them:

**"Cannot query field X on type Y" for `CoreButton` / `CoreHeading`.**
There's a known upstream bug where `@faustwp/blocks`'s bundled fragments for
`CoreButton` and `CoreHeading` request a `textAlign` field that some versions
of `wp-graphql-content-blocks` renamed to plain `align`. This isn't something
to fix per-page — if you hit it, the actual fix is overriding those two block
components in `wp-blocks/` with corrected fragments (see Faust's "Customize
Blocks Rendering" docs for the override pattern). For now, our pages avoid
this by not relying on those two specific bundled components.

**Don't build a "spread every block's fragment automatically" helper for page
queries.** We tried this — it's tempting, since `wp-blocks/index.js` already
has every block in one object, so you can loop over it and merge every
fragment into one query. It works mechanically, but it means *any* block
anywhere in the app with a broken or version-mismatched fragment (like the
`CoreButton`/`CoreHeading` issue above) breaks *every* page that uses the
helper, even pages that never render that block. Manually listing only the
blocks an individual page actually uses, the way Faust's own docs do it, is
more typing but contains the blast radius of any one block's problems to the
pages that actually use it.

**Interpolating an array of `gql`-tagged fragment documents directly into
another `gql` template string does not work.** Apollo's `gql` tag doesn't
flatten arrays — it stringifies them, and you'll get `GraphQLError: Syntax
Error: Unexpected "["`. If you ever need to combine fragments programmatically
rather than spreading them one-by-one, merge the parsed `definitions` arrays
on the AST directly, not via string interpolation of an array.

**`date_time_picker` fields and timezones — read this before building
anything with a date field.** ACF's `date_time_picker` stores a plain
`Y-m-d H:i:s` string in the database with **no timezone attached at all**.
WPGraphQL for ACF resolves it as an RFC3339 string, which is good — but
**always confirm in GraphiQL that the offset in that string actually matches
this site's configured timezone** (Settings → General → Timezone), not a
bare `+00:00`. If you need to do this conversion yourself in PHP (e.g. in a
render callback), use `wp_timezone()` — never `date_default_timezone_set()`,
which WordPress core doesn't reliably honor since WP 5.3.

---

## Existing blocks in this plugin (as of writing)

### `hero-section` (`AcfHeroSection`)
Simple flat fields: heading, subheading, background image, one CTA link.
Good reference for a straightforward block.

### `sale-countdown-hero` (`AcfSaleCountdownHero`)
More involved: a repeater field (sale tiers), three responsive image fields
(mobile/tablet/desktop, rendered as a real `<picture>` element on the
frontend), two CTA buttons, and a `date_time_picker`-driven client-side
countdown timer that hides the whole block once the target time passes.
Converted from a Shopify Liquid theme section — the React component's DOM
structure and class names deliberately mirror the original Liquid markup
class-for-class (`responsive-banner__wrapper`, `countdown-timer__unit`,
etc.) with **no styles defined in the component itself**, since the Sass for
this block is being migrated separately from the Shopify theme. Good
reference for a block with a repeater, multiple images, and non-trivial
client-side behavior.

---

## Folder structure

```
headless-acf-blocks/
├── inc/
│   └── block-loader.php                 Auto-discovers and registers every
│                                          block.json under blocks/. Also
│                                          registers the "headless-blocks"
│                                          inserter category and points ACF's
│                                          local JSON save/load here.
├── blocks/
│   ├── hero-section/
│   │   ├── block.json
│   │   └── render.php
│   └── sale-countdown-hero/
│       ├── block.json
│       └── render.php
└── acf-json/
    ├── group_hero_section.json          ACF field groups, version-controlled.
    └── acf-sale-countdown-hero.json     ACF reads/writes here automatically.
```

## Open questions / TODO

Things that are known, named, and deliberately left unresolved — not
forgotten, just out of scope for now. Worth checking this list before
starting related work, and updating it as items get resolved.

- **`CoreButton` / `CoreHeading` `textAlign`/`align` mismatch is still
  unpatched.** We've avoided it so far by not relying on those two bundled
  Faust components on any page. If a future page needs a real `CoreButton`
  or `CoreHeading` rendered from typed GraphQL fields (not the
  `renderedHtml` fallback), this will need a proper fix: override those two
  components in `wp-blocks/` with corrected fragments using `align`, per
  Faust's "Customize Blocks Rendering" docs. Re-check whether the upstream
  `wp-graphql-content-blocks` issue has since been fixed in a newer plugin
  version before doing this — it may no longer be necessary.

- **`src/pages/pages/[slug].tsx` still renders blocks via `renderedHtml`
  (raw PHP output), not typed Faust components.** This works, but it means
  any block whose real frontend presentation should come from React (like
  `hero-section` or `sale-countdown-hero`) won't look right if it's ever
  added to a generic WP page going through this route — it'll fall back to
  whatever the block's PHP `render.php` preview markup produces, which is
  only meant to be an admin-preview approximation, not real frontend output.
  Decide at some point whether to migrate `[slug].tsx` + `ContentPage.tsx`
  to typed `editorBlocks` fields + `WordPressBlocksViewer`, matching the
  pattern used in one-off pages like `mellow-day-2026.tsx`. This is a
  bigger, deliberate decision (affects every page using this route) — not
  something to do incidentally while building an unrelated block.

- **No second "sale is live" state for `sale-countdown-hero`.** The original
  Shopify section swapped to a different hero once the countdown reached
  zero (`_sale-live-hero`, never ported). The current block just hides
  itself at zero instead. Revisit if a future sale needs a "shop now, sale
  is live" state rather than disappearing entirely.

- **`sale-countdown-hero` has no styles of its own** — by design, since
  Sass is being migrated from the Shopify theme separately. Until that
  migration lands, this block will render completely unstyled (plain
  stacked divs) on any page it's added to. Don't add it to a real page
  before the corresponding Sass is in place, or coordinate timing with
  whoever's doing that migration.

- **`sale-countdown-hero`'s `date_time_picker` → RFC3339 timezone offset
  has only been reasoned about, not independently verified against a live
  query showing a non-UTC site timezone.** Confirm once with a WP install
  actually configured to a non-UTC timezone that the offset in the
  GraphQL-returned string is correct, not just structurally well-formed.



This plugin points ACF's local JSON save/load paths at its own `acf-json/`
folder (see `block-loader.php`), not the theme's default one. This means:

- If you edit a field group in the WP admin, ACF **auto-saves** the change
  back to the matching JSON file here — commit that change to git.
- If you edit the JSON file directly and reload the field group screen in
  admin, ACF picks up the change automatically.
- **Don't hand-edit `key` values** (`group_hero_section`, `field_hero_heading`,
  etc.) once a block is in use in real content — ACF uses these as stable
  identifiers, and changing them orphans existing field data on pages that
  already use the block.
