import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import AccountGuard from '@/components/account/AccountGuard';

interface LineItem {
  quantity: number;
  total: string;
  product?: {
    node?: {
      name?: string;
      slug?: string;
      image?: { sourceUrl?: string; altText?: string };
    };
  };
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

const ORDER_QUERY = `
  query GetAccountOrder($id: ID!) {
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
          {items.map((item, i) => {
            const name = item.product?.node?.name || 'Product';
            const slug = item.product?.node?.slug;
            const image = item.product?.node?.image;
            return (
              <tr key={`${name}-${i}`}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {image?.sourceUrl ? (
                      <Image
                        src={image.sourceUrl}
                        alt={image.altText || name}
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
          })}
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
