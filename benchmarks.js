/* ──────────────────────────────────────────────────────────────────────
   BENCHMARKS — data layer reader (Phase 5 expansion)

   The contract for reading the benchmark master dataset.
   Phase 5: deep integration. Tool modules now consume real benchmark
   data through these accessors. Hand-typed priors are out.

   Tier policy: S/A surfaced in UI. B with disclaimer. C never displayed.
   ────────────────────────────────────────────────────────────────────── */

const SOURCE_PATH = 'assets/data/benchmarks/benchmarks_master.json';

let _cache = null;
let _loading = null;
let _meta = null;

/* The dataset uses snake_case cluster + role keys. The UI uses friendlier
   internal keys. This mapping is the bridge. Every UI-side cluster/role
   key resolves to a dataset path here.                                    */

export const CLUSTER_MAP = {
  finance:                  { ds: 'finance',                  label: 'Finance, Accounting & Capital Markets' },
  consulting:               { ds: 'consulting',               label: 'Consulting & Strategy' },
  technology:               { ds: 'technology',               label: 'Technology & Engineering' },
  product_design:           { ds: 'product_and_design',       label: 'Product & Design' },
  sales:                    { ds: 'sales',                    label: 'Sales & Revenue' },
  marketing:                { ds: 'marketing',                label: 'Marketing & Growth' },
  operator_founder:         { ds: 'entrepreneurship_founder', label: 'Operator & Founder' },
  law:                      { ds: 'law_legal',                label: 'Law & Legal' },
  operations:               { ds: 'operations_scm',           label: 'Operations & Supply Chain' },
  hr:                       { ds: 'hr_human_resources',       label: 'Human Resources' },
  healthcare:               { ds: 'healthcare',               label: 'Healthcare & Pharma' },
  engineering_non_software: { ds: 'engineering_non_software', label: 'Engineering (Non-Software)' },
  creative_media:           { ds: 'creative_media',           label: 'Creative & Media' },
  academia_research:        { ds: 'academia_research',        label: 'Academia & Research' },
  government_psu:           { ds: 'government_psu',           label: 'Government & PSU' },
};

/* UI-side role keys mapped to dataset role keys per cluster.
   The CVI lookup in career_volatility_index_extended uses different
   path keys for the cvi data — those are noted in `cviKey` where they
   differ from the dataset role key.                                  */
