Migration assets for the Shopify to headless WooCommerce move.

Folder layout

1. `wp/mu-plugins/`, PHP code deployed to WP Engine via GitHub Action on push
2. `wp/acf-product-fields.json`, initial ACF field group, imported once via wp-admin
3. `scripts/`, Node migration scripts that pull from Shopify and push to Woo
4. `data/`, local-only dumps of Shopify data, gitignored

How the deploy works

1. mu-plugins are deployed automatically by `.github/workflows/wpe-deploy.yml` whenever a push to `main` touches `migration/wp/mu-plugins/**`
2. GitHub Action uses `wpengine/github-action-wpe-site-deploy@v3.2.0` to rsync the folder to `wp-content/mu-plugins/` on WP Engine
3. Secret `WPE_SSHG_KEY_PRIVATE` must be set in the repo's GitHub secrets

Order of operations for first time setup

1. Install the WP plugin set listed in the migration plan (already done)
2. Push `migration/wp/mu-plugins/mellow-fellow-cpts.php` to main, GitHub Action deploys it to WP Engine
3. In WP Admin, Custom Fields, Tools, Import Field Groups, upload `wp/acf-product-fields.json` (one-time, then the team manages ACF from wp-admin)
4. Run `npm run migrate:pull` to dump Shopify data into `data/`
5. Run `npm run migrate:products`, `migrate:collections`, `migrate:metaobjects`, `migrate:pages`, `migrate:redirects`
6. Run `npm run migrate:validate` to reconcile counts

What is in the repo vs what is in wp-admin

1. mu-plugins (CPT registration, custom code) → repo, deployed via CI/CD
2. ACF field group schema → managed in wp-admin by the team
3. Plugin install / activate / configure → wp-admin
4. Products, filters, page content → wp-admin
5. Migration scripts → repo
