export interface Config {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  bearerToken: string;
  port: number;
}

export function loadConfig(): Config {
  const siteUrl = process.env.WC_SITE_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;
  const bearerToken = process.env.MCP_BEARER_TOKEN;

  const missing: string[] = [];
  if (!siteUrl) missing.push("WC_SITE_URL");
  if (!consumerKey) missing.push("WC_CONSUMER_KEY");
  if (!consumerSecret) missing.push("WC_CONSUMER_SECRET");
  if (!bearerToken) missing.push("MCP_BEARER_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    siteUrl: siteUrl!.replace(/\/+$/, ""),
    consumerKey: consumerKey!,
    consumerSecret: consumerSecret!,
    bearerToken: bearerToken!,
    port: Number.parseInt(process.env.PORT || "3000", 10),
  };
}
