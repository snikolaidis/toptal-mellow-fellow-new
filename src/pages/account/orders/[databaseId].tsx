import Link from 'next/link';
import { useRouter } from 'next/router';
import { getApolloAuthClient } from '@faustwp/core';
import { useQuery } from '@apollo/client';
import AccountGuard from '@/components/account/AccountGuard';
import { GET_CUSTOMER } from '@/graphql/queries/auth';

interface LineItem {
  quantity: number;
  total: string;
  product?: { node?: { name?: string; slug?: string } };
}

interface Order {
  databaseId: number;
  orderNumber: string;
  date: string;
  status: string;
  total: string;
  lineItems?: { nodes: LineItem[] };
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

function OrderContent() {
  const router = useRouter();
  const client = getApolloAuthClient();
  const { data, loading } = useQuery(GET_CUSTOMER, { client });

  const databaseId = Number(router.query.databaseId);
  const orders: Order[] = data?.customer?.orders?.nodes || [];
  const order = orders.find((o) => o.databaseId === databaseId);

  if (loading) {
    return (
      <div className="account">
        <p className="account__empty">Loading order...</p>
      </div>
    );
  }

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
            return (
              <tr key={`${name}-${i}`}>
                <td>
                  {slug ? (
                    <Link href={`/product/${slug}`} className="account__link">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </td>
                <td>{item.quantity}</td>
                <td>{item.total}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="account__order-number">Total</td>
            <td />
            <td className="account__order-number">{order.total}</td>
          </tr>
        </tfoot>
      </table>

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
