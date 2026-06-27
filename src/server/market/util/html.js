/* ──────────────────────────────────────────────────────────────────────
   HTML helpers — minimal, no DOM parser dependency.

   Many job sites serialize JobPosting via JSON-LD <script type="application/ld+json">.
   Schema reference: https://schema.org/JobPosting

   These helpers are intentionally lightweight; adapters that need richer
   parsing should pull cheerio in Phase 3 if necessary.
   ────────────────────────────────────────────────────────────────────── */

/** Extract every JSON-LD <script> payload from HTML. Returns parsed objects. */
export function extractJsonLd(html) {
  if (!html) return [];
  const out = [];
  const rx = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    let body = m[1].trim();
    // Strip HTML comments inside JSON-LD blocks
    body = body.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!body) continue;
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // try wrapped-array fallback (some sites concatenate)
      try {
        const fixed = JSON.parse(`[${body.replace(/}\s*{/g, '},{')}]`);
        if (Array.isArray(fixed)) out.push(...fixed);
      } catch { /* skip malformed */ }
    }
  }
  return out;
}

/** Filter JSON-LD objects to JobPostings. Returns normalized minimal shape. */
export function jsonLdJobPostings(blocks) {
  const out = [];
  for (const block of blocks) {
    const list = block['@graph'] ? block['@graph'] : [block];
    for (const item of list) {
      const type = item['@type'];
      const isJob = type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
      if (!isJob) continue;
      out.push({
        title: item.title || '',
        company: item.hiringOrganization?.name || item.hiringOrganization || '',
        location: locationToString(item.jobLocation) || item.jobLocation || '',
        description: stripHtml(item.description || ''),
        salary_raw: item.baseSalary ? salaryToString(item.baseSalary) : null,
        posted_ts: item.datePosted || null,
        source_url: item.url || item.sameAs || null,
      });
    }
  }
  return out;
}

function locationToString(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  if (Array.isArray(loc)) return loc.map(locationToString).filter(Boolean).join(' / ');
  const addr = loc.address || loc;
  const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
  return parts.join(', ');
}

function salaryToString(sal) {
  if (!sal) return null;
  const v = sal.value || sal;
  const min = v.minValue, max = v.maxValue, unit = v.unitText || sal.unitText || '';
  const currency = sal.currency || v.currency || '';
  if (min && max) return `${currency} ${min}-${max} ${unit}`;
  if (v.value) return `${currency} ${v.value} ${unit}`;
  return null;
}

/** Strip HTML tags. Defensive against deeply-nested markup. */
export function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x?\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
