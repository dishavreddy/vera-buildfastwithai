# Vera deployment

## Vercel (frontend and API in one project)

Vercel serves the Vite frontend and routes `/api/*` to the Express app through the catch-all function in `api/[...path].js`. The function imports the app from `server/index.js`; Express handles the original `/api/...` route. `vercel.json` sets the function duration to 60 seconds. Vercel invokes this function per request, so no separate backend process or external backend URL is needed. The Express app skips `app.listen` when `VERCEL` is set.

`VITE_API_URL` is optional. Leave it unset for same-origin `/api/...` requests. If set, it must be the base URL only, without `/api` or a trailing slash; rebuild and redeploy after changing it.

Set `GROQ_API_KEY` in the Vercel project's environment variables. `FRONTEND_ORIGIN` is only needed when calling the API cross-origin; use the exact deployed frontend origin. Resume PDFs are held in memory and have a 5 MB application limit.

## Separate Node server (optional)

For a separate Express host, set `GROQ_API_KEY`, `FRONTEND_ORIGIN`, and platform-provided `PORT`. Start it with `npm start` (or `npm run server`); it listens on `0.0.0.0` and `PORT`. Set `VITE_API_URL` on the frontend to that server's base URL and redeploy.

## Troubleshooting

1. Check `/api/health`; it should return JSON with `status: "ok"`.
2. Check Vercel function logs for startup/import errors or `[Vera upload ...]` PDF parsing errors.
3. Confirm `GROQ_API_KEY` is configured if detailed AI profile extraction is needed. Resume parsing still works, and profile creation falls back to a basic profile when Groq is unavailable.

`public/sample-resume.pdf` is included in the Vite production output. **Try a sample** sends it through the same upload and profile flow as a user-provided PDF.
