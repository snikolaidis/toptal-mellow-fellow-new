type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

export function createCircuitBreaker(
  name: string,
  config: Partial<CircuitBreakerConfig> = {},
) {
  const { failureThreshold, cooldownMs } = { ...DEFAULT_CONFIG, ...config };
  let state: CircuitState = 'closed';
  let failureCount = 0;
  let nextAttemptAt = 0;

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T | null> {
      if (state === 'open') {
        if (Date.now() < nextAttemptAt) return null;
        state = 'half-open';
        console.warn(`[CircuitBreaker:${name}] HALF-OPEN, probing...`);
      }

      try {
        const result = await fn();
        if (state === 'half-open') {
          console.warn(`[CircuitBreaker:${name}] CLOSED, probe succeeded.`);
        }
        state = 'closed';
        failureCount = 0;
        return result;
      } catch (err) {
        failureCount++;
        if (failureCount >= failureThreshold || state === 'half-open') {
          state = 'open';
          nextAttemptAt = Date.now() + cooldownMs;
          console.warn(
            `[CircuitBreaker:${name}] OPEN after ${failureCount} failures. Next attempt in ${cooldownMs / 1000}s.`,
          );
        }
        return null;
      }
    },

    getState(): CircuitState {
      return state;
    },

    reset(): void {
      state = 'closed';
      failureCount = 0;
      nextAttemptAt = 0;
    },
  };
}
