import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getApolloAuthClient } from '@faustwp/core';
import { useMutation } from '@apollo/client';
import AccountGuard from '@/components/account/AccountGuard';
import { CANCEL_SUBSCRIPTION, PAUSE_SUBSCRIPTION, RESUME_SUBSCRIPTION } from '@/graphql/mutations/subscriptions';

interface SubItem {
  name: string;
  quantity: number;
}

interface Subscription {
  id: number;
  status: string;
  total: string;
  billingPeriod: string;
  billingInterval: number;
  nextPayment: string;
  canCancel: boolean;
  canPause: boolean;
  canResume: boolean;
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

const CUSTOMER_SUBSCRIPTIONS_QUERY = `
  query CustomerSubscriptions {
    customer {
      subscriptions(first: 50) {
        nodes {
          orderNumber
          status
          total
          billingPeriod
          billingInterval
          nextPaymentDate
          endDate
          lineItems {
            nodes {
              quantity
              product {
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

const CANCELLABLE_STATUSES = ['active', 'on-hold', 'pending'];
const PAUSABLE_STATUSES = ['active'];
const RESUMABLE_STATUSES = ['on-hold'];

function isPastEndDate(endDate: string | null | undefined): boolean {
  if (!endDate) return false;
  const d = new Date(endDate.replace(' ', 'T'));
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

interface SubscriptionNode {
  orderNumber?: string | null;
  status?: string | null;
  total?: string | null;
  billingPeriod?: string | null;
  billingInterval?: string | null;
  nextPaymentDate?: string | null;
  endDate?: string | null;
  lineItems?: {
    nodes?: Array<{
      quantity?: number | null;
      product?: { node?: { name?: string | null } | null } | null;
    }> | null;
  } | null;
}

function mapSubscription(node: SubscriptionNode): Subscription {
  const status = (node.status || '').toLowerCase().replace(/_/g, '-');

  return {
    id: Number(node.orderNumber) || 0,
    status,
    total: node.total ?? '',
    billingPeriod: node.billingPeriod ?? '',
    billingInterval: Number(node.billingInterval) || 1,
    nextPayment: node.nextPaymentDate ?? '',
    canCancel: CANCELLABLE_STATUSES.includes(status),
    canPause: PAUSABLE_STATUSES.includes(status),
    canResume: RESUMABLE_STATUSES.includes(status) && !isPastEndDate(node.endDate),
    items: (node.lineItems?.nodes ?? []).map((item) => ({
      name: item?.product?.node?.name ?? 'Item',
      quantity: item?.quantity ?? 1,
    })),
  };
}

type Action = 'cancel' | 'pause' | 'resume';

const ACTION_LABELS: Record<Action, { label: string; busyLabel: string }> = {
  cancel: { label: 'Cancel', busyLabel: 'Cancelling...' },
  pause: { label: 'Pause', busyLabel: 'Pausing...' },
  resume: { label: 'Resume', busyLabel: 'Resuming...' },
};

function SubscriptionsSkeleton() {
  return (
    <div className="account">
      <header className="account__header">
        <div className="account__skeleton-bar" style={{ width: '220px', height: 36 }} />
        <div className="account__skeleton-bar" style={{ width: '120px', height: 14 }} />
      </header>
      {[1, 2, 3].map((i) => (
        <div key={i} className="account__skeleton-row" style={{ gridTemplateColumns: '80px 1fr 100px 100px 60px 80px 80px' }}>
          <div className="account__skeleton-bar" style={{ width: '60px' }} />
          <div className="account__skeleton-bar" style={{ width: '140px' }} />
          <div className="account__skeleton-bar" style={{ width: '90px' }} />
          <div className="account__skeleton-bar" style={{ width: '85px' }} />
          <div className="account__skeleton-bar" style={{ width: '50px' }} />
          <div className="account__skeleton-bar" style={{ width: '65px', height: 22 }} />
          <div className="account__skeleton-bar" style={{ width: '60px', height: 22 }} />
        </div>
      ))}
    </div>
  );
}

function fetchSubscriptions(): Promise<Subscription[]> {
  return fetch('/api/account/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CUSTOMER_SUBSCRIPTIONS_QUERY }),
    credentials: 'same-origin',
  })
    .then((r) => r.json())
    .then((res) => {
      const nodes: SubscriptionNode[] = res?.data?.customer?.subscriptions?.nodes || [];
      return nodes.map(mapSubscription);
    })
    .catch(() => []);
}

function SubscriptionsContent() {
  const client = getApolloAuthClient();
  const [cancelSubscription] = useMutation(CANCEL_SUBSCRIPTION, { client });
  const [pauseSubscription] = useMutation(PAUSE_SUBSCRIPTION, { client });
  const [resumeSubscription] = useMutation(RESUME_SUBSCRIPTION, { client });
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<{ id: number; action: Action } | null>(null);

  useEffect(() => {
    fetchSubscriptions()
      .then(setSubs)
      .finally(() => setLoading(false));
  }, []);

  const runAction = useCallback(async (
    sub: Subscription,
    action: Action,
    mutate: () => Promise<unknown>,
    fallbackMessage: string,
  ) => {
    setBusy({ id: sub.id, action });
    try {
      await mutate();
      const refreshed = await fetchSubscriptions();
      setSubs(refreshed);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : fallbackMessage);
    } finally {
      setBusy(null);
    }
  }, []);

  const cancel = useCallback((sub: Subscription) => {
    if (!window.confirm('Cancel this subscription? This cannot be undone.')) return;
    runAction(sub, 'cancel', () => cancelSubscription({ variables: { id: String(sub.id) } }), 'Could not cancel subscription');
  }, [cancelSubscription, runAction]);

  const pause = useCallback((sub: Subscription) => {
    runAction(sub, 'pause', () => pauseSubscription({ variables: { id: String(sub.id) } }), 'Could not pause subscription');
  }, [pauseSubscription, runAction]);

  const resume = useCallback((sub: Subscription) => {
    runAction(sub, 'resume', () => resumeSubscription({ variables: { id: String(sub.id) } }), 'Could not resume subscription');
  }, [resumeSubscription, runAction]);

  if (loading) return <SubscriptionsSkeleton />;

  return (
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
                <td>{s.total}</td>
                <td>
                  <span className="account__status">{s.status}</span>
                </td>
                {s.status !== 'expired' && (
                  <td style={{ display: 'flex', gap: '12px' }}>
                    {s.canPause && (
                      <button
                        type="button"
                        className="account__link button"
                        onClick={() => pause(s)}
                        disabled={busy?.id === s.id}
                      >
                        {busy?.id === s.id && busy.action === 'pause' ? ACTION_LABELS.pause.busyLabel : ACTION_LABELS.pause.label}
                      </button>
                    )}
                    {s.canResume && (
                      <button
                        type="button"
                        className="account__link button"
                        onClick={() => resume(s)}
                        disabled={busy?.id === s.id}
                      >
                        {busy?.id === s.id && busy.action === 'resume' ? ACTION_LABELS.resume.busyLabel : ACTION_LABELS.resume.label}
                      </button>
                    )}
                    {s.canCancel && (
                      <button
                        type="button"
                        className="account__link button"
                        onClick={() => cancel(s)}
                        disabled={busy?.id === s.id}
                      >
                        {busy?.id === s.id && busy.action === 'cancel' ? ACTION_LABELS.cancel.busyLabel : ACTION_LABELS.cancel.label}
                      </button>
                    )}
                  </td>
                )}
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
      <SubscriptionsContent />
    </AccountGuard>
  );
}
