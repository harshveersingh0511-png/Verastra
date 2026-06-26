/* ──────────────────────────────────────────────────────────────────────
   SmartRecruiters ATS parser

   SmartRecruiters exposes a public postings API:
     https://api.smartrecruiters.com/v1/companies/<company_id>/postings?limit=100&country=in

   Returns JSON with `content[]` of postings. Each posting has:
     id, name, releasedDate, location { country, region, city, remote },
     creator, function, industry, ref, language, postingUrl

   For full description, individual posting endpoint:
     https://api.smartrecruiters.com/v1/companies/<company_id>/postings/<posting_id>

   Used by SAP, Visa, McDonald's India, and many MNC India offices.
   ────────────────────────────────────────────────────────────────────── */

import { getJson } from '../../../util/http.js';
import { stripHtml } from '../../../util/html.js';

const MAX_DETAIL_FETCHES = 20; // Cap per employer per run

export async function parseSmartRecruiters(ctx, employer) {
  if (!employer.smartrecruiters_id) {
    ctx.logger.debug(`[smartrecruiters] ${employer.name}: missing smartrecruiters_id`);
    return [];
  }
  // Filter at API level — country=in covers India
  const listUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(employer.smartrecruiters_id)}/postings?limit=100&country=in`;
  try {
    const listData = await getJson(listUrl, { timeoutMs: 9000, retries: 1 });
    const postings = Array.isArray(listData?.content) ? listData.content : [];
    const out = [];
    let detailFetches = 0;

    for (const p of postings) {
      const loc = _buildLocationString(p.location);
      let description = '';
      // Fetch detail for description on a subset to keep budget
      if (detailFetches < MAX_DETAIL_FETCHES && p.id) {
        try {
          const detailUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(employer.smartrecruiters_id)}/postings/${encodeURIComponent(p.id)}`;
          const detail = await getJson(detailUrl, { timeoutMs: 6000, retries: 0 });
          description = _buildDescription(detail);
          detailFetches++;
        } catch (_e) { /* detail fetch failure is non-fatal */ }
      }
      out.push({
        title: p.name || '',
        company: employer.name,
        location: loc,
        description: description || p.name || '',
        source: 'employer_careers',
        source_url: p.postingUrl || listUrl,
        posted_ts: p.releasedDate || null,
        salary_raw: null,
        meta: {
          parser: 'smartrecruiters',
          employer: employer.name,
          company_id: employer.smartrecruiters_id,
          function: p.function?.label || null,
          industry: p.industry?.label || null,
          default_paths_hint: employer.default_paths_hint,
        },
      });
    }
    return out;
  } catch (err) {
    ctx.logger.debug(`[smartrecruiters] ${employer.name}: ${err.message}`);
    return [];
  }
}

function _buildLocationString(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  return parts.join(', ');
}

function _buildDescription(detail) {
  if (!detail || !detail.jobAd?.sections) return '';
  const sections = detail.jobAd.sections;
  const fragments = [];
  for (const key of ['jobDescription', 'qualifications', 'additionalInformation']) {
    const s = sections[key];
    if (s?.text) fragments.push(stripHtml(s.text));
  }
  return fragments.join(' ').replace(/\s+/g, ' ').trim();
}