export const ROLE_MAP = {
  finance: {
    'ib-analyst':   { ds: 'investment_banking',          label: 'Investment Banking — Analyst (0-3y)',     cell: 'analyst_bulge_bracket',           cviKey: 'ib_bulge_bracket' },
    'ib-associate': { ds: 'investment_banking',          label: 'Investment Banking — Associate (3-5y)',   cell: 'associate_bulge_bracket',         cviKey: 'ib_bulge_bracket' },
    'pe-vc':        { ds: 'private_equity_vc',           label: 'PE / VC — Associate / Investor',          cell: null,                              cviKey: 'pe_vc' },
    'er':           { ds: 'equity_research',             label: 'Equity Research Analyst',                  cell: null,                              cviKey: 'equity_research' },
    'fpa':          { ds: 'fp_and_a_corporate_finance',  label: 'FP&A / Corporate Finance',                 cell: null,                              cviKey: 'industry_fp_and_a' },
    'tax':          { ds: 'chartered_accountant',        label: 'Tax — Big 4 / Boutique',                   cell: null,                              cviKey: 'big4_statutory_audit' },
    'tp':           { ds: 'transfer_pricing',            label: 'Transfer Pricing',                          cell: 'associate_big4',                  cviKey: 'big4_tax_transfer_pricing' },
    'ca-industry':  { ds: 'chartered_accountant',        label: 'CA — Industry / Controller',               cell: null,                              cviKey: 'industry_corporate_finance' },
    'treasury':     { ds: 'treasury_actuarial',          label: 'Treasury / Actuarial',                      cell: null,                              cviKey: 'treasury_actuarial' },
  },
  consulting: {
    'mbb-consultant': { ds: 'mbb_mckinsey_bcg_bain',        label: 'MBB — Consultant (0-3y)',                cell: null, cviKey: null },
    'mbb-em':         { ds: 'mbb_mckinsey_bcg_bain',        label: 'MBB — Engagement Manager (3-6y)',        cell: null, cviKey: null },
    'big4-strategy':  { ds: 'big4_strategy_advisory',       label: 'Big 4 — Strategy & Advisory',            cell: null, cviKey: null },
    'boutique':       { ds: 'boutique_specialist_consulting', label: 'Boutique / Specialist',                cell: null, cviKey: null },
    'corp-strategy':  { ds: 'internal_corporate_strategy',  label: 'Internal Corporate Strategy',            cell: null, cviKey: null },
  },
  technology: {
    'swe-junior': { ds: 'software_engineer',          label: 'Software Engineer — Junior (0-3y)', cell: null, cviKey: null },
    'swe-mid':    { ds: 'software_engineer',          label: 'Software Engineer — Mid (3-7y)',    cell: null, cviKey: null },
    'swe-senior': { ds: 'software_engineer',          label: 'Software Engineer — Senior (7y+)',  cell: null, cviKey: null },
    'ds':         { ds: 'data_scientist',             label: 'Data Scientist',                     cell: null, cviKey: null },
    'mle':        { ds: 'machine_learning_engineer',  label: 'ML Engineer',                        cell: null, cviKey: null },
    'em':         { ds: 'engineering_manager',        label: 'Engineering Manager',                cell: null, cviKey: null },
    'vp-cto':     { ds: 'cto_vp_engineering',         label: 'VP Engineering / CTO',               cell: null, cviKey: null },
    'devops':     { ds: 'devops_sre_cloud',           label: 'DevOps / SRE / Cloud',               cell: null, cviKey: null },
    'security':   { ds: 'security_engineer',          label: 'Security Engineer',                  cell: null, cviKey: null },
  },
  product_design: {
    'pm-junior':  { ds: 'product_manager',          label: 'Product Manager — Junior (0-3y)', cell: null, cviKey: null },
    'pm-mid':     { ds: 'product_manager',          label: 'Product Manager — Mid (3-7y)',    cell: null, cviKey: null },
    'pm-senior':  { ds: 'product_manager',          label: 'Product Manager — Senior (7y+)',  cell: null, cviKey: null },
    'designer':   { ds: 'ux_ui_product_designer',   label: 'UX / UI / Product Designer',       cell: null, cviKey: null },
  },
  sales: {
    'sdr-bdr':    { ds: 'sdr_bdr',           label: 'SDR / BDR (0-2y)',           cell: null, cviKey: null },
    'ae':         { ds: 'account_executive', label: 'Account Executive (2-5y)',   cell: null, cviKey: null },
    'sales-mgr':  { ds: 'account_executive', label: 'Sales Manager (5-10y)',      cell: null, cviKey: null },
    'fmcg-sales': { ds: 'fmcg_field_sales',  label: 'FMCG Field Sales',           cell: null, cviKey: null },
    'vp-sales':   { ds: 'vp_sales_cro',      label: 'VP Sales / CRO',             cell: null, cviKey: null },
  },
  marketing: {
    'digital':       { ds: 'performance_marketing_manager', label: 'Digital / Performance Marketing', cell: null, cviKey: null },
    'brand-fmcg':    { ds: 'brand_manager_fmcg',            label: 'Brand Manager — FMCG',            cell: null, cviKey: null },
    'content':       { ds: 'seo_content_social',            label: 'SEO / Content / Social',          cell: null, cviKey: null },
    'cmo':           { ds: 'cmo_chief_marketing_officer',   label: 'CMO / Marketing Director',        cell: null, cviKey: null },
    'digital-mgr':   { ds: 'digital_marketing_manager',     label: 'Digital Marketing Manager',       cell: null, cviKey: null },
  },
  operator_founder: {
    'pre-seed':       { ds: 'founder_by_funding_stage', label: 'Founder — Pre-seed',             cell: 'pre_seed',     cviKey: null },
    'founder-seed':   { ds: 'founder_by_funding_stage', label: 'Founder — Funded (Seed)',        cell: 'seed',         cviKey: null },
    'founder-a':      { ds: 'founder_by_funding_stage', label: 'Founder — Funded (Series A)',    cell: 'series_a',     cviKey: null },
    'founder-b':      { ds: 'founder_by_funding_stage', label: 'Founder — Funded (Series B)',    cell: 'series_b',     cviKey: null },
    'founder-c':      { ds: 'founder_by_funding_stage', label: 'Founder — Funded (Series C+)',   cell: 'series_c_plus',cviKey: null },
    'founder-boots':  { ds: 'bootstrapped_founder',     label: 'Founder — Bootstrapped',          cell: null,           cviKey: null },
  },
  law: {
    'law-tier1':  { ds: 'tier_1_law_firm_associate',     label: 'Tier 1 Law Firm Associate', cell: null, cviKey: null },
    'law-tier2':  { ds: 'tier_2_law_firm_associate',     label: 'Tier 2 Law Firm Associate', cell: null, cviKey: null },
    'in-house':   { ds: 'in_house_counsel',              label: 'In-House Counsel',          cell: null, cviKey: null },
    'litigation': { ds: 'independent_litigation_practice', label: 'Independent Litigation',  cell: null, cviKey: null },
  },
  operations: {
    'scm':         { ds: 'supply_chain_manager',   label: 'Supply Chain Manager',    cell: null, cviKey: null },
    'ops-mgr':     { ds: 'operations_manager',     label: 'Operations Manager',      cell: null, cviKey: null },
    'procurement': { ds: 'procurement_logistics',  label: 'Procurement / Logistics', cell: null, cviKey: null },
  },
  hr: {
    'hrbp':          { ds: 'hr_generalist_hrbp',           label: 'HR Generalist / HRBP',         cell: null, cviKey: null },
    'ta':            { ds: 'talent_acquisition_specialist',label: 'Talent Acquisition Specialist',cell: null, cviKey: null },
    'comp-benefits': { ds: 'compensation_benefits_l_and_d',label: 'Compensation, Benefits & L&D', cell: null, cviKey: null },
    'chro':          { ds: 'startup_chro_by_stage',        label: 'CHRO / Head of People',         cell: null, cviKey: null },
  },
  healthcare: {
    'gp':         { ds: 'mbbs_doctor_general_practitioner', label: 'MBBS / General Practitioner',    cell: null, cviKey: null },
    'specialist': { ds: 'md_ms_specialist',                 label: 'MD / MS Specialist',              cell: null, cviKey: null },
    'super-spec': { ds: 'super_specialist_dm_mch',          label: 'Super Specialist (DM / MCh)',     cell: null, cviKey: null },
    'nursing':    { ds: 'nursing_paramedical',              label: 'Nursing / Paramedical',           cell: null, cviKey: null },
    'pharma':     { ds: 'pharma_industry',                  label: 'Pharma Industry',                  cell: null, cviKey: null },
  },
  engineering_non_software: {
    'mech':       { ds: 'mechanical_engineer',                      label: 'Mechanical Engineer',                cell: null, cviKey: null },
    'civil':      { ds: 'civil_engineer',                           label: 'Civil Engineer',                     cell: null, cviKey: null },
    'electrical': { ds: 'electrical_chemical_automotive_engineer',  label: 'Electrical / Chemical / Auto Engr.', cell: null, cviKey: null },
  },
  creative_media: {
    'journalism':       { ds: 'journalism',                                label: 'Journalism',                            cell: null, cviKey: null },
    'film-prod':        { ds: 'film_production_director',                  label: 'Film Production / Director',            cell: null, cviKey: null },
    'creator':          { ds: 'content_creator_fulltime',                  label: 'Content Creator (Full-time)',           cell: null, cviKey: null },
    'creative-director':{ ds: 'creative_director_advertising_design',      label: 'Creative Director — Advertising/Design',cell: null, cviKey: null },
  },
  academia_research: {
    'faculty-state':   { ds: 'university_faculty_ugc_7th_cpc',  label: 'University Faculty (UGC / 7th CPC)',     cell: null, cviKey: null },
    'faculty-elite':   { ds: 'iit_iim_faculty',                  label: 'IIT / IIM Faculty',                       cell: null, cviKey: null },
    'gov-scientist':   { ds: 'drdo_csir_isro_scientist',         label: 'DRDO / CSIR / ISRO Scientist',            cell: null, cviKey: null },
    'industry-r&d':    { ds: 'industry_research_director',       label: 'Industry Research Director',              cell: null, cviKey: null },
  },
  government_psu: {
    'ias':       { ds: 'ias_ips_civil_services',     label: 'IAS / IPS / Civil Services',          cell: null, cviKey: null },
    'rbi':       { ds: 'rbi_grade_b_officer',         label: 'RBI Grade B Officer',                  cell: null, cviKey: null },
    'psu-exec':  { ds: 'psu_executive_maharatna',     label: 'PSU Executive (Maharatna)',            cell: null, cviKey: null },
  },
};

