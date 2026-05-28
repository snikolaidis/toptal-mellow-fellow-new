Migration assets for the Shopify to headless WooCommerce move.

## Folder layout

1. `wp/mu-plugins/`, PHP code deployed to WP Engine via GitHub Action on push
2. `wp/acf-product-fields.json`, initial ACF field group, imported once via wp-admin
3. `scripts/`, Node migration scripts run from local machine
4. `data/`, local-only dumps of Shopify data, gitignored

## How the WP backend deploy works

1. mu-plugins are deployed automatically by `.github/workflows/wpe-deploy.yml` whenever a push to `main` touches `migration/wp/mu-plugins/**`
2. GitHub Action uses `wpengine/github-action-wpe-site-deploy@v3.2.0` to rsync the folder to `wp-content/mu-plugins/` on the `mellowfellow1` WP Engine environment
3. Secret `WPE_SSHG_KEY_PRIVATE` must be set in the repo's GitHub secrets

## Migration scripts, prerequisites

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `SHOPIFY_STORE_DOMAIN` (xxx.myshopify.com)
   - `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` (from Shopify Dev Dashboard, exchanged for an access token via OAuth client credentials grant)
   - `SHOPIFY_API_VERSION` (defaults to 2026-04)
   - `WC_API_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`
   - `WP_API_URL`, `WP_API_USER`, `WP_API_APP_PASSWORD`
2. Install deps: `npm install`

## Migration scripts, run order

1. `npm run migrate:pull`, pulls everything from Shopify into `data/` as JSONL (shop, locations, collections, metaobjects, pages, blog-articles, redirects, discounts, markets, products via bulk, customers via bulk, orders via bulk)
2. `npm run migrate:pull-collection-products`, separate bulk pull for product-to-collection membership
3. `npm run migrate:collections`, imports collections into Woo product categories
4. `npm run migrate:metaobjects`, imports metaobjects into the matching CPTs
5. `npm run migrate:products`, imports products + variants + ACF metafields (SKU collisions auto-suffix with shopify id)
6. `npm run migrate:assign-categories`, assigns product categories using the collection-products map
7. `npm run migrate:pages`, imports pages into native WP pages
8. `npm run migrate:redirects`, imports redirects into Redirection plugin
9. `npm run migrate:blog-articles`, imports blog articles into native WP posts
10. `npm run migrate:customers -- --limit=N`, optional, sample customers (full set comes via Acumatica connector)
11. `npm run migrate:orders -- --limit=N`, optional, sample most recent orders (full set comes via Acumatica connector)
12. `npm run migrate:validate`, reconciles counts between Shopify and Woo

## Recovery and resume

1. `npm run migrate:resume-bulk customers`, picks up the current bulk operation on Shopify if local polling died mid-pull
2. Each resource tracks status in `data/_state/<resource>.json`
3. Reruns skip resources already marked done
4. To re-pull a single resource, delete its state file or use `--force` on the pull script

## Pull script flags

1. `--force`, ignore done state, re-pull everything
2. `--only=products,collections`, run only specific resources
3. `--stop-on-error`, abort on first error instead of continuing past failures

## What is in the repo vs what is in wp-admin

1. mu-plugins (CPT registration, custom code) → repo, deployed via CI/CD
2. ACF field group schema → managed in wp-admin by the team
3. Plugin install / activate / configure → wp-admin
4. Products, categories, page content, redirects → wp-admin
5. Migration scripts → repo, run from local machine

## Customers and orders: split between scripts and Acumatica

For local testing the scripts can import a sample (`--limit=N` flag). For live, the Acumatica connector (managed by Biztech) handles the ongoing customer and order sync. The migration scripts are not the source of truth for that data.
