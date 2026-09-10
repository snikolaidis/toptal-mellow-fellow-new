import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * Not a heuristic: Next assigns this before forking the workers that prerender
 * pages, never assigns it in the server runtime, and branches on it itself.
 */
export const isBuildPhase = () => process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

const WARMUP_TIMEOUT_MS = 30_000;

let warming: Promise<void> | null = null;

async function pingWordPress(): Promise<void> {
  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  if (!wpUrl) return;

  const startedAt = Date.now();
  try {
    await fetch(`${wpUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ generalSettings { title } }' }),
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
    });
    console.log(`[warmWordPress] awake after ${Date.now() - startedAt}ms`);
  } catch (error) {
    // Non-fatal by design: this only removes a cold start, so failing here must
    // not fail the build it exists to protect.
    console.warn('[warmWordPress] warm-up failed, continuing:', error);
  }
}

/**
 * The first pages prerendered pay WordPress's cold start, which on a slow day
 * spends a route's render budget and bakes a 404 into the build output. Call
 * it before the first fetch in getStaticPaths: the first route pays, the rest
 * find WordPress awake. A no-op outside the build, so no guard at the call site.
 */
export function warmWordPress(): Promise<void> {
  if (!isBuildPhase()) return Promise.resolve();
  if (!warming) warming = pingWordPress();
  return warming;
}
