import app from '../server/index.js';

export default function handler(req, res) {
  // Vercel catch-all routing may provide either the full deployment path or
  // the path relative to /api. Express routes are registered with /api/...
  if (req.url && req.url !== '/api' && !req.url.startsWith('/api/')) {
    req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
  }
  console.info('[Vera] API function request:', req.method, req.url);
  return app(req, res);
}
