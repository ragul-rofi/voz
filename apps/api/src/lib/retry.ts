export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`${label} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  input: {
    retries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    retryOn?: (error: unknown) => boolean;
  },
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt + 1);
    } catch (error) {
      attempt += 1;
      const canRetry = attempt <= input.retries && (input.retryOn ? input.retryOn(error) : true);
      if (!canRetry) {
        throw error;
      }

      const exp = Math.min(input.maxDelayMs, input.baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.max(25, Math.floor(exp * 0.25)));
      const waitMs = exp + jitter;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