/* Discount-rate path mapping — connects UI cluster/role to the
   18 keys under common_drivers.discount_rate.career_risk_premium_by_path. */
export const DISCOUNT_PATH_MAP = {
  finance: {
    'tax': 'big4_audit', 'tp': 'transfer_pricing', 'fpa': 'fp_and_a',
    'ca-industry': 'industry_finance', 'treasury': 'industry_finance',
    'er': 'investment_banking', 'ib-analyst': 'investment_banking',
    'ib-associate': 'investment_banking', 'pe-vc': 'pe_vc',
  },
  consulting: {
    'mbb-consultant': 'mbb_consulting', 'mbb-em': 'mbb_consulting',
    'big4-strategy': 'big4_advisory', 'boutique': 'mbb_consulting',
    'corp-strategy': 'industry_finance',
  },
  technology: {
    'swe-junior': 'tech_product', 'swe-mid': 'tech_product', 'swe-senior': 'tech_product',
    'ds': 'tech_product', 'mle': 'tech_faang_gcc', 'em': 'tech_product',
    'vp-cto': 'tech_faang_gcc', 'devops': 'tech_services', 'security': 'tech_product',
  },
  product_design: {
    'pm-junior': 'product_management', 'pm-mid': 'product_management',
    'pm-senior': 'product_management', 'designer': 'ux_design',
  },
  operator_founder: {
    'pre-seed': 'founder', 'founder-seed': 'founder', 'founder-a': 'founder',
    'founder-b': 'founder', 'founder-c': 'startup_cfo', 'founder-boots': 'founder',
  },
  // Other clusters default to industry_finance
};

