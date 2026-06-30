# WooCommerce MCP Server

A small read-only Model Context Protocol server that exposes Mellow Fellow WooCommerce
data to the FlowHunt support agent. Store credentials live in server-side environment
variables, so the agent never sees the WooCommerce keys.

## Tools

All tools are read-only.

- `woo_search_products` - search the catalog by keyword. Returns price, sale price, stock, SKU, categories, short description, link.
- `woo_get_product` - full details for one product by id.
- `woo_find_order` - look up one order by order number AND customer email. Returns the order only when the email matches the order, so it is safe for support identity checks.
- `woo_get_customer_orders` - recent order summaries for a customer email.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `WC_SITE_URL` | yes | Full https URL of the WooCommerce site, e.g. `https://mellowfellow1.wpenginepowered.com`. Falls back to `NEXT_PUBLIC_WORDPRESS_URL` if `WC_SITE_URL` is not set |
| `WC_CONSUMER_KEY` | yes | WooCommerce REST API consumer key (`ck_...`), Read permission is enough |
| `WC_CONSUMER_SECRET` | yes | WooCommerce REST API consumer secret (`cs_...`) |
| `MCP_BEARER_TOKEN` | yes | A long random string. FlowHunt sends it as a Bearer token to authenticate to this server |
| `PORT` | no | Defaults to 3000. Railway sets this automatically |

## 1. Create the WooCommerce REST key

In WordPress admin on the WooCommerce site:

1. WooCommerce, Settings, Advanced, REST API.
2. Add key. Description: `FlowHunt MCP`. User: an admin user. Permissions: `Read`.
3. Generate API key and copy the consumer key (`ck_...`) and consumer secret (`cs_...`). The secret is shown only once.

## 2. Deploy to Railway

1. New service from this repository, root directory `woocommerce-mcp`. Railway builds it with the included Dockerfile.
2. Add the environment variables from the table above. Generate `MCP_BEARER_TOKEN` with `openssl rand -hex 32`.
3. Deploy, then under Settings generate a public domain.
4. Verify it is up: open `https://YOUR-DOMAIN/` and confirm it returns `{"status":"ok"}`.

## 3. Connect in FlowHunt

Workspace Settings, Add MCP Connector:

- Name: `woocommerce`
- URL: `https://YOUR-DOMAIN/mcp`
- Transport: Streamable HTTP
- Authentication: Bearer token, paste the `MCP_BEARER_TOKEN` value.

Save, then attach the connector to the existing agent from the agent configuration drawer.

## Local development

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Notes

- The server only issues GET requests to the WooCommerce REST API, so the REST key needs Read permission only.
- At go-live, change `WC_SITE_URL` to the production WordPress domain and redeploy. Nothing else changes.
