import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

interface UseShopMegaMenuOptions {
  isCondensed: boolean;
}

// The panel hangs off the header's bottom edge, not the button's, so 14px of
// chrome sits between them. Closing on mouseleave alone fires mid-traverse.
const HOVER_CLOSE_DELAY_MS = 150;

// Not a viewport width: the desktop nav starts at 1024px, which includes large
// touchscreens, and tapping there synthesises mouseenter before the click.
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

export function useShopMegaMenu({ isCondensed }: UseShopMegaMenuOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldFocusPanel, setShouldFocusPanel] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const canHoverRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const query = window.matchMedia(FINE_POINTER);
    const sync = () => {
      canHoverRef.current = query.matches;
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  useEffect(() => cancelScheduledClose, [cancelScheduledClose]);

  // Every close path clears the timer, so a pending hover close can never land
  // on a panel that Escape closed and the trigger reopened in the meantime.
  const close = useCallback(() => {
    cancelScheduledClose();
    setIsOpen(false);
    setShouldFocusPanel(false);
  }, [cancelScheduledClose]);

  const toggle = useCallback(
    (viaKeyboard: boolean) => {
      cancelScheduledClose();
      setIsOpen((prev) => !prev);
      setShouldFocusPanel(viaKeyboard);
    },
    [cancelScheduledClose]
  );

  const handlePointerEnter = useCallback(() => {
    if (!canHoverRef.current) return;
    cancelScheduledClose();
    setIsOpen(true);
    // Hover must never move focus; only Enter and Space do that.
    setShouldFocusPanel(false);
  }, [cancelScheduledClose]);

  const handlePointerLeave = useCallback(() => {
    if (!canHoverRef.current) return;
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
      setShouldFocusPanel(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelScheduledClose]);

  const closeAndRefocus = useCallback(() => {
    close();
    triggerRef.current?.focus();
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAndRefocus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeAndRefocus]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      // The trigger toggles on click. Closing here too would let that toggle
      // reopen it, so the trigger could never close the panel.
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      // Null means focus left the document, not that it landed outside. Treating
      // it as outside and closing loses the panel to an alt-tab and back.
      if (!next) return;
      if (panelRef.current?.contains(next)) return;
      if (triggerRef.current?.contains(next)) return;
      close();
    };
    document.addEventListener('focusout', onFocusOut);
    return () => document.removeEventListener('focusout', onFocusOut);
  }, [isOpen, close]);

  useEffect(() => {
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events, close]);

  // is-condensed puts display:none on .site-header__nav, which is where the
  // trigger lives.
  useEffect(() => {
    if (isCondensed) close();
  }, [isCondensed, close]);

  return {
    isOpen,
    shouldFocusPanel,
    triggerRef,
    panelRef,
    toggle,
    close,
    handlePointerEnter,
    handlePointerLeave,
  };
}
