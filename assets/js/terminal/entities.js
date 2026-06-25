/* ──────────────────────────────────────────────────────────────────────
   TERMINAL · entity extraction

   Pulls structured entities from raw query text. Pure functions, no
   network, no LLM. Returns a typed entity bag the classifier and
   recipes consume.

   Entity types:
     city       — matched against benchmark city universe (28 Indian cities)
     comp       — ₹ figures (₹14L, 14L, "fourteen lakhs", "35 lakh")
     years      — "in 3 years", "5 yr", "for a decade"
     skill      — matched against benchmark skill universe (~21 skills)
     cluster    — matched against benchmark cluster labels
     role       — matched against benchmark role labels
     firm_type  — Big 4, MBB, FAANG, GCC, startup, IB, PE/VC, etc.
   ────────────────────────────────────────────────────────────────────── */

import {
  CLUSTER_MAP, ROLE_MAP, getAllCities, getAllSkills, getFirmTypes,
} from '../data/benchmarks.js';

const WORD_TO_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

// Role keyword index — short triggers that unambiguously identify a role.
const ROLE_KEYWORDS = {
  finance: {
    'tp': ['transfer pricing', 'tp', ' tp ', 'tp manager', 'tp associate'],
    'ib-analyst': ['ib analyst', 'investment banking analyst', 'ibd analyst', 'investment banking', 'ibd'],
    'ib-associate': ['ib associate', 'investment banking associate'],
    'pe-vc': ['pe', 'private equity', 'venture capital', 'vc', 'pe vc', 'pe/vc'],
    'er': ['equity research', 'er analyst'],
    'fpa': ['fp&a', 'fpa', 'fp and a', 'corporate finance'],
    'tax': ['big 4 tax', 'tax associate', 'tax manager'],
    'ca-industry': ['ca industry', 'ca controller', 'industry ca'],
    'treasury': ['treasury', 'actuarial'],
  },
  consulting: {
    'mbb-consultant': ['mbb', 'mbb consultant', 'mckinsey', 'bcg', 'bain', 'mbb associate'],
    'mbb-em': ['engagement manager', 'em at mbb', 'mbb em'],
    'big4-strategy': ['big 4 strategy', 'big4 advisory', 'monitor deloitte', 'parthenon', 'strategy&'],
    'boutique': ['boutique consulting'],
    'corp-strategy': ['corporate strategy', 'internal strategy', 'corp strategy'],
  },
  technology: {
    'swe-junior': ['junior engineer', 'sde 1', 'sde1', 'junior swe', 'fresher engineer'],
    'swe-mid': ['mid engineer', 'sde 2', 'sde2', 'software engineer', 'swe'],
    'swe-senior': ['senior engineer', 'senior swe', 'sde 3', 'sde3', 'staff engineer'],
    'ds': ['data scientist', 'ds'],
    'mle': ['ml engineer', 'machine learning engineer', 'mle'],
    'em': ['engineering manager', 'em'],
    'vp-cto': ['cto', 'vp engineering', 'head of engineering'],
    'devops': ['devops', 'sre', 'site reliability'],
    'security': ['security engineer', 'cybersecurity'],
  },
  product_design: {
    'pm-junior':  ['apm', 'associate pm', 'junior pm'],
    'pm-mid':     ['product manager', 'pm', ' pm '],
    'pm-senior':  ['senior pm', 'principal pm', 'lead pm'],
    'designer':   ['designer', 'ux designer', 'ui designer', 'product designer'],
  },
  operator_founder: {
    'pre-seed':      ['pre seed', 'pre-seed founder'],
    'founder-seed':  ['seed founder', 'seed funded'],
    'founder-a':     ['series a', 'a round founder'],
    'founder-b':    ['series b', 'b round founder'],
    'founder-c':    ['series c', 'pre ipo', 'pre-ipo founder'],
    'founder-boots':['bootstrapped', 'bootstrap founder'],
  },
  government_psu: {
    'ias': ['ias', 'ips', 'civil services', 'upsc'],
    'rbi': ['rbi', 'rbi grade b'],
    'psu-exec': ['psu', 'maharatna', 'navratna'],
  },
};

