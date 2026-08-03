import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import Layout from '@/components/Layout';
import { getServerSideAuth, redirectToLogin } from '@/lib/server-auth';

interface SubItem {
  name: string;
  quantity: number;
}

interface Subscription {
  id: number;
  status: string;
  total: string;
  currency: string;
  billingPeriod: string;
  billingInterval: number;
  nextPayment: string;
  canCancel: boolean;
  items: SubItem[];
}

interface SubscriptionsPageProps {
  subscriptions: Subscription[];
}

function frequency(period: string, interval: number): string {
  if (!period) return '';
  return interval > 1 ? `every ${interval} ${period}s` : `every ${period}`;
}

function formatDate(value: string): string {
  if (!value) return '';
  const d = new Date(value.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  ctx.res.setHeader('Cache-Control', 'private, no-cache, no-store');

  const auth = await getServerSideAuth(ctx);
  if (!auth) return redirectToLogin(ctx);

  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const faustSecret = process.env.FAUST_SECRET_KEY || '';

  try {
    const wpRes = await fetch(`${wpUrl}/wp-json/mf/v1/subscriptions/${auth.userId}`, {
      headers: { Authorization: `Bearer ${faustSecret}` },
    });
    const data = await wpRes.json();
    return { props: { subscriptions: data.subscriptions || [] } };
  } catch {
    return { props: { subscriptions: [] } };
  }
};

export default function SubscriptionsPage({ subscriptions: initial }: SubscriptionsPageProps) {
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[]>(initial);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const cancel = useCallback(async (id: number) => {
    if (!window.confirm('Cancel this subscription? This cannot be undone.')) return;
    setCancelling(id);
    try {
      const res = await fetch('/api/account/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscriptionId: id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Could not cancel');
      }
      router.replace(router.asPath);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not cancel subscription');
    } finally {
      setCancelling(null);
    }
  }, [router]);

  return (
    <Layout title="My subscriptions">
      <div className="account">
        <header className="account__header">
          <h1 className="account__title">My subscriptions</h1>
          <Link href="/account" className="account__link">
            Back to account
          </Link>
        </header>

        {subs.length === 0 && (
          <p className="account__muted">You don&apos;t have any subscriptions yet.</p>
        )}

        {subs.length > 0 && (
          <table className="account__orders">
            <thead>
              <tr>
                <th>Subscription</th>
                <th>Items</th>
                <th>Frequency</th>
                <th>Next payment</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="account__order-number">#{s.id}</td>
                  <td>
                    {s.items
                      .map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`)
                      .join(', ')}
                  </td>
                  <td>{frequency(s.billingPeriod, s.billingInterval)}</td>
                  <td>{formatDate(s.nextPayment)}</td>
                  <td>${s.total}</td>
                  <td>
                    <span className="account__status">{s.status}</span>
                  </td>
                  <td>
                    {s.canCancel && (
                      <button
                        type="button"
                        className="account__link"
                        onClick={() => cancel(s.id)}
                        disabled={cancelling === s.id}
                      >
                        {cancelling === s.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
