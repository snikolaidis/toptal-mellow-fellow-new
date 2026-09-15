import { Fragment, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import AccountGuard from '@/components/account/AccountGuard';

interface LineItemMeta {
  key?: string | null;
  value?: string | null;
}

interface LineItem {
  quantity: number;
  total: string;
  subtotal?: string;
  metaData?: LineItemMeta[];
  // Used by groupOrderLineItems() to suppress a mystery bundle's
  // per-component rows entirely (see isMysteryGroup).
  bbMode?: 'fixed' | 'mystery' | null;
  product?: {
    node?: {
      name?: string;
      slug?: string;
      image?: { sourceUrl?: string; altText?: string };
    };
  };
}

interface BundleGroupDisplay {
  key: string;
  name: string;
  quantity: number;
  discountedTotal: number;
  originalTotal: number;
  items: LineItem[];
  image?: { sourceUrl?: string; altText?: string };
}

function getMeta(item: LineItem, key: string): string | undefined {
  return item.metaData?.find((m) => m.key === key)?.value || undefined;
}

function toAmount(value?: string): number {
  return value ? parseFloat(value.replace(/[^0-9.-]/g, '')) || 0 : 0;
}

/**
 * Regroups a flat order line-item list back into bundle sets, mirroring the
 * cart/checkout's bundle display — see mellow-fellow-create-order.php for
 * where the 'Bundle'/_bb_group_key/_bb_group_original_total meta this reads
 * gets written. Orders placed before that meta existed only have 'Bundle'
 * (the display name), so they fall back to grouping by name alone — a
 * best-effort merge rather than the precise per-purchase grouping a real
 * group key gives.
 */
function groupOrderLineItems(items: LineItem[]): { bundleGroups: BundleGroupDisplay[]; standalone: LineItem[] } {
  const groupsByKey: Record<string, { name: string; items: LineItem[] }> = {};
  const standalone: LineItem[] = [];

  items.forEach((item) => {
    const bundleName = getMeta(item, 'Bundle');
    if (!bundleName) {
      standalone.push(item);
      return;
    }
    const groupKey = getMeta(item, '_bb_group_key') || `bundle-name:${bundleName}`;
    if (!groupsByKey[groupKey]) {
      groupsByKey[groupKey] = { name: bundleName, items: [] };
    }
    groupsByKey[groupKey].items.push(item);
  });

  const bundleGroups: BundleGroupDisplay[] = Object.entries(groupsByKey).map(([key, { name, items: groupItems }]) => {
    const discountedTotal = groupItems.reduce((sum, i) => sum + toAmount(i.total), 0);
    // A "fixed" bundle's curated original price is recorded once per group as
    // _bb_group_original_total (already the full group total, not per-unit —
    // see checkout.tsx). A "byob" bundle has no such value; its line items'
    // own subtotal (pre-discount) already sums to the right original total.
    const fixedOriginalTotal = groupItems
      .map((i) => getMeta(i, '_bb_group_original_total'))
      .find((v) => v != null);
    const originalTotal = fixedOriginalTotal != null
      ? toAmount(fixedOriginalTotal)
      : groupItems.reduce((sum, i) => sum + toAmount(i.subtotal ?? i.total), 0);
    // Bundle's own quantity, from _bb_group_set_count; falls back to summed
    // component quantities for orders placed before that meta existed.
    const setCount = groupItems
      .map((i) => getMeta(i, '_bb_group_set_count'))
      .find((v) => v != null);
    const quantity = setCount != null
      ? toAmount(setCount)
      : groupItems.reduce((sum, i) => sum + i.quantity, 0);
    const imageUrl = groupItems.map((i) => getMeta(i, '_bb_group_image_url')).find((v) => v != null);
    const imageAlt = groupItems.map((i) => getMeta(i, '_bb_group_image_alt')).find((v) => v != null);
    return {
      key,
      name,
      quantity,
      discountedTotal,
      originalTotal,
      items: groupItems,
      image: imageUrl ? { sourceUrl: imageUrl, altText: imageAlt || name } : undefined,
    };
  });

  return { bundleGroups, standalone };
}

/** A single product row — `nested` renders it smaller, indented under a bundle's header row. */
function LineItemRow({ item, nested = false }: { item: LineItem; nested?: boolean }) {
  const name = item.product?.node?.name || 'Product';
  const slug = item.product?.node?.slug;
  const image = item.product?.node?.image;
  const size = nested ? 32 : 48;

  return (
    <tr className={nested ? 'account__bundle-item' : undefined}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: nested ? 10 : 12 }}>
          {image?.sourceUrl ? (
            <Image
              src={image.sourceUrl}
              alt={image.altText || name}
              width={size}
              height={size}
              style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: size,
                height: size,
                borderRadius: 6,
                backgroundColor: '#f0f0f0',
                flexShrink: 0,
              }}
            />
          )}
          {slug ? (
            <Link href={`/products/${slug}`} className="account__link">
              {name}
            </Link>
          ) : (
            name
          )}
        </div>
      </td>
      <td>{item.quantity}</td>
      <td>{item.total}</td>
    </tr>
  );
}

