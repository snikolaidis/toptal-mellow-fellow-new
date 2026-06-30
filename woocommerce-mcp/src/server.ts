import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import { z } from "zod";
import type { WooCommerceClient, WooOrder } from "./woocommerce.js";
import {
  CHARACTER_LIMIT,
  OrderSummary,
  ProductSummary,
  summarizeOrder,
  summarizeProduct,
  truncate,
} from "./format.js";

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function textResult(text: string, structured?: Record<string, unknown>): ToolResult {
  const safeText = truncate(text, CHARACTER_LIMIT);
  return structured
    ? { content: [{ type: "text", text: safeText }], structuredContent: structured }
    : { content: [{ type: "text", text: safeText }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      switch (error.response.status) {
        case 401:
        case 403:
          return "Error: WooCommerce rejected the request. Check the consumer key and secret have Read permission.";
        case 404:
          return "Error: Not found. Check the id or search term is correct.";
        case 429:
          return "Error: Rate limited by WooCommerce. Please retry shortly.";
        default:
          return `Error: WooCommerce request failed with status ${error.response.status}.`;
      }
    }
    if (error.code === "ECONNABORTED") return "Error: The WooCommerce request timed out.";
    return "Error: Could not reach the WooCommerce site.";
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

function renderProductLine(product: ProductSummary): string {
  const price = product.onSale
    ? `${product.price} (was ${product.regularPrice})`
    : product.price;
  const stock = product.inStock ? "in stock" : product.stockStatus.replace(/_/g, " ");
  const lines = [
    `## ${product.name} (id ${product.id})`,
    `- Price: ${price}`,
    `- Availability: ${stock}`,
  ];
  if (product.sku) lines.push(`- SKU: ${product.sku}`);
  if (product.categories.length > 0) lines.push(`- Categories: ${product.categories.join(", ")}`);
  if (product.description) lines.push(`- ${product.description}`);
  lines.push(`- Link: ${product.url}`);
  return lines.join("\n");
}

function renderOrder(order: OrderSummary): string {
  const lines = [
    `Order ${order.number} (id ${order.id})`,
    `- Status: ${order.status}`,
    `- Placed: ${order.datePlaced}`,
    `- Paid: ${order.datePaid}`,
    `- Total: ${order.total}`,
    `- Payment: ${order.paymentMethod}`,
    `- Shipping method: ${order.shippingMethod}`,
    `- Customer: ${order.customerName} (${order.customerEmail})`,
  ];
  if (order.shipTo) lines.push(`- Ship to: ${order.shipTo}`);
  if (order.items.length > 0) {
    lines.push("- Items:");
    for (const item of order.items) {
      lines.push(`  - ${item.quantity} x ${item.name} = ${item.total}`);
    }
  }
  if (order.customerNote) lines.push(`- Customer note: ${order.customerNote}`);
  return lines.join("\n");
}

async function findOrder(
  client: WooCommerceClient,
  orderNumber: string,
  email: string,
): Promise<WooOrder | null> {
  const wanted = orderNumber.trim();
  const emailLc = email.trim().toLowerCase();
  const candidates: WooOrder[] = [];

  if (/^\d+$/.test(wanted)) {
    const byId = await client.getOrder(Number.parseInt(wanted, 10));
    if (byId) candidates.push(byId);
  }
  if (candidates.length === 0) {
    const found = await client.searchOrders(wanted, 10);
    candidates.push(...found);
  }

  return (
    candidates.find(
      (order) =>
        (order.billing?.email || "").toLowerCase() === emailLc &&
        (String(order.id) === wanted || (order.number || "") === wanted),
    ) || null
  );
}

export function createServer(client: WooCommerceClient): McpServer {
  const server = new McpServer({ name: "woocommerce-mcp-server", version: "1.0.0" });

  server.registerTool(
    "woo_search_products",
    {
      title: "Search WooCommerce products",
      description:
        "Search the published product catalog by keyword. Returns name, price, sale price, stock availability, SKU, categories, a short description, and the product link. Use this to answer questions about whether a product exists, its price, or whether it is in stock.",
      inputSchema: {
        query: z
          .string()
          .min(1, "query is required")
          .max(200)
          .describe("Keyword to search product names and descriptions, e.g. 'gummies' or 'sleep'"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum number of products to return (default 10)"),
        in_stock_only: z
          .boolean()
          .default(false)
          .describe("When true, only return products currently in stock"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit, in_stock_only }) => {
      try {
        const products = await client.searchProducts(query, limit, in_stock_only);
        if (products.length === 0) {
          return textResult(`No products found matching '${query}'.`);
        }
        const summaries = products.map(summarizeProduct);
        const text = [
          `Found ${summaries.length} product(s) matching '${query}':`,
          "",
          ...summaries.map(renderProductLine),
        ].join("\n");
        return textResult(text, { count: summaries.length, products: summaries });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    },
  );

  server.registerTool(
    "woo_get_product",
    {
      title: "Get one WooCommerce product",
      description:
        "Get full details for a single product by its numeric WooCommerce id. Returns price, sale price, stock availability and quantity, SKU, categories, description, and the product link.",
      inputSchema: {
        product_id: z
          .number()
          .int()
          .positive()
          .describe("The numeric WooCommerce product id"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ product_id }) => {
      try {
        const product = await client.getProduct(product_id);
        if (!product) {
          return textResult(`No product found with id ${product_id}.`);
        }
        const summary = summarizeProduct(product);
        return textResult(renderProductLine(summary), { product: summary });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    },
  );

  server.registerTool(
    "woo_find_order",
    {
      title: "Find an order by number and email",
      description:
        "Look up a single order using both its order number and the customer email. The order is only returned when the email on the order matches the email provided, so it is safe to use for customer support identity checks. Returns order status, dates, total, payment and shipping method, items, and shipping address. If no order matches both values, it returns a not-found message.",
      inputSchema: {
        order_number: z
          .string()
          .min(1, "order_number is required")
          .max(60)
          .describe("The order number the customer gives, e.g. '1042'"),
        email: z
          .string()
          .email("email must be a valid email address")
          .describe("The customer email that must match the order's billing email"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ order_number, email }) => {
      try {
        const order = await findOrder(client, order_number, email);
        if (!order) {
          return textResult(
            `No order found that matches order number '${order_number}' and email '${email}'. Ask the customer to confirm both values.`,
          );
        }
        const summary = summarizeOrder(order);
        return textResult(renderOrder(summary), { order: summary });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    },
  );

  server.registerTool(
    "woo_get_customer_orders",
    {
      title: "List a customer's recent orders",
      description:
        "List recent orders associated with a customer email, most useful for order-history questions. Returns a short summary of each order: number, status, date, and total. Use woo_find_order to confirm the details of a specific order.",
      inputSchema: {
        email: z
          .string()
          .email("email must be a valid email address")
          .describe("The customer email to search orders for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe("Maximum number of orders to return (default 5)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ email, limit }) => {
      try {
        const emailLc = email.trim().toLowerCase();
        const orders = await client.ordersByEmail(email, limit);
        const matching = orders.filter(
          (order) => (order.billing?.email || "").toLowerCase() === emailLc,
        );
        if (matching.length === 0) {
          return textResult(`No orders found for '${email}'.`);
        }
        const summaries = matching.map(summarizeOrder);
        const text = [
          `Found ${summaries.length} order(s) for '${email}':`,
          "",
          ...summaries.map(
            (order) =>
              `- Order ${order.number} (id ${order.id}) - ${order.status} - ${order.datePlaced} - ${order.total}`,
          ),
        ].join("\n");
        return textResult(text, { count: summaries.length, orders: summaries });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    },
  );

  return server;
}
