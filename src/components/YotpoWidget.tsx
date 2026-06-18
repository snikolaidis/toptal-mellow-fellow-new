import { memo, useEffect } from 'react';
import { initYotpoLoyaltyWidgets } from '@/lib/yotpoLoyalty';

interface YotpoWidgetProps {
  instanceId: string;
  className?: string;
}

function YotpoWidgetBase({ instanceId, className }: YotpoWidgetProps) {
  useEffect(() => {
    initYotpoLoyaltyWidgets(process.env.NEXT_PUBLIC_YOTPO_LOYALTY_LOADER);
  }, [instanceId]);

  return (
    <div
      className={className ? `yotpo-widget-instance ${className}` : 'yotpo-widget-instance'}
      data-yotpo-instance-id={instanceId}
      suppressHydrationWarning
    />
  );
}

export default memo(YotpoWidgetBase, () => true);
