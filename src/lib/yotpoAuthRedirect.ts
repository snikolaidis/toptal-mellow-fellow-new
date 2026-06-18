const LOGIN_SELECTORS = '.yotpo-login-link, .yotpo-drawer-sign-in-link, .yotpo-drawer-sign-in';
const REGISTER_SELECTORS =
  '.yotpo-register-link, .yotpo-drawer-sign-up, .yotpo-drawer-sign-up-item';

export function setupYotpoAuthRedirect(
  loginPath = '/login',
  registerPath = '/register',
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest(LOGIN_SELECTORS)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(loginPath);
    } else if (target.closest(REGISTER_SELECTORS)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(registerPath);
    }
  };

  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}

const REDEEM_BUTTON_SELECTORS = '.yotpo-action-button, .yotpo-redeem-button, [data-yotpo-redemption-option]';
const REDEEM_TARGET = '.loyalty-redeem';

export function setupYotpoRedeemScroll(targetSelector = REDEEM_TARGET): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: MouseEvent) => {
    const node = event.target as Element | null;
    if (!node || typeof node.closest !== 'function') return;
    if (node.closest(targetSelector)) return;

    const btn = node.closest(REDEEM_BUTTON_SELECTORS);
    if (!btn) return;
    if (!(btn.textContent || '').trim().toLowerCase().includes('redeem')) return;

    const dest = document.querySelector(targetSelector) as HTMLElement | null;
    if (!dest) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    dest.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}
