import { memo, useEffect, useRef } from 'react';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';

interface YotpoWidgetProps {
  instanceId: string;
  className?: string;
}

function YotpoWidgetBase({ instanceId, className }: YotpoWidgetProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
  }, [instanceId]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof MutationObserver === 'undefined') return;

    console.log('[yotpo-widget] mount', { instanceId, children: el.childElementCount });

    const observer = new MutationObserver(() => {
      console.log('[yotpo-widget] content change', {
        instanceId,
        children: el.childElementCount,
        empty: el.childElementCount === 0,
      });
    });
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      console.log('[yotpo-widget] unmount', { instanceId, children: el.childElementCount });
      observer.disconnect();
    };
  }, [instanceId]);

  return (
    <div
      ref={ref}
      className={className ? `yotpo-widget-instance ${className}` : 'yotpo-widget-instance'}
      data-yotpo-instance-id={instanceId}
      suppressHydrationWarning
    />
  );
}

export default memo(YotpoWidgetBase, () => true);