/* Domain mapping for compensation_matrix_v2 lookups (finance roles only;
   matrix is finance-domain only).                                        */
export const DOMAIN_MAP = {
  finance: {
    'tax': 'direct_tax', 'tp': 'transfer_pricing', 'ca-industry': 'audit',
    'fpa': 'fp_and_a', 'treasury': 'treasury', 'er': 'equity_research',
    'ib-analyst': 'ib_coverage', 'ib-associate': 'ib_coverage',
    'pe-vc': 'ma_advisory',
  },
};

/* Loader ─────────────────────────────────────────────────────────── */

export async function load() {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = fetch(SOURCE_PATH)
    .then(r => { if (!r.ok) throw new Error(`benchmarks: HTTP ${r.status}`); return r.json(); })
    .then(data => { _cache = data; _meta = data._meta; return data; })
    .catch(err => { console.warn('benchmarks: load failed, fallbacks engaged', err); _cache = null; return null; });
  return _loading;
}

export function meta() { const d = _cache; return d ? d._meta : null; }

/* ── Cluster + Role accessors ────────────────────────────────────── */

export function listClusters() {
  return Object.entries(CLUSTER_MAP).map(([key, v]) => ({ value: key, label: v.label }));
}

export function listRoles(clusterKey) {
  const roles = ROLE_MAP[clusterKey] || {};
  return Object.entries(roles).map(([key, v]) => ({ value: key, label: v.label }));
}

