const PAGE_ROOT = '.yotpo-widget-loyalty-page';
const SECTIONS_PARENT = '.yotpo-widget-instance-container';
const WAYS_TO_EARN = '.yotpo-widget-campaign-widget';
const REDEEM_HEADING = 'how to use your points';

export interface LoyaltyLayoutOptions {
  slotId: string;
  nativeRedeemSelector?: string;
}

function sectionsParent(root: Element): Element {
  return root.querySelector(SECTIONS_PARENT) ?? root;
}

function topLevelSectionContaining(parent: Element, descendant: Element): Element | null {
  let node: Element | null = descendant;
  while (node && node.parentElement && node.parentElement !== parent) {
    node = node.parentElement;
  }
  return node && node.parentElement === parent ? node : null;
}

function findNativeRedeemSection(
  parent: Element,
  slot: Element,
  nativeRedeemSelector?: string,
): Element | null {
  if (nativeRedeemSelector) {
    const explicit = parent.querySelector(nativeRedeemSelector);
    if (explicit) return topLevelSectionContaining(parent, explicit);
  }
  for (const child of Array.from(parent.children)) {
    if (child === slot || child.contains(slot)) continue;
    const text = (child.textContent || '').trim().toLowerCase();
    if (text.includes(REDEEM_HEADING)) return child;
  }
  return null;
}

function applyLayout(slot: HTMLElement, options: LoyaltyLayoutOptions): boolean {
  const root = document.querySelector(PAGE_ROOT);
  if (!root) return false;

  const parent = sectionsParent(root);
  const waysToEarn = parent.querySelector(WAYS_TO_EARN);
  if (!waysToEarn) return false;

  const waysToEarnSection = topLevelSectionContaining(parent, waysToEarn) ?? waysToEarn;

  const nativeRedeem = findNativeRedeemSection(parent, slot, options.nativeRedeemSelector);
  if (nativeRedeem && nativeRedeem !== slot) {
    (nativeRedeem as HTMLElement).style.display = 'none';
    nativeRedeem.setAttribute('data-mf-hidden', 'true');
  }

  if (waysToEarnSection.nextSibling !== slot) {
    waysToEarnSection.parentElement?.insertBefore(slot, waysToEarnSection.nextSibling);
  }
  slot.style.display = '';
  return true;
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
    const ok = applyLayout(slot, options);
    if (ok) placed = true;
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
