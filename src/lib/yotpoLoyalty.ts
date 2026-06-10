interface YotpoGuidContainer {
  initWidgets?: () => void;
}

interface YotpoWidgetsContainer {
  initWidgets?: () => void;
  guids?: Record<string, YotpoGuidContainer>;
}

declare global {
  interface Window {
    yotpoWidgetsContainer?: YotpoWidgetsContainer;
  }
}

function guidFromLoader(loaderUrl?: string): string | null {
  if (!loaderUrl) return null;
  const parts = loaderUrl.split('/loader/');
  return parts.length > 1 ? parts[1].split(/[/?#]/)[0] : null;
}

export function initYotpoLoyaltyWidgets(loaderUrl?: string, attempts = 40): void {
  if (typeof window === 'undefined') return;
  const guid = guidFromLoader(loaderUrl);

  const tryInit = (left: number) => {
    const container = window.yotpoWidgetsContainer;
    const guidContainer = guid && container?.guids ? container.guids[guid] : undefined;

    if (guidContainer?.initWidgets) {
      guidContainer.initWidgets();
      return;
    }
    if (container?.initWidgets) {
      container.initWidgets();
      return;
    }
    if (left > 0) {
      window.setTimeout(() => tryInit(left - 1), 250);
    }
  };

  tryInit(attempts);
}
