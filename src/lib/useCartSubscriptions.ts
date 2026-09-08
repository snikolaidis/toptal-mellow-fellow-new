import { useEffect, useState } from 'react';

export interface CartSubChoice {
  period: string;
  interval: number;
  unitPrice: number;
  discount: number;
}

// Shopper's Subscribe & Save choice is stored per product on the PDP as
// `mf_sub_<productId>` (see single-product.tsx) and read at checkout. The cart
// reads the same key so the choice is visible before checkout.
export function everyLabel(period: string, interval: number): string {
  if (!period) return '';
  return interval > 1 ? `${interval} ${period}s` : period;
}

export function useCartSubscriptions(productIds: number[]): Record<number, CartSubChoice> {
  const [map, setMap] = useState<Record<number, CartSubChoice>>({});
  const key = productIds.join(',');

  useEffect(() => {
    if (typeof window === 'undefined' || productIds.length === 0) {
      setMap({});
      return;
    }

    const chosen: Record<number, { period: string; interval: number }> = {};
    for (const id of productIds) {
      let raw: string | null = null;
      try {
        raw = window.sessionStorage.getItem(`mf_sub_${id}`);
      } catch {
        raw = null;
      }
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        chosen[id] = { period: String(parsed.period), interval: Number(parsed.interval) };
      } catch {
        // ignore malformed entry
      }
    }

    const ids = Object.keys(chosen).map(Number);
    if (ids.length === 0) {
      setMap({});
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const fields = ids
          .map(
            (id, i) =>
              `p${i}: product(id: ${id}, idType: DATABASE_ID) { ` +
              `... on SimpleProduct { subscriptionSchemes { period interval price discount } } ` +
              `... on VariableProduct { subscriptionSchemes { period interval price discount } } }`
          )
          .join('\n');
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ query: `{ ${fields} }` }),
        });
        const json = await res.json();
        const data = json?.data || {};
        const out: Record<number, CartSubChoice> = {};
        ids.forEach((id, i) => {
          const schemes = data[`p${i}`]?.subscriptionSchemes;
          const c = chosen[id];
          if (!Array.isArray(schemes)) return;
          const match = schemes.find(
            (x: { period?: string; interval?: number }) =>
              String(x.period) === c.period && Number(x.interval) === c.interval
          );
          if (!match) return;
          const unit = parseFloat(String(match.price ?? ''));
          if (!Number.isFinite(unit)) return;
          out[id] = {
            period: c.period,
            interval: c.interval,
            unitPrice: unit,
            discount: Math.round(Number(match.discount) || 0),
          };
        });
        if (!cancelled) setMap(out);
      } catch {
        if (!cancelled) setMap({});
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
