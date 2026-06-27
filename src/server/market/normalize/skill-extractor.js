/* ──────────────────────────────────────────────────────────────────────
   SKILL EXTRACTOR — Phase 2 expansion.

   Cluster-scoped skill dictionaries. Each skill_key is global (same key
   across clusters); only the cluster's set of relevant skills is
   scanned for postings of that cluster. This prevents Finance postings
   from triggering Sales/CRM skill keys etc.

   Skill keys are stable; aliases only change.
   ────────────────────────────────────────────────────────────────────── */

const GLOBAL = {
  sql:                 [/\bsql\b/i],
  python:              [/\bpython\b/i],
  excel_advanced:      [/\b(advanced\s+excel|excel\s+(modeling|modelling)|excel\s+power\s+query)\b/i],
  power_bi:            [/\bpower\s*bi\b/i, /\bpbi\b/i],
  tableau:             [/\btableau\b/i],
  looker:              [/\blooker\b/i],
};

const FINANCE = {
  ...GLOBAL,
  sap:                 [/\bsap\b/i, /\bsap\s+fico\b/i],
  oracle_fusion:       [/\boracle\s+fusion\b/i],
  hyperion:            [/\bhyperion\b/i],
  anaplan:             [/\banaplan\b/i],
  ifrs:                [/\bifrs\b/i],
  ind_as:              [/\bind\s*as\b/i],
  dcf:                 [/\bdcf\b/i],
  valuation_modeling:  [/\bvaluation\b/i, /\bfinancial\s+model(l)?ing\b/i],
  m_and_a:             [/\bm\s*&\s*a\b/i],
  due_diligence:       [/\bdue\s+diligence\b/i],
  oecd_tp_guidelines:  [/\boecd\b/i, /\bbenchmarking\s+study\b/i],
  tp_documentation:    [/\btp\s+documentation\b/i, /\bsegment\s+report(ing)?\b/i],
  gst_compliance:      [/\bgst\s+(return|compliance|filing)\b/i],
  sox:                 [/\bsox\b/i],
  vba:                 [/\bvba\b/i],
};

const CONSULTING = {
  ...GLOBAL,
  case_problem_solving:[/\bcase\s+(interview|study|approach)\b/i, /\bproblem[\s-]solving\b/i],
  market_sizing:       [/\bmarket\s+sizing\b/i],
  slide_writing:       [/\b(slide\s+writing|ppt\s+(decks?|writing))\b/i],
  valuation_modeling:  [/\bvaluation\b/i, /\bfinancial\s+model(l)?ing\b/i],
  due_diligence:       [/\bdue\s+diligence\b/i],
  primary_research:    [/\bprimary\s+research\b/i, /\bexpert\s+interviews?\b/i],
  m_and_a:             [/\bm\s*&\s*a\b/i],
};

const TECH = {
  ...GLOBAL,
  javascript:          [/\bjavascript\b/i, /\btypescript\b/i],
  java:                [/\bjava\b(?!\s*script)/i],
  react:               [/\breact(\.js)?\b/i],
  node:                [/\bnode(\.js)?\b/i],
  aws:                 [/\baws\b/i],
  gcp:                 [/\bgcp\b/i, /\bgoogle\s+cloud\b/i],
  azure:               [/\bazure\b/i],
  docker:              [/\bdocker\b/i],
  kubernetes:          [/\bkubernetes\b/i, /\bk8s\b/i],
  pytorch:             [/\bpytorch\b/i],
  tensorflow:          [/\btensorflow\b/i],
  dbt:                 [/\bdbt\b/i],
  airflow:             [/\bairflow\b/i],
  snowflake:           [/\bsnowflake\b/i],
  spark:               [/\bspark\b/i],
  product_strategy:    [/\bproduct\s+strategy\b/i],
  a_b_testing:         [/\ba\/?b\s+test/i],
  figma:               [/\bfigma\b/i],
};

const SALES = {
  ...GLOBAL,
  salesforce:          [/\bsalesforce\b/i, /\bsfdc\b/i],
  hubspot:             [/\bhubspot\b/i],
  google_ads:          [/\bgoogle\s+ads\b/i, /\badwords\b/i],
  meta_ads:            [/\bmeta\s+ads\b/i, /\bfacebook\s+ads\b/i],
  ga4:                 [/\bga\s*4\b/i, /\bgoogle\s+analytics\b/i],
  mixpanel:            [/\bmixpanel\b/i],
  amplitude:           [/\bamplitude\b/i],
  braze:               [/\bbraze\b/i],
  clevertap:           [/\bclevertap\b/i],
  marketo:             [/\bmarketo\b/i],
  seo:                 [/\bseo\b/i],
  sem:                 [/\bsem\b/i],
  copywriting:         [/\bcopywriting\b/i],
  pipeline_mgmt:       [/\bpipeline\s+management\b/i],
  outbound:            [/\boutbound\s+prospect/i],
};

