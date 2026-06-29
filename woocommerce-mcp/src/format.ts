import type { WooOrder, WooProduct } from "./woocommerce.js";

export const CHARACTER_LIMIT = 25000;

export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

export function formatMoney(amount: string | number, currency: string): string {
  const value = typeof amount === "number" ? amount : Number.parseFloat(amount || "0");
  if (Number.isNaN(value)) return `${amount} ${currency}`.trim();
  return `${value.toFixed(2)} ${currency}`.trim();
}

export function formatDate(iso: string | null): string {
  if (!iso) return "n/a";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

export interface ProductSummary {
  id: number;
  name: string;
  url: string;
  price: string;
  regularPrice: string;
  onSale: boolean;
  inStock: boolean;
  stockStatus: string;
  stockQuantity: number | null;
  sku: string;
  categories: string[];
  description: string;
}

export function summarizeProduct(product: WooProduct): ProductSummary {
  return {
    id: product.id,
    name: product.name,
    url: product.permalink,
    price: product.price,
    regularPrice: product.regular_price,
    onSale: product.on_sale,
    inStock: product.stock_status === "instock",
    stockStatus: product.stock_status,
    stockQuantity: product.stock_quantity,
    sku: product.sku,
    categories: (product.categories || []).map((category) => category.name),
    description: truncate(stripHtml(product.short_description || product.description || ""), 400),
  };
}

export interface OrderItemSummary {
  name: string;
  quantity: number;
  total: string;
  sku: string;
}

export interface OrderSummary {
  id: number;
  number: string;
  status: string;
  datePlaced: string;
  datePaid: string;
  total: string;
  currency: string;
  paymentMethod: string;
  shippingMethod: string;
  customerName: string;
  customerEmail: string;
  shipTo: string;
  items: OrderItemSummary[];
  customerNote: string;
}

export function summarizeOrder(order: WooOrder): OrderSummary {
  const billing = order.billing || ({} as WooOrder["billing"]);
  const shipping = order.shipping || ({} as WooOrder["shipping"]);
  const shipParts = [
    `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim(),
    shipping.address_1,
    shipping.address_2,
    `${shipping.city || ""} ${shipping.state || ""} ${shipping.postcode || ""}`.trim(),
    shipping.country,
  ].filter((part) => part && part.length > 0);

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    datePlaced: formatDate(order.date_created),
    datePaid: formatDate(order.date_paid),
    total: formatMoney(order.total, order.currency),
    currency: order.currency,
    paymentMethod: order.payment_method_title || "n/a",
    shippingMethod: (order.shipping_lines && order.shipping_lines[0]?.method_title) || "n/a",
    customerName: `${billing.first_name || ""} ${billing.last_name || ""}`.trim(),
    customerEmail: billing.email || "",
    shipTo: shipParts.join(", "),
    items: (order.line_items || []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      total: formatMoney(item.total, order.currency),
      sku: item.sku,
    })),
    customerNote: order.customer_note || "",
  };
}