export function roleDescriptor(clusterKey, roleKey) {
  return ROLE_MAP[clusterKey]?.[roleKey] || null;
}

export function clusterDescriptor(clusterKey) {
  return CLUSTER_MAP[clusterKey] || null;
}

/* ── Compensation accessors ──────────────────────────────────────── */

/** All compensation cells for a role, flattened and normalized.
    Handles all 4 schema variants present in the dataset:
      1) compensation_lpa with flat cells {low, median, high}
      2) compensation_lpa with cells {base, bonus, total} (uses total)
      3) compensation_lpa_by_employer.{employer}.{seniority_band} (tech roles)
      4) founder_salary_lpa_india_adjusted (founder)
      5) compensation_total_lpa_inc_da_hra_perks (government)                */
export function getCompensationCells(clusterKey, roleKey) {
  const d = _cache;
  if (!d) return null;
  const rd = roleDescriptor(clusterKey, roleKey);
  const cd = clusterDescriptor(clusterKey);
  if (!rd || !cd) return null;
  const role = d[cd.ds]?.[rd.ds];
  if (!role) return null;

  const out = [];

  // Determine which container holds the cells
  const containers = [
    role.compensation_lpa,
    role.compensation_lpa_by_employer,
    role.compensation_total_lpa_inc_da_hra_perks,
    role.founder_salary_lpa_india_adjusted,
    role.compensation_lpa_india_adjusted,
  ].filter(Boolean);

  for (const container of containers) {
    for (const [cellKey, cell] of Object.entries(container)) {
      if (cellKey.startsWith('_') || !cell || typeof cell !== 'object') continue;

      // Case A: cell has direct low/median/high
      if (cell.median != null && typeof cell.median === 'number') {
        out.push({ cell: cellKey, low: cell.low, median: cell.median, high: cell.high, tier: cell.tier || 'B' });
        continue;
      }

      // Case B: cell has {base, bonus, total} or {base, total_with_bonus} — use total
      const totalKey = cell.total ? 'total' : (cell.total_with_bonus ? 'total_with_bonus' : null);
      if (totalKey && typeof cell[totalKey].median === 'number') {
        out.push({ cell: cellKey, low: cell[totalKey].low, median: cell[totalKey].median, high: cell[totalKey].high, tier: cell.tier || 'B' });
        continue;
      }

      // Case C: cell is nested-by-seniority (employer-tier rows in tech)
      // Try the role's preferred seniority key; else median across seniorities
      if (typeof cell === 'object') {
        const senKey = rd.seniority;
        const subCells = Object.entries(cell).filter(([k, v]) =>
          !k.startsWith('_') && v && typeof v === 'object' && (v.median != null || v.total?.median != null)
        );
        if (subCells.length > 0) {
          if (senKey) {
            const preferred = subCells.find(([k]) => k === senKey);
            if (preferred) {
              const sc = preferred[1];
              const m = sc.median != null ? sc : sc.total;
              out.push({ cell: `${cellKey}.${preferred[0]}`, low: m.low, median: m.median, high: m.high, tier: sc.tier || cell.tier || 'B' });
              continue;
            }
          }
          // Median across sub-cells
          const meds = subCells.map(([, v]) => v.median != null ? v.median : v.total.median).sort((a, b) => a - b);
          const lows = subCells.map(([, v]) => v.low != null ? v.low : v.total?.low).filter(x => x != null);
          const highs = subCells.map(([, v]) => v.high != null ? v.high : v.total?.high).filter(x => x != null);
          if (meds.length > 0) {
            out.push({
              cell: `${cellKey}.aggregate`,
              low: Math.min(...lows),
              median: meds[Math.floor(meds.length / 2)],
              high: Math.max(...highs),
              tier: 'B',
            });
          }
        }
      }
    }
  }

  return out;
}