interface OrderAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface CouponLine {
  code?: string;
  discount?: string;
}

interface Order {
  databaseId: number;
  orderNumber: string;
  date: string;
  status: string;
  total: string;
  subtotal?: string;
  shippingTotal?: string;
  discountTotal?: string;
  totalTax?: string;
  paymentMethodTitle?: string;
  billing?: OrderAddress;
  shipping?: OrderAddress;
  couponLines?: { nodes: CouponLine[] };
  lineItems?: { nodes: LineItem[] };
}

function hasAmount(value?: string): boolean {
  if (!value) return false;
  const numeric = parseFloat(value.replace(/[^0-9.-]/g, ''));
  return !Number.isNaN(numeric) && numeric !== 0;
}

function AddressBlock({ title, address }: { title: string; address?: OrderAddress }) {
  if (!address?.address1) return null;

  return (
    <div className="account__address">
      <h2 className="account__subtitle">{title}</h2>
      <p>
        {address.firstName} {address.lastName}
        {address.company && (
          <>
            <br />
            {address.company}
          </>
        )}
        <br />
        {address.address1}
        {address.address2 && <>, {address.address2}</>}
        <br />
        {address.city}, {address.state} {address.postcode}
        <br />
        {address.country}
        {address.phone && (
          <>
            <br />
            {address.phone}
          </>
        )}
        {address.email && (
          <>
            <br />
            {address.email}
          </>
        )}
      </p>
    </div>
  );
}

function statusModifier(status: string): string {
  switch (status?.toLowerCase()) {
    case 'processing':
      return 'account__status--processing';
    case 'completed':
      return 'account__status--completed';
    case 'cancelled':
    case 'failed':
      return 'account__status--cancelled';
    default:
      return '';
  }
}

const ORDER_QUERY = /* GraphQL */ `
  query GetAccountOrderPage($id: ID!) {
    order(id: $id, idType: DATABASE_ID) {
      databaseId
      orderNumber
      date
      status
      total
      subtotal
      shippingTotal
      discountTotal
      totalTax
      paymentMethodTitle
      billing {
        firstName lastName company email phone
        address1 address2 city state postcode country
      }
      shipping {
        firstName lastName company
        address1 address2 city state postcode country
      }
      couponLines { nodes { code discount } }
      lineItems {
        nodes {
          product { node { name slug image { sourceUrl altText } } }
          quantity
          total
          subtotal
          bbMode
          metaData {
            key
            value
          }
        }
      }
    }
  }
`;

function OrderSkeleton() {
  return (
    <div className="account">
      <div className="account__header">
        <div>
          <div className="account__skeleton-bar" style={{ width: '200px', height: 36, marginBottom: 8 }} />
          <div className="account__skeleton-bar" style={{ width: '140px', height: 14 }} />
        </div>
        <div className="account__skeleton-bar" style={{ width: '80px', height: 24 }} />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="account__skeleton-row" style={{ gridTemplateColumns: '1fr 60px 80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="account__skeleton-bar" style={{ width: 48, height: 48, borderRadius: 6, flexShrink: 0 }} />
            <div className="account__skeleton-bar" style={{ width: '160px' }} />
          </div>
          <div className="account__skeleton-bar" style={{ width: '30px' }} />
          <div className="account__skeleton-bar" style={{ width: '60px' }} />
        </div>
      ))}
    </div>
  );
}

