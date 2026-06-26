/* ──────────────────────────────────────────────────────────────────────
   HTTP helper

   Wraps fetch() with:
     - User-Agent from MARKET_REFRESH_USER_AGENT
     - timeout via AbortController
     - exponential-backoff retry on transient errors (5xx, 429, network)
     - response size cap (10MB)

   All adapter network I/O goes through these helpers. Adapters do not
   call global fetch directly.
   ────────────────────────────────────────────────────────────────────── */

const MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;

function ua() {
  return process.env.MARKET_REFRESH_USER_AGENT
    || 'Verastra-MarketOverlay/1.0 (+contact)';
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchOnce(url, { method = 'GET', headers = {}, timeoutMs, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'User-Agent': ua(),
        'Accept-Language': 'en-IN,en;q=0.9',
        ...headers,
      },
      body,
      redirect: 'follow',
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* GET → text body with bounded retries. Throws on final failure. */
export async function getText(url, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchOnce(url, options);
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`HTTP ${res.status} for ${url}`);
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const reader = res.body?.getReader();
      if (!reader) return await res.text();
      // size-capped read
      const chunks = [];
      let total = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) { reader.cancel(); throw new Error(`response > ${MAX_BYTES} bytes: ${url}`); }
        chunks.push(value);
      }
      return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * Math.pow(2, attempt));
    }
  }
  throw lastErr || new Error(`unknown fetch failure: ${url}`);
}

export async function getJson(url, options = {}) {
  const text = await getText(url, {
    ...options,
    headers: { 'Accept': 'application/json', ...(options.headers || {}) },
  });
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`json parse failed for ${url}: ${e.message}`); }
}

/* Build a Naukri-style URL-safe slug. Spaces → -, lowercase. */
export function slug(s) {
  return String(s || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