/** Aggregate {low, median, high} across all publishable cells for a role.
    Uses preferred cell if specified in ROLE_MAP, else medians across cells.  */
export function getRoleCompensation(clusterKey, roleKey) {
  const cells = getCompensationCells(clusterKey, roleKey);
  if (!cells || cells.length === 0) return null;
  const rd = roleDescriptor(clusterKey, roleKey);
  // Prefer the cell explicitly mapped if present
  if (rd?.cell) {
    const preferred = cells.find(c => c.cell === rd.cell || c.cell.endsWith('.' + rd.cell));
    if (preferred) return { ...preferred, source: 'cell_mapped' };
  }
  // Filter out tier C unless that's all we have
  const usable = cells.filter(c => c.tier !== 'C');
  const pool = usable.length > 0 ? usable : cells;
  // Median across the pool (lower-middle for even n — conservative on skewed distributions)
  const sorted = [...pool].sort((a, b) => a.median - b.median);
  const mid = sorted[Math.floor((sorted.length - 1) / 2)];
  // Aggregate spread across pool
  const allLow = Math.min(...pool.map(c => c.low ?? c.median));
  const allHigh = Math.max(...pool.map(c => c.high ?? c.median));
  return { low: allLow, median: mid.median, high: allHigh, tier: mid.tier, source: 'aggregate' };
}

/** Published 14-year median salary curve when role has one. */
export function getSalaryCurve(clusterKey, roleKey) {
  const d = _cache;
  if (!d) return null;
  const rd = roleDescriptor(clusterKey, roleKey);
  const cd = clusterDescriptor(clusterKey);
  if (!rd || !cd) return null;
  const role = d[cd.ds]?.[rd.ds];
  return role?.salary_curve_lpa_median || null;
}

/* ── CVI accessors (0.0–3.0 scale, Mumbai Big-4 audit = 1.0) ─────── */

export function getRoleCVI(clusterKey, roleKey) {
  const d = _cache;
  if (!d) return null;
  const rd = roleDescriptor(clusterKey, roleKey);
  const cd = clusterDescriptor(clusterKey);
  if (!rd || !cd) return null;
  // First try the role-level annotation
  const role = d[cd.ds]?.[rd.ds];
  if (role?.career_volatility_index != null) {
    const raw = role.career_volatility_index;
    // Some roles (software_engineer, founder_by_funding_stage) have dict-valued CVI
    // with sub-track keys. Pick a sensible default.
    if (typeof raw === 'number') {
      return { value: raw, source: 'role_annotation' };
    } else if (typeof raw === 'object') {
      // Prefer cell-specific lookup if role has a mapped cell
      if (rd.cell && raw[rd.cell] != null) {
        return { value: raw[rd.cell], source: 'role_annotation_cell' };
      }
      // Else: take the median value across keys
      const vals = Object.values(raw).filter(v => typeof v === 'number').sort((a, b) => a - b);
      if (vals.length > 0) {
        const median = vals[Math.floor(vals.length / 2)];
        return { value: median, source: 'role_annotation_median' };
      }
    }
  }
  // Try career_volatility_index_extended by mapped cviKey
  const cviExt = d.career_volatility_index_extended?.[cd.ds];
  if (cviExt && rd.cviKey && cviExt[rd.cviKey] != null) {
    return { value: cviExt[rd.cviKey], source: 'extended' };
  }
  // Tier 2/3 lookup
  const cvi23 = d.career_volatility_index_tier_2_3?.[cd.ds];
  if (cvi23) {
    if (cvi23[rd.ds] != null) return { value: cvi23[rd.ds], source: 'tier_2_3' };
  }
  return null;
}

/* ── Automation risk (0-100, higher = more displaceable) ─────────── */

