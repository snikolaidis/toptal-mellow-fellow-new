export type WidgetSource = 'fbt' | 'free_gift' | 'you_may_also_like' | 'recently_viewed';

export function recordWidgetSource(productId: number, source: WidgetSource): void {
  if (typeof window === 'undefined' || !productId) {
    return;
  }
  try {
    window.sessionStorage.setItem(`mf_src_${productId}`, source);
  } catch {
    return;
  }
}

export function collectWidgetSources(productIds: number[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === 'undefined') {
    return out;
  }
  for (const id of productIds) {
    try {
      const v = window.sessionStorage.getItem(`mf_src_${id}`);
      if (v) {
        out[String(id)] = v;
      }
    } catch {
      continue;
    }
  }
  return out;
}