// Skill keyword index
const SKILL_KEYWORDS = {
  'cfa_charterholder': ['cfa', 'cfa charter', 'cfa charterholder'],
  'ca_plus_cfa_stacking': ['ca cfa', 'ca and cfa', 'stacking ca cfa'],
  'us_cpa': ['us cpa', 'cpa', 'american cpa'],
  'frm': ['frm', 'risk manager certification'],
  'financial_modeling': ['financial modelling', 'financial modeling', 'fin modeling'],
  'advanced_dsa_system_design': ['system design', 'dsa', 'advanced dsa'],
  'genai_llm_specialization': ['genai', 'llm', 'large language model'],
  'rlhf_dpo_post_training': ['rlhf', 'dpo', 'post training', 'post-training'],
  'kubernetes_aws_certified_solutions_architect': ['kubernetes', 'aws certified', 'k8s'],
  'ml_ops_production_systems': ['mlops', 'ml ops'],
  'ai_ml_pm_certification_plus_shipped': ['ai pm', 'ml pm', 'ai product manager'],
  'fintech_domain_depth': ['fintech', 'fintech domain'],
  'b2b_saas_enterprise_experience': ['b2b saas', 'saas enterprise'],
  'technical_pm_with_swe_background': ['technical pm', 'tpm'],
  'case_interview_mastery_top_iim_brand': ['case interview', 'case prep', 'iim'],
  'industry_specialization_5_plus_yr': ['industry specialization'],
  'advanced_analytics_python_in_consulting': ['analytics python', 'consulting python'],
  'advanced_excel_powerbi': ['excel', 'power bi', 'powerbi'],
  'data_analytics_sql_python': ['sql', 'python', 'data analytics'],
  'ai_literacy_workflow_design': ['ai literacy', 'workflow design'],
  'executive_communication_storytelling': ['executive communication', 'storytelling'],
};

// Firm-type keywords (for matrix axis resolution)
const FIRM_KEYWORDS = {
  'big4': ['big 4', 'big4', 'deloitte', 'ey', 'kpmg', 'pwc'],
  'tier2_consulting': ['bdo', 'grant thornton', 'rsm', 'tier 2', 'tier2'],
  'boutique_ca': ['boutique ca'],
  'mnc_corporate': ['mnc', 'unilever', 'microsoft', 'p&g', 'pfizer'],
  'indian_listed': ['tata', 'reliance', 'adani', 'itc', 'indian listed'],
  'bulge_bracket_ib': ['goldman', 'morgan stanley', 'jpm', 'citi', 'bulge bracket'],
  'domestic_ib': ['kotak', 'axis', 'jm financial', 'avendus', 'domestic ib'],
  'pe_vc_fund': ['pe fund', 'vc fund'],
  'startup': ['startup'],
  'indian_bank': ['hdfc', 'icici', 'sbi', 'indian bank'],
};

const CITY_ALIASES = {
  'Mumbai': ['mumbai', 'bombay', 'south mumbai'],
  'Bangalore': ['bangalore', 'bengaluru', 'blr'],
  'Delhi': ['delhi', 'new delhi'],
  'Gurgaon': ['gurgaon', 'gurugram'],
  'Noida': ['noida'],
  'Hyderabad': ['hyderabad', 'hyd'],
  'Chennai': ['chennai', 'madras'],
  'Pune': ['pune'],
  'Kolkata': ['kolkata', 'calcutta'],
  'Ahmedabad': ['ahmedabad'],
  'Thane': ['thane'],
  'Navi_Mumbai': ['navi mumbai', 'navi'],
  'Chandigarh': ['chandigarh'],
  'Kochi': ['kochi', 'cochin', 'ernakulam'],
  'Indore': ['indore'],
  'Bhubaneswar': ['bhubaneswar', 'bbsr'],
  'Jaipur': ['jaipur'],
  'Lucknow': ['lucknow'],
  'Bhopal': ['bhopal'],
  'Patna': ['patna'],
  'Dehradun': ['dehradun', 'doon'],
  'Coimbatore': ['coimbatore'],
  'Surat': ['surat'],
  'Vadodara': ['vadodara', 'baroda'],
  'Rajkot': ['rajkot'],
  'Guwahati': ['guwahati'],
  'Thiruvananthapuram': ['thiruvananthapuram', 'trivandrum', 'tvm'],
  'Mughalsarai_Varanasi_proxy': ['mughalsarai', 'varanasi', 'banaras'],
};

