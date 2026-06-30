import axios, { AxiosInstance } from "axios";
import type { Config } from "./config.js";

export interface WooImage {
  src: string;
}

export interface WooCategory {
  id: number;
  name: string;
}

export interface WooProduct {
  id: number;
  name: string;
  permalink: string;
  type: string;
  status: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  purchasable: boolean;
  stock_status: string;
  stock_quantity: number | null;
  sku: string;
  short_description: string;
  description: string;
  categories: WooCategory[];
  images: WooImage[];
}

export interface WooAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

export interface WooBilling extends WooAddress {
  email: string;
  phone: string;
}

export interface WooLineItem {
  name: string;
  quantity: number;
  total: string;
  sku: string;
}

export interface WooShippingLine {
  method_title: string;
  total: string;
}

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  date_created: string;
  date_paid: string | null;
  total: string;
  shipping_total: string;
  payment_method_title: string;
  customer_note: string;
  billing: WooBilling;
  shipping: WooAddress;
  line_items: WooLineItem[];
  shipping_lines: WooShippingLine[];
}

export class WooCommerceClient {
  private http: AxiosInstance;

  constructor(config: Config) {
    this.http = axios.create({
      baseURL: `${config.siteUrl}/wp-json/wc/v3`,
      timeout: 30000,
      params: {
        consumer_key: config.consumerKey,
        consumer_secret: config.consumerSecret,
      },
      headers: { Accept: "application/json" },
    });
  }

  async searchProducts(
    search: string,
    perPage: number,
    inStockOnly: boolean,
  ): Promise<WooProduct[]> {
    const params: Record<string, unknown> = {
      search,
      per_page: perPage,
      status: "publish",
    };
    if (inStockOnly) params.stock_status = "instock";
    const res = await this.http.get<WooProduct[]>("/products", { params });
    return res.data;
  }

  async getProduct(id: number): Promise<WooProduct | null> {
    try {
      const res = await this.http.get<WooProduct>(`/products/${id}`);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }
  }

  async getOrder(id: number): Promise<WooOrder | null> {
    try {
      const res = await this.http.get<WooOrder>(`/orders/${id}`);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }
  }

  async searchOrders(search: string, perPage: number): Promise<WooOrder[]> {
    const res = await this.http.get<WooOrder[]>("/orders", {
      params: { search, per_page: perPage },
    });
    return res.data;
  }

  async ordersByEmail(email: string, perPage: number): Promise<WooOrder[]> {
    const res = await this.http.get<WooOrder[]>("/orders", {
      params: { search: email, per_page: perPage },
    });
    return res.data;
  }
}
