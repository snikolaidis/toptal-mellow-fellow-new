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
