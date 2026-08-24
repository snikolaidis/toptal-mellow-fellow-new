import { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import type { GetServerSideProps } from 'next';
import { prefetchMenus, mergeMenuState } from '@/lib/prefetchMenus';
import Layout from '@/components/Layout';
import { getServerSideAuthWithToken, redirectToLogin, serverSideGraphQL } from '@/lib/server-auth';
import { useYotpoLoyalty } from '@/context/YotpoLoyaltyContext';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';
import LoyaltyRedeem from '@/components/LoyaltyRedeem';
import YotpoWidget from '@/components/YotpoWidget';

interface OrderNode {
  id: string;
  databaseId: number;
  orderNumber: string;
  date: string;
  status: string;
  total: string;
}

interface CustomerData {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  billing: { address1: string; country: string };
  shipping: { address1: string; country: string };
  orders: { nodes: OrderNode[] };
}

interface AccountPageProps {
  customer: CustomerData;
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

const CUSTOMER_ORDERS_QUERY = `
  query GetCustomerOrders {
    customer {
      email
      firstName
      lastName
      displayName
      billing { address1 country }
      shipping { address1 country }
      orders(first: 10) {
        nodes {
          id
          databaseId
          orderNumber
          date
          status
          total
        }
      }
    }
  }
`;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  ctx.res.setHeader('Cache-Control', 'private, no-cache, no-store');

  const auth = await getServerSideAuthWithToken(ctx);
  if (!auth) return redirectToLogin(ctx);

  try {
    const [data, menuClient] = await Promise.all([
      serverSideGraphQL(CUSTOMER_ORDERS_QUERY, auth.accessToken),
      prefetchMenus(),
    ]);
    const props: Record<string, any> = { customer: data?.customer || null };
    mergeMenuState(props, menuClient);
    return { props };
  } catch {
    return { props: { customer: null } };
  }
};

export default function AccountPage({ customer }: AccountPageProps) {
  const { logout } = useAuth();
  const { ready, token } = useYotpoLoyalty();

  const myRewards = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_MY_REWARDS_INSTANCE;
  const campaign = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_CAMPAIGN_INSTANCE;
  const vipTiers = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_VIP_TIERS_INSTANCE;

  useEffect(() => {
    if (ready && (myRewards || campaign || vipTiers)) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, myRewards, campaign, vipTiers]);

  const handleLogout = async () => {
    await fetch('/api/cart/save-for-user', { method: 'POST' }).catch(() => {});
    await fetch('/api/cart/clear-session', { method: 'POST' }).catch(() => {});
    logout('/');
  };

  if (!customer) {
    return (
      <Layout title="My account">
        <div className="account">
          <p className="account__empty">Error loading account data.</p>
        </div>
      </Layout>
    );
  }

  const orders: OrderNode[] = customer.orders?.nodes || [];
  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
  const country = customer.billing?.country || customer.shipping?.country || '';
  const addressCount = [customer.billing, customer.shipping].filter(
    (a) => a && a.address1,
  ).length;

  return (
    <Layout title="My account">
      <div className="account">
        <header className="account__header">
          <h1 className="account__title">My account</h1>
          <button type="button" onClick={handleLogout} className="account__signout">
            Log out
          </button>
        </header>

        <div className="account__edit">
          <Link href="/account/addresses" className="account__edit-link">
            Edit Your Account Details Here
          </Link>
          <p className="account__edit-sub">Shipping Addresses and Phone numbers</p>
        </div>

        <div className="account__layout">
          <div className="account__main">
            <h2 className="account__section-title">Order History</h2>
            {orders.length > 0 ? (
              <table className="account__orders">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="account__order-number">
                        <Link href={`/account/orders/${order.databaseId}`} className="account__link">
                          #{order.orderNumber}
                        </Link>
                      </td>
                      <td>
                        {new Date(order.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td>
                        <span className={`account__status ${statusModifier(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td>{order.total}</td>
                      <td>
                        <Link href={`/account/orders/${order.databaseId}`} className="account__link">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="account__muted">You haven&apos;t placed any orders yet.</p>
            )}
          </div>

          <aside className="account__sidebar">
            <h3 className="account__sidebar-heading">Account details</h3>
            <p className="account__detail-name">{fullName || customer.displayName || 'Customer'}</p>
            <p className="account__detail-line">
              {fullName || customer.displayName}
              {country && (
                <>
                  <br />
                  {country}
                </>
              )}
            </p>
            <p>
              <Link href="/account/addresses" className="account__link">
                View addresses ({addressCount})
              </Link>
            </p>
            <p>
              <Link href="/account/subscriptions" className="account__link">
                Manage subscriptions
              </Link>
            </p>
          </aside>
        </div>
      </div>

      <div className="account-loyalty">
        {myRewards && <YotpoWidget instanceId={myRewards} />}
        {campaign && <YotpoWidget instanceId={campaign} />}
        <LoyaltyRedeem variant="discounts" />
        {vipTiers && <YotpoWidget instanceId={vipTiers} />}
      </div>
    </Layout>
  );
}
