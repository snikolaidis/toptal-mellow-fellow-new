import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

interface UseShopMegaMenuOptions {
  isCondensed: boolean;
}

export function useShopMegaMenu({ isCondensed }: UseShopMegaMenuOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldFocusPanel, setShouldFocusPanel] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setIsOpen(false);
    setShouldFocusPanel(false);
  }, []);

  const toggle = useCallback((viaKeyboard: boolean) => {
    setIsOpen((prev) => !prev);
    setShouldFocusPanel(viaKeyboard);
  }, []);

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
  };
}
