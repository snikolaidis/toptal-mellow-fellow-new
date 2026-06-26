import { memo, useEffect, useRef, useState } from 'react';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';

interface YotpoWidgetProps {
  instanceId: string;
  className?: string;
}

function YotpoWidgetBase({ instanceId, className }: YotpoWidgetProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
  }, [mounted, instanceId]);

  if (!mounted) {
    return null;
  }

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
