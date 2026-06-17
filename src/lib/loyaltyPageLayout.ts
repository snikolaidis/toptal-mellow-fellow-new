const PAGE_ROOT = '.yotpo-widget-loyalty-page';
const WAYS_TO_EARN = '.yotpo-widget-campaign-widget';
const REDEEM_HEADING = 'how to use your points';
const REDEEM_TARGET = '.loyalty-redeem';
const PORTAL_ATTR = 'data-mf-redeem-portal';
const HIDDEN_ATTR = 'data-mf-hidden';
const REDEEM_BUTTON_SELECTOR = '.yotpo-action-button';
const REDEEM_BUTTON_TEXT = 'redeem points';
const SCROLL_BOUND_ATTR = 'data-mf-scroll-bound';

export interface LoyaltyLayoutOptions {
  onTarget: (el: HTMLElement | null) => void;
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
    if (el.closest(`[${PORTAL_ATTR}]`)) return;
    const text = (el.textContent || '').trim().toLowerCase();
    if (text.includes(REDEEM_HEADING) && text.length < bestLen) {
      bestLen = text.length;
      best = el;
    }
  });
  return best;
}

function wireRedeemButtons(): void {
  document.querySelectorAll<HTMLElement>(REDEEM_BUTTON_SELECTOR).forEach((btn) => {
    if (btn.getAttribute(SCROLL_BOUND_ATTR) === 'true') return;
    if ((btn.textContent || '').trim().toLowerCase() !== REDEEM_BUTTON_TEXT) return;
    btn.setAttribute(SCROLL_BOUND_ATTR, 'true');
    btn.addEventListener('click', () => {
      const target = document.querySelector(REDEEM_TARGET) as HTMLElement | null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

export function positionLoyaltyRedeem(options: LoyaltyLayoutOptions): () => void {
  if (typeof window === 'undefined') return () => {};

  let placeholder: HTMLElement | null = null;
  let reported: HTMLElement | null = null;

  const tick = () => {
    wireRedeemButtons();

    const root = document.querySelector(PAGE_ROOT);
    if (!root) return;

    const waysToEarn = root.querySelector(WAYS_TO_EARN);
    const nativeHeading = findNativeRedeemHeading(root);
    if (!waysToEarn && !nativeHeading) return;

    let container: Element | null = null;
    let anchorAfter: Element | null = null;
    let nativeBlock: Element | null = null;

    if (waysToEarn && nativeHeading) {
      container = lowestCommonAncestor(waysToEarn, nativeHeading);
      if (container) {
        anchorAfter = childContaining(container, waysToEarn);
        nativeBlock = childContaining(container, nativeHeading);
        if (!anchorAfter) anchorAfter = nativeBlock;
      }
    } else if (nativeHeading) {
      nativeBlock = childContaining(root, nativeHeading) ?? nativeHeading;
      container = nativeBlock.parentElement;
      anchorAfter = nativeBlock.previousElementSibling;
    } else if (waysToEarn) {
      const block = childContaining(root, waysToEarn) ?? waysToEarn;
      container = block.parentElement;
      anchorAfter = block;
    }

    if (!container) return;

    if (nativeBlock && !nativeBlock.hasAttribute(HIDDEN_ATTR)) {
      (nativeBlock as HTMLElement).style.display = 'none';
      nativeBlock.setAttribute(HIDDEN_ATTR, 'true');
    }

    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.setAttribute(PORTAL_ATTR, 'true');
    }

    const desiredNext = anchorAfter ? anchorAfter.nextSibling : container.firstChild;
    if (placeholder.parentElement !== container || placeholder.nextSibling !== desiredNext) {
      container.insertBefore(placeholder, desiredNext);
    }

    if (reported !== placeholder) {
      reported = placeholder;
      options.onTarget(placeholder);
    }
  };

  const interval = window.setInterval(tick, 400);
  tick();

  return () => {
    window.clearInterval(interval);
    if (placeholder && placeholder.parentElement) {
      placeholder.parentElement.removeChild(placeholder);
    }
    placeholder = null;
    reported = null;
    options.onTarget(null);
  };
}
