import app from '../server/index.js';

export function expressRoute(path) {
  return function handler(req, res) {
    const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `${path}${query}`;
    console.info('[Vera] API function request:', req.method, req.url);
    return app(req, res);
  };
}
