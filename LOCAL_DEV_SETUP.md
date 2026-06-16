# Local Development Setup

## Prerequisites

- **Node.js** v18+ (v23 recommended)
- **npm** v10+
- **Local by Flywheel** — [Download here](https://localwp.com/)
- **Git** with SSH configured for GitHub
- **WPEngine account access** — You need access to the Mellow Fellow WPEngine environment to pull the site

---

## 1. Clone the Repo

```bash
git clone git@github.com:C0ding-K1D/Mellow-Fellow.git
cd Mellow-Fellow
npm install
```

---

## 2. Set Up the WordPress Backend (Local by Flywheel)

We pull a full copy of the production WordPress site from WPEngine into Local by Flywheel. This gives you the real database, products, plugins, and settings — no manual WordPress setup needed.

### Connect Local to WPEngine

1. Open **Local by Flywheel**
2. In the bottom-left corner, click **Connect to WP Engine** (or go to the Connect tab)
3. Log in with your WPEngine credentials
4. You'll see a list of WPEngine sites — find **mellowfellow1** (the production environment)
5. Click **Pull to Local**
6. Local will ask you to name the local site — use `headless-e-comm`
7. Wait for the pull to complete (this downloads the database, files, uploads, and plugins — can take a few minutes)

Once done, your local site will be available at `https://headless-e-comm.local`. You can click **WP Admin** in Local to open the WordPress dashboard and confirm it's working.

### Fix WordPress Core Version (if needed)

WPEngine runs WordPress 7.0 but Local may only have 6.9 available. If the site shows errors after pulling, you need to update the core files:

1. Download WordPress 7.0 from [wordpress.org/download](https://wordpress.org/download/)
2. Extract the zip
3. In your terminal, run:

```bash
# Delete old core folders
rm -rf ~/Local\ Sites/headless-e-comm/app/public/wp-admin
rm -rf ~/Local\ Sites/headless-e-comm/app/public/wp-includes

# Copy fresh WP 7.0 core
cp -R ~/Downloads/wordpress/wp-admin ~/Local\ Sites/headless-e-comm/app/public/
cp -R ~/Downloads/wordpress/wp-includes ~/Local\ Sites/headless-e-comm/app/public/

# Copy root PHP files (NOT wp-config.php)
for f in ~/Downloads/wordpress/*.php; do
  fname=$(basename "$f")
  if [ "$fname" != "wp-config-sample.php" ]; then
    cp "$f" ~/Local\ Sites/headless-e-comm/app/public/
  fi
done
```

4. In Local, stop and restart the site
5. Open WP Admin to confirm it loads

**Important:** Do NOT overwrite `wp-config.php` or the `wp-content` folder — those contain your site's database config, plugins, themes, and uploads.

---

## 3. Deploy mu-plugins to Local

The repo contains custom WordPress plugins that need to be copied into your Local site. These add GraphQL filters, custom post types, payment gateways, and loyalty features that the frontend depends on.

```bash
cp migration/wp/mu-plugins/*.php ~/Local\ Sites/headless-e-comm/app/public/wp-content/mu-plugins/
```

To verify they're in place:

```bash
ls ~/Local\ Sites/headless-e-comm/app/public/wp-content/mu-plugins/mellow-fellow-*
```

You should see:
- `mellow-fellow-cpts.php`
- `mellow-fellow-graphql-filters.php`
- `mellow-fellow-authnet-gateway.php`
- `mellow-fellow-shopify-id.php`
- `mellow-fellow-loyalty-identity.php`
- `mellow-fellow-loyalty-orders.php`
- `mellow-fellow-loyalty-redeem.php`
- `mellow-fellow-loyalty-redemptions.php`

mu-plugins load automatically — no activation needed in WP Admin.

---

## 4. Import ACF Field Group

The frontend queries a set of custom product fields (strain type, cannabinoid, size, etc.) via GraphQL. These fields are defined in an ACF (Advanced Custom Fields) field group that needs to be imported into your local WordPress.

1. In Local, click **WP Admin** to open the WordPress dashboard
2. In the left sidebar, go to **ACF** (or **Custom Fields**) → **Tools**
3. Under the **Import** section, click **Choose File**
4. Navigate to your repo folder and select `migration/wp/acf-product-fields.json`
5. Click **Import**
6. You should see a success message: "Imported: Product Details (Mellow Fellow)"

If this step is skipped, the homepage and product pages will fail to load because the GraphQL queries reference fields that don't exist yet.

---

## 5. Verify ACF Taxonomy GraphQL Names

One of the custom taxonomies has a renamed GraphQL field to avoid a naming conflict. Verify it's set correctly:

1. In WP Admin, go to **ACF** → **Taxonomies**
2. Find **Product Types** and click to edit it
3. Scroll down to the **GraphQL** section
4. Confirm these values:
   - **Show in GraphQL:** Yes
   - **GraphQL Single Name:** `mfProductType`
   - **GraphQL Plural Name:** `mfProductTypes`
5. If they're different, update them and click **Save**

The other taxonomies (Strain Types, Blend Types, Size, MG, Pieces, etc.) should all have **Show in GraphQL** set to **Yes**. Spot-check a few to make sure — if any are set to No, the shop filters won't work for that taxonomy.

---

## 6. Generate WooCommerce REST API Keys

The product recommendations engine (cart drawer cross-sells) needs WooCommerce REST API credentials to look up products by category.

1. In WP Admin, go to **WooCommerce** → **Settings** → **Advanced** tab → **REST API** sub-tab
2. Click **Add key**
3. Fill in:
   - **Description:** `Local dev`
   - **User:** Select any admin user from the dropdown
   - **Permissions:** `Read`
4. Click **Generate API key**
5. You'll see a **Consumer Key** (`ck_...`) and **Consumer Secret** (`cs_...`) — copy both. The secret is only shown once.

You'll paste these into your `.env.local` file in the next step.

---

## 7. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` in your editor and set these values:

```env
# WordPress (Local by Flywheel)
NEXT_PUBLIC_WORDPRESS_URL=https://headless-e-comm.local/
FAUST_SECRET_KEY=<see below>
NEXT_PUBLIC_GRAPHQL_ENDPOINT=/graphql

# Authorize.net (Sandbox — ask the team for these)
NEXT_PUBLIC_AUTHORIZE_API_LOGIN_ID=<ask team>
NEXT_PUBLIC_AUTHORIZE_CLIENT_KEY=<ask team>
AUTHORIZE_TRANSACTION_KEY=<ask team>
NEXT_PUBLIC_AUTHORIZE_ENVIRONMENT=sandbox

# Storage (SQLite for local dev)
STORAGE_TYPE=sqlite
SQLITE_PATH=./data/payment.db

# WooCommerce REST API (paste keys from step 6)
WC_API_URL=https://headless-e-comm.local/wp-json/wc/v3
WC_CONSUMER_KEY=ck_<your key from step 6>
WC_CONSUMER_SECRET=cs_<your secret from step 6>

# Site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME=Mellow Fellow
```

### Finding the Faust Secret Key

1. In WP Admin, go to **Settings** → **Faust**
2. Copy the **Secret Key** value
3. Paste it as `FAUST_SECRET_KEY` in your `.env.local`

### Optional Variables

The `.env.local.example` file lists additional variables for Yotpo (reviews/loyalty), Klaviyo (email), and Shopify (migration). These are optional for local development — the app runs without them, those features just won't work.

---

## 8. Start the Dev Server

Make sure your Local by Flywheel site is running (green circle in Local), then:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

The `NODE_TLS_REJECT_UNAUTHORIZED=0` flag is required because Local by Flywheel uses self-signed SSL certificates that Node.js won't trust by default.

Open **http://localhost:3000** in your browser.

The first page load takes a few seconds because Next.js compiles pages on demand in dev mode. Subsequent page loads are faster.

---

## Project Structure

```
src/
├── components/         # React components
│   ├── CartDrawer/     # Slide-in cart drawer
│   ├── NavBar/         # Top navigation
│   ├── Footer/         # Footer
│   ├── shop/           # Shop sidebar filters, mobile filters
│   ├── checkout/       # Checkout form components
│   └── icons/          # SVG icon components
├── context/            # React contexts (CartContext, YotpoLoyaltyContext)
├── graphql/            # GraphQL queries and mutations
│   ├── queries/        # products, cart, collections, auth
│   └── mutations/      # orders
├── lib/                # Utilities
│   ├── storage/        # SQLite/Redis storage layer
│   ├── middleware/      # Rate limiting, CSRF, idempotency
│   ├── apollo-client.ts
│   ├── authorize-net.ts
│   ├── http.ts
│   ├── validation.ts
│   └── errors.ts
├── pages/              # Next.js pages (Pages Router)
│   ├── api/            # API routes
│   │   ├── shop/       # Products pagination, recommendations
│   │   ├── payment/    # Authorize.net processing
│   │   ├── orders/     # WooCommerce order creation
│   │   └── auth/       # Registration
│   ├── product/[slug]  # Product detail pages
│   ├── shop/           # Shop page with taxonomy filters
│   ├── collections/    # Collection pages
│   ├── checkout.tsx    # Multi-step checkout
│   └── cart.tsx        # Cart page (fallback, drawer is primary)
├── styles/             # SCSS styles
│   ├── globals.scss    # Global styles, design tokens, Bulma config
│   ├── components/     # Component-specific SCSS
│   └── pages/          # Page-specific CSS modules
├── types/              # TypeScript type definitions
├── constants/          # Geography, static data
└── templates/          # Faust.js WP template hierarchy

migration/
├── scripts/            # Shopify → WooCommerce migration scripts
└── wp/
    ├── mu-plugins/     # WordPress mu-plugins (deploy to wp-content/mu-plugins/)
    └── acf-product-fields.json  # ACF field group import file
```

---

## Tech Stack

- **Framework:** Next.js 14 (Pages Router), React 18, TypeScript
- **GraphQL:** Apollo Client 3.x, WPGraphQL + WooGraphQL
- **WP Integration:** Faust.js (`@faustwp/core`)
- **Styling:** Bulma (Sass), CSS Modules, SCSS
- **State:** React Context (CartContext for cart + drawer state)
- **Auth:** Faust.js JWT auth (`useAuth()`, `getApolloAuthClient()`)
- **Payments:** Authorize.net Accept.js (PCI-compliant tokenization)
- **Storage:** SQLite (dev), Redis/ioredis (production on Railway)
- **Deployment:** Railway (frontend), WPEngine (WordPress)

---

## Key Patterns

### GraphQL Clients
- `getClient()` — Server-side Apollo client (used in `getStaticProps`, `getServerSideProps`)
- `getBrowserClient()` — Browser-side client for mutations (uses `/api/graphql` proxy)
- `getApolloAuthClient()` — Authenticated client for logged-in users (Faust.js)

### Cart
- Cart state managed via `CartContext` (`useCart()` hook)
- Cart drawer opens automatically on `addToCart`
- Cart icon in NavBar toggles the drawer
- WooCommerce is the source of truth for all cart data

### Shop Filtering
- Custom ACF taxonomies exposed to GraphQL via `mellow-fellow-graphql-filters.php` mu-plugin
- URL-driven: `/shop?productType=edible&strainType=sativa&sort=newest`
- Server-side filtering via WooGraphQL `where` args

### API Routes
All API routes under `src/pages/api/` are protected with middleware:
- Rate limiting on all endpoints
- CSRF protection on state-changing endpoints
- Idempotency keys on payment/order endpoints

---

## Common Issues

**"Cannot query field X on type ProductDetails"**
→ The ACF field group isn't imported. Go back to step 4 and import it.

**Products not loading / empty homepage**
→ Check that your Local by Flywheel site is running (green circle) and that `NEXT_PUBLIC_WORDPRESS_URL` in `.env.local` matches your Local site URL.

**"Invalid src prop on next/image, hostname not configured"**
→ Your Local site hostname isn't in the image allowlist. Open `next.config.js` and add your hostname to `images.remotePatterns`. Example:
```js
{ protocol: 'https', hostname: 'headless-e-comm.local' }
```

**Shop filters return no results**
→ The `mellow-fellow-graphql-filters.php` mu-plugin isn't deployed. Go back to step 3.

**Site won't load after pulling from WPEngine**
→ WordPress version mismatch. Follow the "Fix WordPress Core Version" section in step 2.

**Autoprefixer module error on dev server start**
→ Run `npm install autoprefixer@latest` to fix corrupted node_modules.

**FAUST_SECRET_KEY errors**
→ Make sure the key in `.env.local` matches what's in WP Admin → Settings → Faust. If the Faust plugin isn't active on your Local site, activate it under Plugins.