const OPS = {
  ...GLOBAL,
  sap:                 [/\bsap\b/i],
  oracle:              [/\boracle\b/i],
  ariba:               [/\bariba\b/i],
  coupa:               [/\bcoupa\b/i],
  six_sigma:           [/\bsix\s*sigma\b/i],
  lean:                [/\blean\b/i],
  demand_planning:     [/\bdemand\s+planning\b/i, /\bs\s*&\s*op\b/i],
  procurement_strategy:[/\bprocurement\s+strategy\b/i],
  vendor_mgmt:         [/\bvendor\s+management\b/i],
  inventory_mgmt:      [/\binventory\s+management\b/i],
  wms:                 [/\bwms\b/i, /\bwarehouse\s+management\b/i],
};

const HR_DICT = {
  ...GLOBAL,
  workday:             [/\bworkday\b/i],
  successfactors:      [/\bsuccess\s*factors\b/i],
  hr_analytics:        [/\bhr\s+analytics\b/i, /\bpeople\s+analytics\b/i],
  talent_pipeline:     [/\btalent\s+pipeline\b/i],
  employer_branding:   [/\bemployer\s+branding\b/i],
};

const LEGAL_DICT = {
  ...GLOBAL,
  contract_review:     [/\bcontract\s+review\b/i, /\bcontract\s+(drafting|negotiation)\b/i],
  litigation:          [/\blitigation\b/i],
  compliance_aml:      [/\baml\b/i, /\bkyc\b/i],
  regulatory_filings:  [/\bregulatory\s+filings?\b/i],
  ipr:                 [/\bipr\b/i, /\bintellectual\s+property\b/i],
};

const RESEARCH = {
  ...GLOBAL,
  bloomberg:           [/\bbloomberg\b/i],
  capital_iq:          [/\bcapital\s*iq\b/i],
  factset:             [/\bfact\s*set\b/i],
  valuation_modeling:  [/\bvaluation\b/i, /\bfinancial\s+model(l)?ing\b/i],
  primary_research:    [/\bprimary\s+research\b/i],
  competitive_intel:   [/\bcompetitive\s+(intel|intelligence)\b/i],
};

const DESIGN = {
  figma:               [/\bfigma\b/i],
  sketch:              [/\bsketch\b/i],
  adobe:               [/\badobe\s+(xd|photoshop|illustrator)\b/i],
  prototyping:         [/\bprototyping\b/i],
  user_research:       [/\buser\s+research\b/i],
  design_systems:      [/\bdesign\s+systems?\b/i],
};

const GOVT = {
  // PSU postings rarely list "skills" in the modern sense
  upsc:                [/\bupsc\b/i, /\bcivil\s+services\b/i],
};

const ACADEMIA = {
  curriculum_design:   [/\bcurriculum\s+(design|development)\b/i],
  pedagogy:            [/\bpedagogy\b/i],
  research_publications:[/\bpeer[\s-]reviewed\b/i, /\bpublications?\b/i],
  ...GLOBAL,
};

const HEALTHCARE = {
  ...GLOBAL,
  pharma_promotion:    [/\bbrand\s+promotion\b/i, /\bdetail(ing|er)\b/i],
  msl:                 [/\bmsl\b/i, /\bmedical\s+science\s+liaison\b/i],
  clinical_trials:     [/\bclinical\s+trials?\b/i],
  hospital_ops:        [/\bhospital\s+operations\b/i, /\bbed\s+management\b/i],
  diagnostics:         [/\bdiagnostics?\b/i, /\bpathology\b/i],
};

const BY_CLUSTER = {
  fin_acct_tax:                       FINANCE,
  consulting_strategy_deals:          CONSULTING,
  product_tech_data:                  TECH,
  sales_marketing_growth:             SALES,
  ops_scm_procurement:                OPS,
  hr_talent_ld:                       HR_DICT,
  legal_compliance_risk_policy:       LEGAL_DICT,
  research_analytics_knowledge:       RESEARCH,
  design_creative_media:              DESIGN,
  govt_psu_public_sector:             GOVT,
  academia_education_training:        ACADEMIA,
  healthcare_pharma_clinical_business:HEALTHCARE,
};

export function extractSkills(clusterKey, title = '', description = '') {
  const dict = BY_CLUSTER[clusterKey] || GLOBAL;
  const text = `${title} ${description}`;
  const found = [];
  for (const [skill_key, patterns] of Object.entries(dict)) {
    if (patterns.some(rx => rx.test(text))) found.push(skill_key);
  }
  return found;
}

/* Exported for the registry-drift CI check: every skill_key the
   extractor can emit. Useful for the canonical-key assertion. */
export function allSkillKeys() {
  const keys = new Set();
  for (const dict of Object.values(BY_CLUSTER)) {
    for (const k of Object.keys(dict)) keys.add(k);
  }
  return [...keys];
}
