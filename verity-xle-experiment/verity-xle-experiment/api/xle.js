const TRACKED = [
  { symbol: 'XOM', name: 'Exxon Mobil', weight: 20.98 },
  { symbol: 'CVX', name: 'Chevron', weight: 14.98 },
  { symbol: 'COP', name: 'ConocoPhillips', weight: 6.15 },
  { symbol: 'PSX', name: 'Phillips 66', weight: 4.96 },
  { symbol: 'MPC', name: 'Marathon Petroleum', weight: 4.95 },
  { symbol: 'VLO', name: 'Valero Energy', weight: 4.74 },
  { symbol: 'SLB', name: 'SLB', weight: 4.59 },
  { symbol: 'EOG', name: 'EOG Resources', weight: 4.32 },
  { symbol: 'BKR', name: 'Baker Hughes', weight: 3.91 },
  { symbol: 'WMB', name: 'Williams Companies', weight: 3.85 }
];

const HOLDINGS_AS_OF = '2026-08-10';
const TRACKED_WEIGHT = TRACKED.reduce((s, x) => s + x.weight, 0);

let memoryCache = { at: 0, body: null };
const MEMORY_TTL_MS = 12000;

async function quote(symbol, token) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
  const r = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!r.ok) throw new Error(`${symbol}: upstream ${r.status}`);
  const q = await r.json();
  const valid = Number.isFinite(q?.c) && q.c > 0 && Number.isFinite(q?.pc) && q.pc > 0;
  return { symbol, valid, ...q };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return res.status(500).json({
      error: 'FINNHUB_API_KEY is not configured in Vercel.',
      hint: 'Add FINNHUB_API_KEY in Project Settings → Environment Variables, then redeploy.'
    });
  }

  const now = Date.now();
  if (memoryCache.body && now - memoryCache.at < MEMORY_TTL_MS) {
    return res.status(200).json({ ...memoryCache.body, cache: 'memory' });
  }

  try {
    const symbols = ['XLE', ...TRACKED.map(x => x.symbol)];
    const results = await Promise.allSettled(symbols.map(s => quote(s, token)));
    const bySymbol = {};
    const errors = [];

    results.forEach((r, i) => {
      const symbol = symbols[i];
      if (r.status === 'fulfilled' && r.value.valid) bySymbol[symbol] = r.value;
      else errors.push(symbol);
    });

    const xle = bySymbol.XLE || null;
    let availableWeight = 0;
    let weightedReturnNumerator = 0;

    const components = TRACKED.map(h => {
      const q = bySymbol[h.symbol];
      if (!q) return { ...h, available: false };
      const returnPct = ((q.c - q.pc) / q.pc) * 100;
      availableWeight += h.weight;
      weightedReturnNumerator += h.weight * (returnPct / 100);
      return {
        ...h,
        available: true,
        price: q.c,
        previousClose: q.pc,
        changePct: returnPct,
        timestamp: q.t ? q.t * 1000 : null
      };
    });

    const basketReturn = availableWeight > 0
      ? weightedReturnNumerator / availableWeight
      : null;

    const anchor = xle?.pc || null;
    const estimate = anchor && basketReturn !== null
      ? anchor * (1 + basketReturn)
      : null;

    const divergencePct = estimate && xle?.c
      ? ((estimate - xle.c) / xle.c) * 100
      : null;

    const body = {
      generatedAt: now,
      methodology: {
        name: 'Verity XLE Top-10 Basket Estimate',
        description: 'Tracks the day-return of XLE’s ten largest published holdings, normalizes their published weights within the tracked basket, and applies that weighted return to XLE’s prior close. This is an experimental basket proxy, not NAV, IIV, or an exchange quote.',
        holdingsAsOf: HOLDINGS_AS_OF,
        trackedPublishedWeightPct: TRACKED_WEIGHT,
        availableTrackedWeightPct: availableWeight,
        sourceHoldings: 'State Street Investment Management — XLE Fund Top Holdings',
        sourcePrices: 'Finnhub quote endpoint (prototype upstream)'
      },
      xle: xle ? {
        actualPrice: xle.c,
        previousClose: xle.pc,
        changePct: ((xle.c - xle.pc) / xle.pc) * 100,
        timestamp: xle.t ? xle.t * 1000 : null
      } : null,
      estimate: estimate ? {
        price: estimate,
        basketReturnPct: basketReturn * 100,
        divergenceVsActualPct: divergencePct
      } : null,
      components,
      missingSymbols: errors
    };

    memoryCache = { at: now, body };
    return res.status(200).json({ ...body, cache: 'fresh' });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to build XLE basket estimate.', detail: err.message });
  }
}
