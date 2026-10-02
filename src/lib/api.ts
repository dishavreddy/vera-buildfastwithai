let healthRequest: Promise<void> | null = null;

/** Share one lightweight backend warm-up across StrictMode mounts and uploads. */
export function warmApi(): Promise<void> {
  if (!healthRequest) {
    healthRequest = (async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetch('/api/health', { method: 'GET', cache: 'no-store', signal: controller.signal });
          if (response.ok) return;
          console.warn(`[Vera] backend health check returned ${response.status} (attempt ${attempt + 1})`);
        } catch (error) {
          console.info(`[Vera] backend health check not ready (attempt ${attempt + 1}):`, error);
        } finally {
          window.clearTimeout(timer);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      console.warn('[Vera] backend did not become healthy during startup warm-up; upload requests will still retry.');
    })().finally(() => { healthRequest = null; });
  }
  return healthRequest;
}
