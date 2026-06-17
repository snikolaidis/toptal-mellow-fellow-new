import { memo } from 'react';

interface YotpoWidgetProps {
  instanceId: string;
  className?: string;
}

function YotpoWidgetBase({ instanceId, className }: YotpoWidgetProps) {
  return (
    <div
      className={className ? `yotpo-widget-instance ${className}` : 'yotpo-widget-instance'}
      data-yotpo-instance-id={instanceId}
      suppressHydrationWarning
    />
  );
}

export default memo(YotpoWidgetBase, () => true);
