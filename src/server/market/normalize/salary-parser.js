/* ──────────────────────────────────────────────────────────────────────
   SALARY PARSER

   Strict V1 discipline per checkpoint §3:
     - Captured only when posting contains an explicit numeric band
     - Captured only from approved sources (validated upstream)
     - The salary clue is advisory-only and MUST NOT alter benchmark math

   Returns { min, max, currency, unit } in LPA where determinable,
   else null.
   ────────────────────────────────────────────────────────────────────── */

const APPROVED_SOURCES = new Set(['naukri', 'indeed_in', 'iimjobs', 'employer_careers']);

const BAND_RX = /(?:₹|INR|Rs\.?)\s?(\d{1,3}(?:\.\d{1,2})?)\s?(?:[-–to]+)\s?(\d{1,3}(?:\.\d{1,2})?)\s?(LPA|Lakhs?|L|Cr|Crore)/i;

export function parseSalaryBand(rawText = '', sourceId = '') {
  if (!APPROVED_SOURCES.has(sourceId)) return null;
  if (!rawText) return null;
  const m = BAND_RX.exec(rawText);
  if (!m) return null;
  const lo = parseFloat(m[1]);
  const hi = parseFloat(m[2]);
  const unit = m[3].toLowerCase();
  let lpa_min = lo, lpa_max = hi;
  if (unit.startsWith('cr')) { lpa_min = lo * 100; lpa_max = hi * 100; }
  return {
    min: lpa_min,
    max: lpa_max,
    currency: 'INR',
    unit: 'LPA',
    raw_match: m[0],
    advisory_only: true,
    must_not_alter_benchmark: true,
  };
}

export { APPROVED_SOURCES };
