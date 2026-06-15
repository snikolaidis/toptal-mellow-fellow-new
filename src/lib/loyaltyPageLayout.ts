const PAGE_ROOT = '.yotpo-widget-loyalty-page';
const WAYS_TO_EARN = '.yotpo-widget-campaign-widget';
const REDEEM_HEADING = 'how to use your points';

export interface LoyaltyLayoutOptions {
  slotId: string;
}

function lowestCommonAncestor(a: Element, b: Element): Element | null {
  const ancestors = new Set<Element>();
  let node: Element | null = a;
  while (node) {
    ancestors.add(node);
    node = node.parentElement;
  }
  node = b;
  while (node) {
    if (ancestors.has(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function childContaining(parent: Element, descendant: Element): Element | null {
  let node: Element | null = descendant;
  while (node && node.parentElement && node.parentElement !== parent) {
    node = node.parentElement;
  }
  return node && node.parentElement === parent ? node : null;
}

function findNativeRedeemHeading(root: Element): Element | null {
  let best: Element | null = null;
  let bestLen = Infinity;
  root.querySelectorAll('h1, h2, h3, h4, h5, div, span, p').forEach((el) => {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text.includes(REDEEM_HEADING) && text.length < bestLen) {
      bestLen = text.length;
      best = el;
    }
  });
  return best;
}

function applyLayout(slot: HTMLElement): boolean {
  const root = document.querySelector(PAGE_ROOT);
  if (!root) return false;
  if (root.contains(slot)) {
    // already moved inside the loyalty page; keep it visible
    slot.style.display = '';
    return true;
  }

  const waysToEarn = root.querySelector(WAYS_TO_EARN);
  const nativeHeading = findNativeRedeemHeading(root);

  // Prefer anchoring on the native redemption section so the custom one takes
  // its exact place (right after Ways to Earn). Hide the native one.
  if (nativeHeading && waysToEarn) {
    const container = lowestCommonAncestor(waysToEarn, nativeHeading);
    if (container) {
      const waysToEarnBlock = childContaining(container, waysToEarn);
      const nativeBlock = childContaining(container, nativeHeading);
      if (nativeBlock && nativeBlock !== slot) {
        (nativeBlock as HTMLElement).style.display = 'none';
        nativeBlock.setAttribute('data-mf-hidden', 'true');
      }
      const anchor = waysToEarnBlock ?? nativeBlock;
      if (anchor) {
        if (anchor.nextSibling !== slot) {
          anchor.parentElement?.insertBefore(slot, anchor.nextSibling);
        }
        slot.style.display = '';
        return true;
      }
    }
  }

  // Fallback: native section present but no Ways to Earn resolved yet.
  if (nativeHeading) {
    const nativeBlock =
      childContaining(root, nativeHeading) ?? (nativeHeading as Element);
    if (nativeBlock && nativeBlock !== slot) {
      (nativeBlock as HTMLElement).style.display = 'none';
      nativeBlock.setAttribute('data-mf-hidden', 'true');
      nativeBlock.parentElement?.insertBefore(slot, nativeBlock);
      slot.style.display = '';
      return true;
    }
  }

  return false;
}

export function positionLoyaltyRedeem(options: LoyaltyLayoutOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  const getSlot = () => document.getElementById(options.slotId) as HTMLElement | null;

  const initial = getSlot();
  if (initial) initial.style.display = 'none';

  let placed = false;
  const tick = () => {
    const slot = getSlot();
    if (!slot) return;
    if (applyLayout(slot)) placed = true;
  };

  const interval = window.setInterval(tick, 400);
  tick();

  const reveal = window.setTimeout(() => {
    if (!placed) {
      const slot = getSlot();
      if (slot) slot.style.display = '';
    }
  }, 6000);

  return () => {
    window.clearInterval(interval);
    window.clearTimeout(reveal);
  };
}
