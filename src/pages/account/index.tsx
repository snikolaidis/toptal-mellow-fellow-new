import { useEffect } from 'react';
import Link from 'next/link';
import { getApolloAuthClient, useLogout } from '@faustwp/core';
import { useQuery } from '@apollo/client';
import AccountGuard from '@/components/account/AccountGuard';
import { GET_CUSTOMER_ORDERS } from '@/graphql/queries/auth';
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

function AccountDashboard() {
  const client = getApolloAuthClient();
  const { logout } = useLogout();
  const { data, loading, error } = useQuery(GET_CUSTOMER_ORDERS, { client, fetchPolicy: 'cache-and-network' });
  const { ready, token } = useYotpoLoyalty();

  const myRewards = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_MY_REWARDS_INSTANCE;
  const campaign = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_CAMPAIGN_INSTANCE;
  const vipTiers = process.env.NEXT_PUBLIC_YOTPO_LOYALTY_VIP_TIERS_INSTANCE;

  useEffect(() => {
    if (ready && !loading && (myRewards || campaign || vipTiers)) {
      initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
    }
  }, [ready, token, loading, myRewards, campaign, vipTiers]);

  const handleLogout = async () => {
    await fetch('/api/cart/save-for-user', { method: 'POST' }).catch(() => {});
    await fetch('/api/cart/clear-session', { method: 'POST' }).catch(() => {});
    logout('/');
  };

  if (loading) {
    return (
      <div className="account">
        <header className="account__header">
          <h1 className="account__title">My account</h1>
          <div className="account__skeleton-bar" style={{ width: '60px', height: 14 }} />
        </header>
        <div style={{ marginBottom: 28 }}>
          <div className="account__skeleton-bar" style={{ width: '240px', height: 16, marginBottom: 8 }} />
          <div className="account__skeleton-bar" style={{ width: '280px', height: 12 }} />
        </div>
        <div className="account__layout">
          <div>
            <h2 className="account__section-title">Order History</h2>
            <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 90px 70px 40px', gap: 16 }}>
                {[80, 100, 90, 70, 40].map((w, i) => (
                  <div key={i} className="account__skeleton-bar" style={{ width: w, height: 10 }} />
                ))}
              </div>
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="account__skeleton-row">
                <div className="account__skeleton-bar" style={{ width: '60px' }} />
                <div className="account__skeleton-bar" style={{ width: '85px' }} />
                <div className="account__skeleton-bar" style={{ width: '75px', height: 22, borderRadius: 2 }} />
                <div className="account__skeleton-bar" style={{ width: '55px' }} />
                <div className="account__skeleton-bar" style={{ width: '35px' }} />
              </div>
            ))}
          </div>
          <aside className="account__skeleton-sidebar">
            <div className="account__skeleton-bar" style={{ width: '150px', height: 20 }} />
            <div className="account__skeleton-bar" style={{ width: '180px', height: 16 }} />
            <div className="account__skeleton-bar" style={{ width: '120px' }} />
            <div className="account__skeleton-bar" style={{ width: '140px' }} />
            <div className="account__skeleton-bar" style={{ width: '160px' }} />
          </aside>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="account">
        <p className="account__empty">Error loading account: {error.message}</p>
      </div>
    );
  }

  const customer = data?.customer;
  const orders: OrderNode[] = customer?.orders?.nodes || [];
  const fullName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');
  const country = customer?.billing?.country || customer?.shipping?.country || '';
  const addressCount = [customer?.billing, customer?.shipping].filter(
    (a) => a && a.address1,
  ).length;

  return (
    <>
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
          <p className="account__detail-name">{fullName || customer?.displayName || 'Customer'}</p>
          <p className="account__detail-line">
            {fullName || customer?.displayName}
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
    </>
  );
}

export default function AccountPage() {
  return (
    <AccountGuard title="My account">
      <AccountDashboard />
    </AccountGuard>
  );
}
