let healthRequest: Promise<boolean> | null = null;

const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Share one lightweight backend warm-up across StrictMode mounts and uploads. */
export function warmApi(): Promise<boolean> {
  if (!healthRequest) {
    healthRequest = (async () => {
      let attempt = 0;
      // Keep a selected upload queued while a cold backend wakes up. The UI
      // shows a short status note until this resolves.
      while (true) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetch(apiUrl('/api/health'), { method: 'GET', cache: 'no-store', signal: controller.signal });
          if (response.ok) return true;
          console.warn(`[Vera] backend health check returned ${response.status} (attempt ${attempt + 1})`);
        } catch (error) {
          console.info(`[Vera] backend health check not ready (attempt ${attempt + 1}):`, error);
        } finally {
          window.clearTimeout(timer);
        }
        attempt += 1;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    })().finally(() => { healthRequest = null; });
  }
  return healthRequest;
}