function OrderContent() {
  const router = useRouter();
  const databaseId = router.query.databaseId as string | undefined;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!databaseId) return;

    fetch('/api/account/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ORDER_QUERY, variables: { id: databaseId } }),
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((res) => setOrder(res?.data?.order || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [databaseId]);

  if (loading || !databaseId) return <OrderSkeleton />;

  if (!order) {
    return (
      <div className="account">
        <div className="account__header">
          <h1 className="account__title">Order</h1>
        </div>
        <p className="account__empty">We could not find this order.</p>
        <div className="account__center">
          <Link href="/account" className="account__button">
            Back to account
          </Link>
        </div>
      </div>
    );
  }

  const items = order.lineItems?.nodes || [];
  const coupons = order.couponLines?.nodes || [];
  const { bundleGroups, standalone } = groupOrderLineItems(items);

  const toNumber = (value?: string) =>
    value ? parseFloat(value.replace(/[^0-9.-]/g, '')) || 0 : 0;
  const couponDiscount = coupons.reduce((sum, c) => sum + toNumber(c.discount), 0);
  const discountAmount = hasAmount(order.discountTotal)
    ? toNumber(order.discountTotal)
    : couponDiscount;

  return (
    <div className="account">
      <div className="account__header">
        <div>
          <h1 className="account__title">Order #{order.orderNumber}</h1>
          <p className="account__welcome">
            {new Date(order.date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <span className={`account__status ${statusModifier(order.status)}`}>{order.status}</span>
      </div>

      <table className="account__orders">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {bundleGroups.map((group) => {
            const hasDiscount = group.discountedTotal < group.originalTotal - 0.005;
            // No per-component rows for mystery bundles — just the header row.
            const isMysteryGroup = group.items.some((item) => item.bbMode === 'mystery');
            return (
              <Fragment key={group.key}>
                <tr className="account__bundle-header">
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {group.image?.sourceUrl ? (
                        <Image
                          src={group.image.sourceUrl}
                          alt={group.image.altText || group.name}
                          width={48}
                          height={48}
                          style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 6,
                            backgroundColor: '#f0f0f0',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span className="account__bundle-name">{group.name}</span>
                    </div>
                  </td>
                  <td>{group.quantity}</td>
                  <td>
                    {hasDiscount && (
                      <span className="account__bundle-original">
                        ${group.originalTotal.toFixed(2)}
                      </span>
                    )}
                    <span className="account__bundle-discounted">
                      ${group.discountedTotal.toFixed(2)}
                    </span>
                  </td>
                </tr>
                {!isMysteryGroup && group.items.map((item, i) => (
                  <LineItemRow key={`${group.key}-${i}`} item={item} nested />
                ))}
              </Fragment>
            );
          })}
          {standalone.map((item, i) => (
            <LineItemRow key={`standalone-${i}`} item={item} />
          ))}
        </tbody>
        <tfoot>
          {hasAmount(order.subtotal) && (
            <tr>
              <td>Subtotal</td>
              <td />
              <td>{order.subtotal}</td>
            </tr>
          )}

          {hasAmount(order.shippingTotal) && (
            <tr>
              <td>Shipping</td>
              <td />
              <td>{order.shippingTotal}</td>
            </tr>
          )}

          {discountAmount > 0 && (
            <tr>
              <td>
                Discount
                {coupons.length > 0 && ` (${coupons.map((c) => c.code).join(', ')})`}
              </td>
              <td />
              <td>-${discountAmount.toFixed(2)}</td>
            </tr>
          )}

          {hasAmount(order.totalTax) && (
            <tr>
              <td>Tax</td>
              <td />
              <td>{order.totalTax}</td>
            </tr>
          )}

          <tr>
            <td className="account__order-number">Total</td>
            <td />
            <td className="account__order-number">{order.total}</td>
          </tr>
        </tfoot>
      </table>

      {order.paymentMethodTitle && (
        <div className="account__address">
          <h2 className="account__subtitle">Payment</h2>
          <p>{order.paymentMethodTitle}</p>
        </div>
      )}

      <div className="account__addresses">
        <AddressBlock title="Shipping address" address={order.shipping} />
        <AddressBlock title="Billing address" address={order.billing} />
      </div>

      <div className="account__back">
        <Link href="/account" className="account__link">
          Back to account
        </Link>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <AccountGuard title="Order">
      <OrderContent />
    </AccountGuard>
  );
}