export function getRoleAutomationRisk(clusterKey, roleKey) {
  const d = _cache;
  if (!d) return null;
  const rd = roleDescriptor(clusterKey, roleKey);
  const cd = clusterDescriptor(clusterKey);
  if (!rd || !cd) return null;
  // Role-level annotation
  const role = d[cd.ds]?.[rd.ds];
  if (role?.automation_risk != null) return { value: role.automation_risk, source: 'role_annotation' };
  // Sub-role extended lookup
  const ext = d.automation_risk_by_sub_role_wef_2025_extended?.[cd.ds];
  if (ext && rd.cviKey && ext[rd.cviKey] != null) return { value: ext[rd.cviKey], source: 'sub_role_extended' };
  // Tier 2/3 lookup
  const t23 = d.automation_risk_tier_2_3_sub_role?.[cd.ds];
  if (t23 && t23[rd.ds] != null) return { value: t23[rd.ds], source: 'tier_2_3' };
  return null;
}

/* ── City accessors (28 Indian cities, all tier-S) ───────────────── */

export function getAllCities() {
  const d = _cache;
  if (!d) return [];
  const cities = d.city_cost_of_living?.cities || {};
  return Object.entries(cities).map(([key, v]) => ({
    key, label: key.replace(/_/g, ' '),
    col: v.col, rent: v.rent, colPlusRent: v.col_plus_rent,
    purchasingPower: v.purchasing_power, ctMultiplier: v.ct_multiplier,
    weighted: v.indian_weighted_index,
  }));
}

export function getCity(key) {
  const cities = getAllCities();
  return cities.find(c => c.key === key) || null;
}

export function mumbaiBaseline() {
  const d = _cache;
  return d?.city_cost_of_living?._baseline_col_plus_rent || 22.3;
}

/* ── Common drivers ──────────────────────────────────────────────── */

export function careerStageGrowth(stage) {
  const d = _cache;
  return d?.common_drivers?.salary_growth_rate_annual_increment?.by_career_stage?.[stage] || null;
}

export function careerStageForExperience(yrs) {
  if (yrs < 4) return 'junior_year_1_to_3';
  if (yrs < 8) return 'manager_year_4_to_7';
  if (yrs < 16) return 'senior_year_8_to_15';
  return 'leadership_year_15_plus';
}

export function nationalGrowthDefault() {
  const d = _cache;
  return d?.common_drivers?.salary_growth_rate_annual_increment?.national_2026_projected || 0.091;
}

export function topPerformerMultiplier() {
  const d = _cache;
  return d?.common_drivers?.salary_growth_rate_annual_increment?.top_performer_multiplier || 1.7;
}

/** Get the full discount rate (risk-free + path premium) for a given path key.
    pathKey is one of the 18 keys under career_risk_premium_by_path.       */
export function getDiscountRate(pathKey) {
  const d = _cache;
  if (!d) return 0.09;
  const rf = d.common_drivers?.discount_rate?.risk_free_g_sec_10yr || 0.07;
  const premium = d.common_drivers?.discount_rate?.career_risk_premium_by_path?.[pathKey];
  if (premium == null) return rf + 0.02; // sensible fallback
  return rf + premium;
}

/** Map a UI cluster+role to the right discount path key. */
export function discountPathFor(clusterKey, roleKey) {
  return DISCOUNT_PATH_MAP[clusterKey]?.[roleKey] || 'industry_finance';
}

/* ── Skill premiums ──────────────────────────────────────────────── */

export function getSkillCategories() {
  const d = _cache;
  return d?.skill_premiums_cross_cluster ? Object.keys(d.skill_premiums_cross_cluster).filter(k => !k.startswith?.('_') && !k.startsWith('_')) : [];
}

export function getAllSkills() {
  const d = _cache;
  if (!d?.skill_premiums_cross_cluster) return [];
  const out = [];
  for (const [cat, skills] of Object.entries(d.skill_premiums_cross_cluster)) {
    if (cat.startsWith('_')) continue;
    if (typeof skills !== 'object') continue;
    for (const [skillKey, prem] of Object.entries(skills)) {
      if (skillKey.startsWith('_')) continue;
      out.push({
        category: cat, key: skillKey,
        label: humanizeSkill(skillKey),
        premiumLow: prem.low, premiumMedian: prem.median, premiumHigh: prem.high,
        tier: prem.tier,
      });
    }
  }
  return out;
}

