# Verity XLE Basket Experiment

This is a **standalone experiment**, not Verity V10.

## What it does
- Uses XLE's 10 largest published fund holdings from State Street (snapshot: 2026-08-10).
- Fetches the current quote and previous close for each tracked holding plus XLE.
- Computes a normalized, weighted intraday return across the tracked basket.
- Anchors that return to XLE's prior close to produce a **Verity basket estimate**.
- Shows the estimate beside the observed XLE quote and charts their divergence while the page is open.

This is intentionally called a *basket estimate*, not NAV/IIV.

## Required Vercel environment variable
`FINNHUB_API_KEY`

The API key remains server-side in `api/xle.js`.

## Deploy
Upload this folder as its own Vercel project (or push it to a temporary GitHub repo and import it into Vercel). No build command is required.

The serverless route is `/api/xle` and the page refreshes approximately every 15 seconds. CDN and memory caching reduce repeat upstream calls.

## Important prototype limitation
The tracked top 10 represented 73.43% of XLE's published fund weight on the holdings snapshot used here. The estimate normalizes those tracked weights to 100%, so it is a directional reconstruction, not a complete portfolio valuation.
