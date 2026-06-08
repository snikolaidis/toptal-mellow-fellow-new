interface KlaviyoQueue {
  push: (args: unknown[]) => void;
}

function getKlaviyo(): KlaviyoQueue | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { klaviyo?: KlaviyoQueue };
  if (!w.klaviyo) {
    w.klaviyo = [] as unknown as KlaviyoQueue;
  }
  return w.klaviyo;
}

export function klaviyoIdentify(properties: Record<string, unknown>): void {
  const klaviyo = getKlaviyo();
  if (!klaviyo) return;
  klaviyo.push(['identify', properties]);
}

export function klaviyoTrack(event: string, properties: Record<string, unknown>): void {
  const klaviyo = getKlaviyo();
  if (!klaviyo) return;
  klaviyo.push(['track', event, properties]);
}