export function getLearningHours(category, skillKey) {
  const d = _cache;
  if (!d?.skill_learning_hours_to_proficiency) return null;
  // Category mapping: finance_skills → finance, tech_skills → tech, etc.
  const catKey = category.replace(/_skills$/, '');
  const cat = d.skill_learning_hours_to_proficiency[catKey];
  if (!cat) return null;
  // Try direct skill key
  if (cat[skillKey] != null) return cat[skillKey];
  // Try variations
  for (const k of Object.keys(cat)) {
    if (skillKey.includes(k) || k.includes(skillKey)) return cat[k];
  }
  return null;
}

/* ── Sector attrition (Aon 2024-25) ──────────────────────────────── */

export function getSectorAttrition(sector) {
  const d = _cache;
  return d?.sector_attrition_aon_2024_25?.[sector] || null;
}

export function getAttritionForCluster(clusterKey) {
  const map = {
    finance: 'financial_services', consulting: 'professional_services_big4',
    technology: 'hi_tech_product_companies', product_design: 'hi_tech_product_companies',
    sales: 'ecommerce', marketing: 'ecommerce',
    operator_founder: 'ecommerce', law: 'professional_services_big4',
    operations: 'engineering', hr: 'professional_services_big4',
    healthcare: 'india_overall_2025', engineering_non_software: 'engineering',
    creative_media: 'india_overall_2025', academia_research: 'india_overall_2025',
    government_psu: 'india_overall_2025',
  };
  const sector = map[clusterKey] || 'india_overall_2025';
  return getSectorAttrition(sector);
}

/* ── Compensation matrix v2 ──────────────────────────────────────── */

export function getDomains() {
  const d = _cache;
  if (!d?.compensation_matrix_v2) return [];
  return Object.entries(d.compensation_matrix_v2.domains).map(([k, v]) => ({ value: k, label: v.display, description: v.description }));
}

export function getFirmTypes() {
  const d = _cache;
  if (!d?.compensation_matrix_v2) return [];
  return Object.entries(d.compensation_matrix_v2.firm_types).map(([k, v]) => ({ value: k, label: v.display }));
}

export function getExperienceBands() {
  const d = _cache;
  if (!d?.compensation_matrix_v2) return [];
  return Object.entries(d.compensation_matrix_v2.experience_bands).map(([k, v]) => ({ value: k, label: v.display, midYr: v.mid_yr }));
}

export function getCareerLevels() {
  const d = _cache;
  if (!d?.compensation_matrix_v2) return [];
  return Object.entries(d.compensation_matrix_v2.career_levels).map(([k, v]) => ({ value: k, label: v.display }));
}

export function getMatrixCell(domain, firmType, expBand, careerLevel) {
  const d = _cache;
  if (!d?.compensation_matrix_v2) return null;
  const key = `${domain}|${firmType}|${expBand}|${careerLevel}`;
  return d.compensation_matrix_v2.cells[key] || null;
}

export function listMatrixCells() {
  const d = _cache;
  if (!d?.compensation_matrix_v2) return [];
  return Object.entries(d.compensation_matrix_v2.cells).map(([key, v]) => {
    const [domain, firmType, expBand, careerLevel] = key.split('|');
    return { key, domain, firmType, expBand, careerLevel, ...v };
  });
}

/* ── MC event probabilities & demand growth ──────────────────────── */

export function getMcEventProb(event) {
  const d = _cache;
  return d?.monte_carlo_event_probabilities_annual?.[event] || null;
}

export function getDemandGrowth(sector) {
  const d = _cache;
  return d?.demand_growth_yoy_naukri_jobspeak_2025_26?.[sector] || null;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function humanizeSkill(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