// Cluster-only keywords — fires when query mentions a cluster but no specific role
const CLUSTER_KEYWORDS = {
  finance:           ['finance', 'accounting', 'audit', 'big 4 audit'],
  consulting:        ['consulting', 'strategy consulting', 'management consulting'],
  technology:        ['tech', 'software', 'engineering', 'developer'],
  product_design:    ['product management', 'product role', 'design role'],
  marketing:         ['marketing', 'brand', 'growth role'],
  sales:             ['sales role', 'go to market', 'gtm'],
  operator_founder:  ['founder', 'startup founder', 'entrepreneur'],
  law:               ['law', 'legal', 'litigation', 'in-house counsel role'],
  operations:        ['operations role', 'supply chain'],
  hr:                ['hr', 'people ops', 'human resources'],
  healthcare:        ['healthcare', 'pharma', 'medicine'],
  engineering_non_software: ['mechanical', 'civil engineering'],
  creative_media:    ['journalism', 'media', 'content', 'film'],
  academia_research: ['academia', 'research', 'phd', 'professor'],
  government_psu:    ['psu', 'government job', 'civil services'],
};

export function extractEntities(query) {
  const q = ' ' + query.toLowerCase().replace(/[^a-z0-9₹., \-/]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const ent = {
    cities: [],
    comps: [],
    years: [],
    skills: [],
    cluster: null,
    role: null,
    firmType: null,
    raw: query,
  };

  // City extraction — multiple cities possible (for moves)
  for (const [cityKey, aliases] of Object.entries(CITY_ALIASES)) {
    for (const alias of aliases) {
      if (q.includes(' ' + alias + ' ') || q.includes(' ' + alias + ',') || q.includes(' ' + alias + '?')) {
        if (!ent.cities.find(c => c.key === cityKey)) {
          const idx = q.indexOf(alias);
          ent.cities.push({ key: cityKey, alias, position: idx });
        }
        break;
      }
    }
  }
  ent.cities.sort((a, b) => a.position - b.position);

  // Comp extraction — ₹14L, 14 lakhs, 14L, 14 L, 14L pa, ₹14L offer, 35l, 1.5cr, 2cr
  const compPatterns = [
    /(?:₹|rs\.?|inr\s+)?\s*(\d+(?:\.\d+)?)\s*(?:l|lakh|lakhs|lacs)\b/gi,
    /(?:₹|rs\.?|inr\s+)?\s*(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b/gi,
  ];
  for (let i = 0; i < compPatterns.length; i++) {
    const re = compPatterns[i];
    let m;
    while ((m = re.exec(q)) !== null) {
      const val = parseFloat(m[1]);
      const isCr = i === 1;
      ent.comps.push({ value: isCr ? val * 100 : val, raw: m[0].trim(), unit: isCr ? 'cr' : 'l' });
    }
  }
  // Word-based numbers near "lakh"/"crore"
  const wordCompRe = new RegExp('\\b(' + Object.keys(WORD_TO_NUM).join('|') + ')\\s+(?:lakh|lakhs|lacs|crore|crores)\\b', 'gi');
  let wm;
  while ((wm = wordCompRe.exec(q)) !== null) {
    const val = WORD_TO_NUM[wm[1].toLowerCase()];
    const isCr = wm[0].toLowerCase().includes('crore');
    if (val) ent.comps.push({ value: isCr ? val * 100 : val, raw: wm[0].trim(), unit: isCr ? 'cr' : 'l' });
  }

  // Years extraction — "in 5 years", "3 yr", "for a decade"
  const yearPatterns = [
    /\b(\d+)\s*(?:yr|year|years|yrs)\b/gi,
    /\bin\s+(\d+)\s*(?:yr|year|years|yrs)?\b/gi,
  ];
  for (const re of yearPatterns) {
    let m;
    while ((m = re.exec(q)) !== null) {
      const v = parseInt(m[1], 10);
      if (v > 0 && v < 50) {
        if (!ent.years.find(y => y.value === v)) ent.years.push({ value: v, raw: m[0].trim() });
      }
    }
  }
  if (/\b(?:decade|10 yr|10 years)\b/i.test(q) && !ent.years.find(y => y.value === 10)) {
    ent.years.push({ value: 10, raw: 'decade' });
  }

  // Skill extraction
  for (const [skillKey, aliases] of Object.entries(SKILL_KEYWORDS)) {
    for (const alias of aliases) {
      if (q.includes(' ' + alias) || q.includes(alias + ' ')) {
        if (!ent.skills.find(s => s.key === skillKey)) ent.skills.push({ key: skillKey, alias });
        break;
      }
    }
  }

  // Role extraction — collect ALL matches in query order, keep best (longest alias) as ent.role
  const roleMatches = [];
  for (const [clusterKey, roles] of Object.entries(ROLE_KEYWORDS)) {
    for (const [roleKey, aliases] of Object.entries(roles)) {
      for (const alias of aliases) {
        const aliasNorm = ' ' + alias.trim() + ' ';
        if (q.includes(aliasNorm)) {
          const pos = q.indexOf(aliasNorm);
          // Dedupe: if same cluster/role already captured at the same position, skip
          if (!roleMatches.find(m => m.cluster === clusterKey && m.role === roleKey && m.position === pos)) {
            roleMatches.push({ cluster: clusterKey, role: roleKey, alias, length: alias.length, position: pos });
          }
        }
      }
    }
  }
  // Sort by position (left-to-right in query)
  roleMatches.sort((a, b) => a.position - b.position);
  ent.roles = roleMatches;
  // ent.role = best (longest alias)
  let bestRoleMatch = { length: 0 };
  for (const m of roleMatches) {
    if (m.length > bestRoleMatch.length) bestRoleMatch = m;
  }
  if (bestRoleMatch.cluster) {
    ent.cluster = bestRoleMatch.cluster;
    ent.role = bestRoleMatch.role;
  }

  // Cluster-only matches — for queries that name clusters without specific roles
  const clusterMatches = [];
  for (const [clusterKey, aliases] of Object.entries(CLUSTER_KEYWORDS)) {
    for (const alias of aliases) {
      const aliasNorm = ' ' + alias + ' ';
      if (q.includes(aliasNorm)) {
        const pos = q.indexOf(aliasNorm);
        if (!clusterMatches.find(m => m.cluster === clusterKey)) {
          clusterMatches.push({ cluster: clusterKey, alias, position: pos });
        }
        break;
      }
    }
  }
  clusterMatches.sort((a, b) => a.position - b.position);
  ent.clusters = clusterMatches;
  if (!ent.cluster && clusterMatches.length > 0) {
    ent.cluster = clusterMatches[0].cluster;
  }

  // Firm type
  for (const [firmKey, aliases] of Object.entries(FIRM_KEYWORDS)) {
    for (const alias of aliases) {
      if (q.includes(' ' + alias) || q.includes(alias + ' ')) {
        ent.firmType = firmKey;
        break;
      }
    }
    if (ent.firmType) break;
  }

  return ent;
}
