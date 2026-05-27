import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

export const env = {
  shopify: {
    domain: required('SHOPIFY_STORE_DOMAIN'),
    clientId: required('SHOPIFY_CLIENT_ID'),
    clientSecret: required('SHOPIFY_CLIENT_SECRET'),
    apiVersion: process.env.SHOPIFY_API_VERSION || '2026-04',
  },
  wc: {
    url: process.env.WC_API_URL || '',
    key: process.env.WC_CONSUMER_KEY || '',
    secret: process.env.WC_CONSUMER_SECRET || '',
  },
  wp: {
    url: process.env.WP_API_URL || '',
    user: process.env.WP_API_USER || '',
    appPassword: process.env.WP_API_APP_PASSWORD || '',
  },
};
