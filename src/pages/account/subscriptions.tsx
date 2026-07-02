import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AccountGuard from '@/components/account/AccountGuard';

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

function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/subscriptions', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Could not load subscriptions');
      }
      setSubs(data.subscriptions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (id: number) => {
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
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not cancel subscription');
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="account">
      <header className="account__header">
        <h1 className="account__title">My subscriptions</h1>
        <Link href="/account" className="account__link">
          Back to account
        </Link>
      </header>

      {loading && <p className="account__muted">Loading your subscriptions...</p>}
      {error && !loading && <p className="account__empty">{error}</p>}
      {!loading && !error && subs.length === 0 && (
        <p className="account__muted">You don&apos;t have any subscriptions yet.</p>
      )}

      {!loading && subs.length > 0 && (
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
  );
}

export default function SubscriptionsPage() {
  return (
    <AccountGuard title="My subscriptions">
      <Subscriptions />
    </AccountGuard>
  );
}
