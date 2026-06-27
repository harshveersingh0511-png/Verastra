/* ──────────────────────────────────────────────────────────────────────
   PATHS — Verastra canonical path registry (Market Overlay V1)

   Single source of truth for path-level classification.

   This registry is the binding contract between Layer A (benchmark) and
   Layer B (market overlay). The overlay classifier MUST emit path_key
   values from this file. The aggregator's writer asserts every doc's
   path_key against this registry — a non-canonical path_key aborts the
   write and logs to overlay_debug_runs.

   Each path declares:
     cluster_key         — the cluster this path lives in (see clusters.js)
     path_key            — canonical Verastra key (immutable)
     label               — user-facing label
     benchmark_path_ref  — pointer into benchmarks_master.json
                           { cluster_node, path_node }
                           or null + reason if no direct cell exists
     aliases             — alternate surface forms (for skill/alias docs later)
     title_patterns      — regex array consumed by the cluster path classifier
     v1_overlay_status   — live | light | benchmark_only
        live           : overlay classifies into this path with adequate
                         coverage in V1
        light          : overlay classifies but signal expected to be thin
        benchmark_only : exists in Layer A but the overlay does not
                         classify into it in V1 (no patterns wired)

   IMPORTANT — benchmark_path_ref semantics
     Where a path has no direct cell in benchmarks_master.json, the ref is
     null with a `_ref_null_reason` field. The path is still valid for
     overlay classification, but interpretOverlay() cannot make
     benchmark-comparative claims for that path. Terminal recipes check
     this before composing comparative language.

   ────────────────────────────────────────────────────────────────────── */

export const PATHS = {

  /* ════════════════════ FINANCE, ACCOUNTING & TAX ═══════════════════ */

  fpa: {
    cluster_key: 'fin_acct_tax',
    path_key: 'fpa',
    label: 'FP&A',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'fp_and_a_corporate_finance' },
    aliases: ['FP&A', 'FPnA', 'FP and A', 'Financial Planning and Analysis', 'Financial Planning & Analysis'],
    title_patterns: [
      /\b(fp\s*&?\s*a|fpna|financial\s+planning(\s+&\s+|\s+and\s+)?analysis)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  business_finance: {
    cluster_key: 'fin_acct_tax',
    path_key: 'business_finance',
    label: 'Business Finance',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated business_finance cell in benchmarks_master.json; closest neighbour is fp_and_a_corporate_finance under finance.',
    aliases: ['Business Finance', 'Biz Finance'],
    title_patterns: [
      /\bbusiness\s+finance\b/i,
    ],
    v1_overlay_status: 'live',
  },

  corporate_finance: {
    cluster_key: 'fin_acct_tax',
    path_key: 'corporate_finance',
    label: 'Corporate Finance',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'fp_and_a_corporate_finance' },
    aliases: ['Corporate Finance', 'Corp Finance'],
    title_patterns: [
      /\bcorporate\s+finance\b/i,
    ],
    v1_overlay_status: 'live',
  },

  treasury: {
    cluster_key: 'fin_acct_tax',
    path_key: 'treasury',
    label: 'Treasury',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'treasury_actuarial' },
    aliases: ['Treasury', 'Treasurer', 'Corporate Treasury'],
    title_patterns: [
      /\btreasur(y|er)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  investor_relations: {
    cluster_key: 'fin_acct_tax',
    path_key: 'investor_relations',
    label: 'Investor Relations',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated investor_relations cell; finance.fp_and_a_corporate_finance is the closest contextual neighbour.',
    aliases: ['Investor Relations', 'IR'],
    title_patterns: [
      /\binvestor\s+relations?\b/i,
    ],
    v1_overlay_status: 'light',
  },

  controllership: {
    cluster_key: 'fin_acct_tax',
    path_key: 'controllership',
    label: 'Controllership',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'chartered_accountant' },
    aliases: ['Controllership', 'Financial Controller', 'Controller'],
    title_patterns: [
      /\bcontroller(ship)?\b|\bfinancial\s+controller\b/i,
    ],
    v1_overlay_status: 'live',
  },

  internal_audit: {
    cluster_key: 'fin_acct_tax',
    path_key: 'internal_audit',
    label: 'Internal Audit',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'chartered_accountant' },
    aliases: ['Internal Audit', 'IA'],
    title_patterns: [
      /\binternal\s+audit\b/i,
    ],
    v1_overlay_status: 'live',
  },

  direct_tax: {
    cluster_key: 'fin_acct_tax',
    path_key: 'direct_tax',
    label: 'Direct Tax',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'chartered_accountant' },
    aliases: ['Direct Tax', 'Income Tax', 'Corporate Tax'],
    title_patterns: [
      /\b(direct\s+tax|income\s+tax|corporate\s+tax)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  transfer_pricing: {
    cluster_key: 'fin_acct_tax',
    path_key: 'transfer_pricing',
    label: 'Transfer Pricing',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'transfer_pricing' },
    aliases: ['Transfer Pricing', 'TP'],
    title_patterns: [
      /\btransfer\s+pricing\b/i,
      /\bTP\s+(analyst|consultant|manager|associate)\b/,
    ],
    v1_overlay_status: 'live',
  },

  gst_indirect_tax: {
    cluster_key: 'fin_acct_tax',
    path_key: 'gst_indirect_tax',
    label: 'GST / Indirect Tax',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'chartered_accountant' },
    aliases: ['GST', 'Indirect Tax', 'GST Compliance'],
    title_patterns: [
      /\b(gst|indirect\s+tax)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  finance_transformation: {
    cluster_key: 'fin_acct_tax',
    path_key: 'finance_transformation',
    label: 'Finance Transformation',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated finance_transformation cell; consulting.big4_strategy_advisory and finance.fp_and_a_corporate_finance are the closest neighbours.',
    aliases: ['Finance Transformation', 'Finance Modernization'],
    title_patterns: [
      /\bfinance\s+transformation\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ CONSULTING, STRATEGY & DEALS ══════════════════ */

  management_consulting: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'management_consulting',
    label: 'Management Consulting',
    benchmark_path_ref: { cluster_node: 'consulting', path_node: 'big4_strategy_advisory' },
    aliases: ['Management Consulting', 'Strategy Consulting', 'Consultant'],
    title_patterns: [
      /\b(management\s+consult(ant|ing)?|strategy\s+consult(ant|ing)?)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  corporate_strategy: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'corporate_strategy',
    label: 'Corporate Strategy',
    benchmark_path_ref: { cluster_node: 'consulting', path_node: 'internal_corporate_strategy' },
    aliases: ['Corporate Strategy', 'Corp Strategy', 'Internal Strategy'],
    title_patterns: [
      /\b(corporate|corp)\s+strategy\b/i,
    ],
    v1_overlay_status: 'live',
  },

  business_transformation: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'business_transformation',
    label: 'Business Transformation',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated business_transformation cell; closest is consulting.big4_strategy_advisory.',
    aliases: ['Business Transformation'],
    title_patterns: [
      /\bbusiness\s+transformation\b/i,
    ],
    v1_overlay_status: 'light',
  },

  deals_advisory: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'deals_advisory',
    label: 'Deals / Transaction Advisory',
    benchmark_path_ref: { cluster_node: 'consulting', path_node: 'big4_strategy_advisory' },
    aliases: ['Deals Advisory', 'Transaction Advisory', 'TAS'],
    title_patterns: [
      /\b(transaction\s+(advisor|services)|deals?\s+advisor(y)?)\b/i,
      /\bTAS\b/,
    ],
    v1_overlay_status: 'live',
  },

  m_and_a_advisory: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'm_and_a_advisory',
    label: 'M&A Advisory',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'investment_banking' },
    aliases: ['M&A Advisory', 'Mergers and Acquisitions'],
    title_patterns: [
      /\bm\s*&\s*a\s+(advisor|advisory|associate|analyst)\b/i,
      /\bmergers?\s+(and|&)\s+acquisitions?\b/i,
    ],
    v1_overlay_status: 'live',
  },

  founders_office: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'founders_office',
    label: 'Founder\u2019s Office',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated founders_office cell; closest is consulting.internal_corporate_strategy plus entrepreneurship_founder cluster.',
    aliases: ['Founder\u2019s Office', 'Founders Office'],
    title_patterns: [
      /\bfounder'?s\s+office\b/i,
    ],
    v1_overlay_status: 'light',
  },

  chief_of_staff: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'chief_of_staff',
    label: 'Chief of Staff',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated chief_of_staff cell; closest is consulting.internal_corporate_strategy.',
    aliases: ['Chief of Staff', 'CoS'],
    title_patterns: [
      /\bchief\s+of\s+staff\b/i,
      /\bCoS\b/,
    ],
    v1_overlay_status: 'light',
  },

  strategic_pmo: {
    cluster_key: 'consulting_strategy_deals',
    path_key: 'strategic_pmo',
    label: 'Strategic PMO',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated strategic_pmo cell; closest is consulting.internal_corporate_strategy.',
    aliases: ['Strategic PMO', 'PMO'],
    title_patterns: [
      /\bstrategic\s+pmo\b/i,
      /\bprogram\s+management\s+office\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ PRODUCT, TECHNOLOGY & DATA ══════════════════ */

  software_engineering: {
    cluster_key: 'product_tech_data',
    path_key: 'software_engineering',
    label: 'Software Engineering',
    benchmark_path_ref: { cluster_node: 'technology', path_node: 'software_engineer' },
    aliases: ['Software Engineer', 'SDE', 'Backend Engineer', 'Frontend Engineer', 'Full Stack Engineer'],
    title_patterns: [
      /\b(software|backend|frontend|full[\s-]?stack)\s+(engineer|developer)\b/i,
      /\bsde\b/i,
    ],
    v1_overlay_status: 'live',
  },

  data_analytics: {
    cluster_key: 'product_tech_data',
    path_key: 'data_analytics',
    label: 'Data Analytics',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated data_analytics cell; technology.data_scientist is closest but distinct.',
    aliases: ['Data Analyst', 'Analytics'],
    title_patterns: [
      /\bdata\s+analyst(ic)?s?\b/i,
      /\banalytics\s+(analyst|manager)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  data_science: {
    cluster_key: 'product_tech_data',
    path_key: 'data_science',
    label: 'Data Science',
    benchmark_path_ref: { cluster_node: 'technology', path_node: 'data_scientist' },
    aliases: ['Data Scientist', 'Data Science'],
    title_patterns: [
      /\bdata\s+scien(tist|ce)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  data_engineering: {
    cluster_key: 'product_tech_data',
    path_key: 'data_engineering',
    label: 'Data Engineering',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated data_engineering cell; technology.software_engineer is closest neighbour.',
    aliases: ['Data Engineer', 'Data Engineering'],
    title_patterns: [
      /\bdata\s+engineer\b/i,
    ],
    v1_overlay_status: 'live',
  },

  bi: {
    cluster_key: 'product_tech_data',
    path_key: 'bi',
    label: 'Business Intelligence',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated BI cell; technology.data_scientist is closest neighbour.',
    aliases: ['BI', 'Business Intelligence'],
    title_patterns: [
      /\b(bi|business\s+intelligence)\s+(analyst|developer)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  ml_engineering: {
    cluster_key: 'product_tech_data',
    path_key: 'ml_engineering',
    label: 'ML Engineering',
    benchmark_path_ref: { cluster_node: 'technology', path_node: 'machine_learning_engineer' },
    aliases: ['ML Engineer', 'Machine Learning Engineer', 'AI Engineer'],
    title_patterns: [
      /\b(ml|machine\s+learning|ai)\s+engineer\b/i,
    ],
    v1_overlay_status: 'live',
  },

  product_management: {
    cluster_key: 'product_tech_data',
    path_key: 'product_management',
    label: 'Product Management',
    benchmark_path_ref: { cluster_node: 'product_and_design', path_node: 'product_manager' },
    aliases: ['Product Manager', 'PM', 'Group Product Manager', 'Senior PM'],
    title_patterns: [
      /\bproduct\s+manager\b/i,
      /\b(group|senior|sr\.?|associate)\s+product\s+manager\b/i,
    ],
    v1_overlay_status: 'live',
  },

  product_ops: {
    cluster_key: 'product_tech_data',
    path_key: 'product_ops',
    label: 'Product Ops',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated product_ops cell; product_and_design.product_manager is closest neighbour.',
    aliases: ['Product Ops', 'Product Operations'],
    title_patterns: [
      /\bproduct\s+(ops|operations)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ SALES, MARKETING & GROWTH ══════════════════ */

  sales: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'sales',
    label: 'Sales',
    benchmark_path_ref: { cluster_node: 'sales', path_node: 'account_executive' },
    aliases: ['Sales Executive', 'Sales Manager', 'Account Executive', 'AE'],
    title_patterns: [
      /\b(account\s+executive|sales\s+(executive|manager|director|lead))\b/i,
      /\bAE\b/,
    ],
    v1_overlay_status: 'live',
  },

  business_development: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'business_development',
    label: 'Business Development',
    benchmark_path_ref: { cluster_node: 'sales', path_node: 'sdr_bdr' },
    aliases: ['BD', 'Business Development', 'BDR', 'SDR'],
    title_patterns: [
      /\bbusiness\s+development\b/i,
      /\b(sdr|bdr)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  account_management: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'account_management',
    label: 'Account Management',
    benchmark_path_ref: { cluster_node: 'sales', path_node: 'account_executive' },
    aliases: ['Account Manager', 'Key Account Manager'],
    title_patterns: [
      /\b(account\s+manager|key\s+account)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  performance_marketing: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'performance_marketing',
    label: 'Performance Marketing',
    benchmark_path_ref: { cluster_node: 'marketing', path_node: 'performance_marketing_manager' },
    aliases: ['Performance Marketing', 'Paid Ads', 'Paid Marketing'],
    title_patterns: [
      /\bperformance\s+marketing\b/i,
      /\bpaid\s+(ads|media|marketing)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  brand_marketing: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'brand_marketing',
    label: 'Brand Marketing',
    benchmark_path_ref: { cluster_node: 'marketing', path_node: 'brand_manager_fmcg' },
    aliases: ['Brand Manager', 'Brand Marketing'],
    title_patterns: [
      /\bbrand\s+(manager|marketing)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  crm_lifecycle: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'crm_lifecycle',
    label: 'CRM / Lifecycle',
    benchmark_path_ref: { cluster_node: 'marketing', path_node: 'digital_marketing_manager' },
    aliases: ['CRM', 'Lifecycle Marketing', 'Retention Marketing'],
    title_patterns: [
      /\b(crm|lifecycle\s+marketing|retention\s+marketing)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  partnerships: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'partnerships',
    label: 'Partnerships',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated partnerships cell; sales.account_executive is the closest neighbour.',
    aliases: ['Partnerships', 'Partner Manager'],
    title_patterns: [
      /\bpartnership(s)?\s+(manager|lead)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  revenue_ops: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'revenue_ops',
    label: 'Revenue Ops',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated revenue_ops cell; sales.account_executive is the closest neighbour.',
    aliases: ['Revenue Ops', 'RevOps'],
    title_patterns: [
      /\brevenue\s+ops\b/i,
      /\brev\s*ops\b/i,
    ],
    v1_overlay_status: 'light',
  },

  growth_category: {
    cluster_key: 'sales_marketing_growth',
    path_key: 'growth_category',
    label: 'Growth / Category',
    benchmark_path_ref: { cluster_node: 'marketing', path_node: 'digital_marketing_manager' },
    aliases: ['Growth Manager', 'Category Manager', 'Growth Lead'],
    title_patterns: [
      /\b(growth\s+(manager|lead)|category\s+manager)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  /* ══════════ OPERATIONS, SUPPLY CHAIN & PROCUREMENT ══════════ */

  business_operations: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'business_operations',
    label: 'Business Operations',
    benchmark_path_ref: { cluster_node: 'operations_scm', path_node: 'operations_manager' },
    aliases: ['Business Operations', 'Biz Ops'],
    title_patterns: [
      /\b(business\s+(operations?|ops)|biz\s+ops)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  operations: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'operations',
    label: 'Operations',
    benchmark_path_ref: { cluster_node: 'operations_scm', path_node: 'operations_manager' },
    aliases: ['Operations Manager', 'Operations Analyst', 'Operations Lead'],
    title_patterns: [
      /\boperations\s+(manager|analyst|lead)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  supply_chain: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'supply_chain',
    label: 'Supply Chain',
    benchmark_path_ref: { cluster_node: 'operations_scm', path_node: 'supply_chain_manager' },
    aliases: ['Supply Chain', 'SCM'],
    title_patterns: [
      /\bsupply\s+chain\b/i,
    ],
    v1_overlay_status: 'live',
  },

  procurement: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'procurement',
    label: 'Procurement',
    benchmark_path_ref: { cluster_node: 'operations_scm', path_node: 'procurement_logistics' },
    aliases: ['Procurement', 'Procurement Manager'],
    title_patterns: [
      /\bprocure(ment)?\b/i,
    ],
    v1_overlay_status: 'live',
  },

  sourcing: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'sourcing',
    label: 'Sourcing',
    benchmark_path_ref: { cluster_node: 'operations_scm', path_node: 'procurement_logistics' },
    aliases: ['Sourcing Manager', 'Strategic Sourcing'],
    title_patterns: [
      /\bsourcing\s+(manager|specialist|lead)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  logistics: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'logistics',
    label: 'Logistics',
    benchmark_path_ref: { cluster_node: 'operations_scm', path_node: 'procurement_logistics' },
    aliases: ['Logistics Manager', 'Logistics Coordinator'],
    title_patterns: [
      /\blogistics\s+(manager|coordinator|lead)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  manufacturing_ops: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'manufacturing_ops',
    label: 'Manufacturing Operations',
    benchmark_path_ref: { cluster_node: 'engineering_non_software', path_node: 'mechanical_engineer' },
    aliases: ['Manufacturing Operations', 'Manufacturing Engineer', 'Manufacturing Manager'],
    title_patterns: [
      /\bmanufacturing\s+(operations?|engineer|manager)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  process_excellence: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'process_excellence',
    label: 'Process Excellence',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated process_excellence cell; operations_scm.operations_manager is closest neighbour.',
    aliases: ['Process Excellence', 'Six Sigma', 'Lean Six Sigma'],
    title_patterns: [
      /\b(six\s*sigma|process\s+excellence|lean\s+(manufacturing|sigma))\b/i,
    ],
    v1_overlay_status: 'light',
  },

  shared_service_ops: {
    cluster_key: 'ops_scm_procurement',
    path_key: 'shared_service_ops',
    label: 'Shared Services Ops',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated shared_service_ops cell; operations_scm.operations_manager is closest neighbour.',
    aliases: ['Shared Services', 'GBS', 'Global Business Services'],
    title_patterns: [
      /\bshared\s+services?\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ HR, TALENT & L&D ══════════════════ */

  hrbp: {
    cluster_key: 'hr_talent_ld',
    path_key: 'hrbp',
    label: 'HRBP',
    benchmark_path_ref: { cluster_node: 'hr_human_resources', path_node: 'hr_generalist_hrbp' },
    aliases: ['HRBP', 'HR Business Partner', 'HR Generalist'],
    title_patterns: [
      /\bhrbp\b/i,
      /\bhr\s+(business\s+partner|generalist)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  talent_acquisition: {
    cluster_key: 'hr_talent_ld',
    path_key: 'talent_acquisition',
    label: 'Talent Acquisition',
    benchmark_path_ref: { cluster_node: 'hr_human_resources', path_node: 'talent_acquisition_specialist' },
    aliases: ['Talent Acquisition', 'TA', 'Recruiter'],
    title_patterns: [
      /\btalent\s+acquisition\b/i,
      /\b(senior\s+|sr\.?\s+)?recruiter\b/i,
    ],
    v1_overlay_status: 'live',
  },

  comp_and_benefits: {
    cluster_key: 'hr_talent_ld',
    path_key: 'comp_and_benefits',
    label: 'Compensation & Benefits',
    benchmark_path_ref: { cluster_node: 'hr_human_resources', path_node: 'compensation_benefits_l_and_d' },
    aliases: ['Compensation & Benefits', 'C&B', 'Comp and Benefits'],
    title_patterns: [
      /\bcompensation\s+(&|and)\s+benefits\b/i,
      /\bC\s*&\s*B\b/,
    ],
    v1_overlay_status: 'light',
  },

  learning_development: {
    cluster_key: 'hr_talent_ld',
    path_key: 'learning_development',
    label: 'L&D',
    benchmark_path_ref: { cluster_node: 'hr_human_resources', path_node: 'compensation_benefits_l_and_d' },
    aliases: ['L&D', 'Learning and Development', 'Learning & Development'],
    title_patterns: [
      /\blearning\s+(&|and)\s+development\b/i,
      /\bL\s*&\s*D\b/,
    ],
    v1_overlay_status: 'light',
  },

  people_analytics: {
    cluster_key: 'hr_talent_ld',
    path_key: 'people_analytics',
    label: 'People Analytics',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated people_analytics cell; hr_human_resources.hr_generalist_hrbp is closest neighbour.',
    aliases: ['People Analytics', 'HR Analytics'],
    title_patterns: [
      /\bpeople\s+analytics\b/i,
      /\bhr\s+analytics\b/i,
    ],
    v1_overlay_status: 'light',
  },

  hr_operations: {
    cluster_key: 'hr_talent_ld',
    path_key: 'hr_operations',
    label: 'HR Operations',
    benchmark_path_ref: { cluster_node: 'hr_human_resources', path_node: 'hr_generalist_hrbp' },
    aliases: ['HR Operations', 'HR Ops'],
    title_patterns: [
      /\bhr\s+(operations|ops)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ LEGAL, COMPLIANCE, RISK & POLICY ══════════════════ */

  legal_counsel: {
    cluster_key: 'legal_compliance_risk_policy',
    path_key: 'legal_counsel',
    label: 'Legal Counsel',
    benchmark_path_ref: { cluster_node: 'law_legal', path_node: 'in_house_counsel' },
    aliases: ['Legal Counsel', 'In-House Counsel', 'Corporate Counsel'],
    title_patterns: [
      /\b(legal|in[\s-]?house|corporate)\s+counsel\b/i,
    ],
    v1_overlay_status: 'live',
  },

  compliance: {
    cluster_key: 'legal_compliance_risk_policy',
    path_key: 'compliance',
    label: 'Compliance',
    benchmark_path_ref: { cluster_node: 'law_legal', path_node: 'in_house_counsel' },
    aliases: ['Compliance Manager', 'Compliance Officer'],
    title_patterns: [
      /\bcompliance\s+(manager|officer|lead|head)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  regulatory_affairs: {
    cluster_key: 'legal_compliance_risk_policy',
    path_key: 'regulatory_affairs',
    label: 'Regulatory Affairs',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated regulatory_affairs cell; law_legal.in_house_counsel is closest neighbour.',
    aliases: ['Regulatory Affairs', 'Reg Affairs'],
    title_patterns: [
      /\bregulatory\s+affairs\b/i,
    ],
    v1_overlay_status: 'light',
  },

  company_secretarial: {
    cluster_key: 'legal_compliance_risk_policy',
    path_key: 'company_secretarial',
    label: 'Company Secretarial',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated company_secretarial cell; law_legal.in_house_counsel is closest neighbour.',
    aliases: ['Company Secretary', 'CS', 'Company Secretarial'],
    title_patterns: [
      /\bcompany\s+secretar(y|ial)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  public_policy: {
    cluster_key: 'legal_compliance_risk_policy',
    path_key: 'public_policy',
    label: 'Public Policy',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated public_policy cell; closest neighbours sit across law_legal and academia_research.',
    aliases: ['Public Policy', 'Policy Manager', 'Public Affairs'],
    title_patterns: [
      /\bpublic\s+policy\b/i,
      /\bpolicy\s+(manager|lead|advisor)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  contract_management: {
    cluster_key: 'legal_compliance_risk_policy',
    path_key: 'contract_management',
    label: 'Contract Management',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated contract_management cell; law_legal.in_house_counsel is closest neighbour.',
    aliases: ['Contract Management', 'Contract Manager'],
    title_patterns: [
      /\bcontract\s+(manager|specialist|management)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  legal_ops: {
    cluster_key: 'legal_compliance_risk_policy',
    path_key: 'legal_ops',
    label: 'Legal Ops',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated legal_ops cell; law_legal.in_house_counsel is closest neighbour.',
    aliases: ['Legal Ops', 'Legal Operations'],
    title_patterns: [
      /\blegal\s+(ops|operations)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ RESEARCH, ANALYTICS & KNOWLEDGE ══════════════════ */

  equity_research: {
    cluster_key: 'research_analytics_knowledge',
    path_key: 'equity_research',
    label: 'Equity Research',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'equity_research' },
    aliases: ['Equity Research', 'ER Analyst', 'Sell-Side Research'],
    title_patterns: [
      /\bequity\s+research\b/i,
    ],
    v1_overlay_status: 'live',
  },

  investment_research: {
    cluster_key: 'research_analytics_knowledge',
    path_key: 'investment_research',
    label: 'Investment Research',
    benchmark_path_ref: { cluster_node: 'finance', path_node: 'equity_research' },
    aliases: ['Investment Research', 'Buy-Side Research'],
    title_patterns: [
      /\binvestment\s+research\b/i,
    ],
    v1_overlay_status: 'light',
  },

  market_research: {
    cluster_key: 'research_analytics_knowledge',
    path_key: 'market_research',
    label: 'Market Research',
    benchmark_path_ref: { cluster_node: 'academia_research', path_node: 'industry_research_director' },
    aliases: ['Market Research', 'Market Insights'],
    title_patterns: [
      /\bmarket\s+research\b/i,
      /\bmarket\s+insights?\b/i,
    ],
    v1_overlay_status: 'live',
  },

  business_research: {
    cluster_key: 'research_analytics_knowledge',
    path_key: 'business_research',
    label: 'Business Research',
    benchmark_path_ref: { cluster_node: 'academia_research', path_node: 'industry_research_director' },
    aliases: ['Business Research', 'Business Research Analyst'],
    title_patterns: [
      /\bbusiness\s+research\b/i,
    ],
    v1_overlay_status: 'light',
  },

  economic_research: {
    cluster_key: 'research_analytics_knowledge',
    path_key: 'economic_research',
    label: 'Economic Research',
    benchmark_path_ref: { cluster_node: 'academia_research', path_node: 'industry_research_director' },
    aliases: ['Economic Research', 'Economist'],
    title_patterns: [
      /\beconomic\s+research\b/i,
      /\beconomist\b/i,
    ],
    v1_overlay_status: 'light',
  },

  policy_research: {
    cluster_key: 'research_analytics_knowledge',
    path_key: 'policy_research',
    label: 'Policy Research',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated policy_research cell; academia_research.industry_research_director is closest neighbour.',
    aliases: ['Policy Research', 'Policy Analyst'],
    title_patterns: [
      /\bpolicy\s+research\b/i,
      /\bpolicy\s+analyst\b/i,
    ],
    v1_overlay_status: 'light',
  },

  knowledge_center_analyst: {
    cluster_key: 'research_analytics_knowledge',
    path_key: 'knowledge_center_analyst',
    label: 'Knowledge Center Analyst',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated knowledge_center cell; closest neighbour is academia_research.industry_research_director.',
    aliases: ['Knowledge Center', 'Research Analyst', 'KPO Analyst'],
    title_patterns: [
      /\bknowledge\s+center\b/i,
      /\bresearch\s+analyst\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ DESIGN, CREATIVE & MEDIA ══════════════════ */

  ux_design: {
    cluster_key: 'design_creative_media',
    path_key: 'ux_design',
    label: 'UX Design',
    benchmark_path_ref: { cluster_node: 'product_and_design', path_node: 'ux_ui_product_designer' },
    aliases: ['UX Designer', 'UX Design', 'User Experience Designer'],
    title_patterns: [
      /\bux\s+designer?\b/i,
      /\buser\s+experience\s+designer\b/i,
    ],
    v1_overlay_status: 'live',
  },

  ui_design: {
    cluster_key: 'design_creative_media',
    path_key: 'ui_design',
    label: 'UI Design',
    benchmark_path_ref: { cluster_node: 'product_and_design', path_node: 'ux_ui_product_designer' },
    aliases: ['UI Designer', 'UI Design'],
    title_patterns: [
      /\bui\s+designer?\b/i,
      /\bui\/ux\s+designer\b/i,
    ],
    v1_overlay_status: 'live',
  },

  product_design: {
    cluster_key: 'design_creative_media',
    path_key: 'product_design',
    label: 'Product Design',
    benchmark_path_ref: { cluster_node: 'product_and_design', path_node: 'ux_ui_product_designer' },
    aliases: ['Product Designer', 'Product Design'],
    title_patterns: [
      /\bproduct\s+designer\b/i,
    ],
    v1_overlay_status: 'live',
  },

  graphic_design: {
    cluster_key: 'design_creative_media',
    path_key: 'graphic_design',
    label: 'Graphic / Visual Design',
    benchmark_path_ref: { cluster_node: 'creative_media', path_node: 'creative_director_advertising_design' },
    aliases: ['Graphic Designer', 'Visual Designer'],
    title_patterns: [
      /\bgraphic\s+designer\b/i,
      /\bvisual\s+designer\b/i,
    ],
    v1_overlay_status: 'light',
  },

  brand_design: {
    cluster_key: 'design_creative_media',
    path_key: 'brand_design',
    label: 'Brand Design',
    benchmark_path_ref: { cluster_node: 'creative_media', path_node: 'creative_director_advertising_design' },
    aliases: ['Brand Designer', 'Brand Design'],
    title_patterns: [
      /\bbrand\s+designer\b/i,
    ],
    v1_overlay_status: 'light',
  },

  content_strategy: {
    cluster_key: 'design_creative_media',
    path_key: 'content_strategy',
    label: 'Content Strategy',
    benchmark_path_ref: { cluster_node: 'marketing', path_node: 'seo_content_social' },
    aliases: ['Content Strategist', 'Content Strategy'],
    title_patterns: [
      /\bcontent\s+strategist\b/i,
      /\bcontent\s+strategy\b/i,
    ],
    v1_overlay_status: 'light',
  },

  copy_editorial: {
    cluster_key: 'design_creative_media',
    path_key: 'copy_editorial',
    label: 'Copy / Editorial',
    benchmark_path_ref: { cluster_node: 'creative_media', path_node: 'journalism' },
    aliases: ['Copywriter', 'Editor', 'Editorial'],
    title_patterns: [
      /\bcopywriter\b/i,
      /\beditor(ial)?\b/i,
    ],
    v1_overlay_status: 'light',
  },

  media_communications: {
    cluster_key: 'design_creative_media',
    path_key: 'media_communications',
    label: 'Media / Communications',
    benchmark_path_ref: { cluster_node: 'creative_media', path_node: 'journalism' },
    aliases: ['Communications Manager', 'Corporate Communications', 'PR'],
    title_patterns: [
      /\b(communications?\s+manager|corporate\s+communications)\b/i,
      /\bpublic\s+relations\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ GOVERNMENT, PSU & PUBLIC SECTOR ══════════════════ */

  psu_officer: {
    cluster_key: 'govt_psu_public_sector',
    path_key: 'psu_officer',
    label: 'PSU Officer Pathways',
    benchmark_path_ref: { cluster_node: 'government_psu', path_node: 'psu_executive_maharatna' },
    aliases: ['PSU Officer', 'Executive Trainee'],
    title_patterns: [
      /\b(psu|public\s+sector\s+undertaking)\b/i,
      /\bexecutive\s+trainee\b/i,
    ],
    v1_overlay_status: 'light',
  },

  public_sector_management: {
    cluster_key: 'govt_psu_public_sector',
    path_key: 'public_sector_management',
    label: 'Public-Sector Management',
    benchmark_path_ref: { cluster_node: 'government_psu', path_node: 'ias_ips_civil_services' },
    aliases: ['Public Sector Management', 'Government Management'],
    title_patterns: [
      /\bpublic\s+sector\s+management\b/i,
      /\bgovernment\s+(of\s+india|management)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  public_administration: {
    cluster_key: 'govt_psu_public_sector',
    path_key: 'public_administration',
    label: 'Public Administration',
    benchmark_path_ref: { cluster_node: 'government_psu', path_node: 'ias_ips_civil_services' },
    aliases: ['Public Administration'],
    title_patterns: [
      /\bpublic\s+administration\b/i,
    ],
    v1_overlay_status: 'light',
  },

  public_finance_role: {
    cluster_key: 'govt_psu_public_sector',
    path_key: 'public_finance_role',
    label: 'Public Finance Roles',
    benchmark_path_ref: { cluster_node: 'government_psu', path_node: 'rbi_grade_b_officer' },
    aliases: ['Public Finance', 'Government Finance'],
    title_patterns: [
      /\bpublic\s+finance\b/i,
    ],
    v1_overlay_status: 'light',
  },

  public_policy_execution: {
    cluster_key: 'govt_psu_public_sector',
    path_key: 'public_policy_execution',
    label: 'Public Policy Execution',
    benchmark_path_ref: { cluster_node: 'government_psu', path_node: 'ias_ips_civil_services' },
    aliases: ['Public Policy Execution'],
    title_patterns: [
      /\bpublic\s+policy\s+(execution|implementation)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════════ ACADEMIA, EDUCATION & TRAINING ══════════════════ */

  faculty_teaching: {
    cluster_key: 'academia_education_training',
    path_key: 'faculty_teaching',
    label: 'Teaching / Faculty',
    benchmark_path_ref: { cluster_node: 'academia_research', path_node: 'university_faculty_ugc_7th_cpc' },
    aliases: ['Faculty', 'Assistant Professor', 'Lecturer', 'Teacher'],
    title_patterns: [
      /\b(assistant|associate)\s+professor\b/i,
      /\bfaculty\b/i,
      /\blecturer\b/i,
    ],
    v1_overlay_status: 'light',
  },

  academic_administration: {
    cluster_key: 'academia_education_training',
    path_key: 'academic_administration',
    label: 'Academic Administration',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated academic_administration cell; academia_research.university_faculty_ugc_7th_cpc is closest neighbour.',
    aliases: ['Academic Administrator', 'Academic Coordinator'],
    title_patterns: [
      /\bacademic\s+(administrator|coordinator|administration)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  curriculum_program: {
    cluster_key: 'academia_education_training',
    path_key: 'curriculum_program',
    label: 'Curriculum / Program',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated curriculum_program cell; closest neighbour is academia_research.university_faculty_ugc_7th_cpc.',
    aliases: ['Curriculum Designer', 'Curriculum Specialist', 'Program Designer'],
    title_patterns: [
      /\bcurriculum\s+(designer|specialist|developer)\b/i,
    ],
    v1_overlay_status: 'light',
  },

  edtech_program_roles: {
    cluster_key: 'academia_education_training',
    path_key: 'edtech_program_roles',
    label: 'Edtech Program Roles',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated edtech cell; closest neighbour spans academia_research and product_tech_data.',
    aliases: ['Edtech Program', 'Learning Designer'],
    title_patterns: [
      /\bedtech\b/i,
      /\blearning\s+designer\b/i,
    ],
    v1_overlay_status: 'light',
  },

  coaching_learning: {
    cluster_key: 'academia_education_training',
    path_key: 'coaching_learning',
    label: 'Coaching / Learning',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated coaching_learning cell; closest neighbour is academia_research.university_faculty_ugc_7th_cpc.',
    aliases: ['Teacher Trainer', 'Coach', 'Trainer'],
    title_patterns: [
      /\bteacher\s+trainer\b/i,
      /\b(corporate\s+)?trainer\b/i,
    ],
    v1_overlay_status: 'light',
  },

  /* ════════════ HEALTHCARE, PHARMA & CLINICAL-BUSINESS ════════════ */

  pharma_commercial: {
    cluster_key: 'healthcare_pharma_clinical_business',
    path_key: 'pharma_commercial',
    label: 'Pharma Commercial',
    benchmark_path_ref: { cluster_node: 'healthcare', path_node: 'pharma_industry' },
    aliases: ['Pharma Commercial', 'Pharma Sales', 'Pharma Marketing', 'Pharma Brand'],
    title_patterns: [
      /\bpharma\s+(commercial|sales|brand|marketing)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  hospital_administration: {
    cluster_key: 'healthcare_pharma_clinical_business',
    path_key: 'hospital_administration',
    label: 'Hospital Administration',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated hospital_administration cell; healthcare.pharma_industry and healthcare.nursing_paramedical are closest neighbours.',
    aliases: ['Hospital Administrator', 'Hospital Administration'],
    title_patterns: [
      /\bhospital\s+administrat(or|ion)\b/i,
    ],
    v1_overlay_status: 'live',
  },

  healthcare_operations: {
    cluster_key: 'healthcare_pharma_clinical_business',
    path_key: 'healthcare_operations',
    label: 'Healthcare Operations',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated healthcare_operations cell; closest neighbours sit across healthcare and operations_scm.',
    aliases: ['Healthcare Operations'],
    title_patterns: [
      /\bhealthcare\s+operations\b/i,
    ],
    v1_overlay_status: 'light',
  },

  diagnostics_business: {
    cluster_key: 'healthcare_pharma_clinical_business',
    path_key: 'diagnostics_business',
    label: 'Diagnostics / Life-Sciences Business',
    benchmark_path_ref: { cluster_node: 'healthcare', path_node: 'pharma_industry' },
    aliases: ['Diagnostics', 'Life Sciences Business'],
    title_patterns: [
      /\bdiagnostics?\s+(business|commercial)\b/i,
      /\blife\s+sciences?\s+business\b/i,
    ],
    v1_overlay_status: 'light',
  },

  medical_affairs: {
    cluster_key: 'healthcare_pharma_clinical_business',
    path_key: 'medical_affairs',
    label: 'Medical Affairs',
    benchmark_path_ref: { cluster_node: 'healthcare', path_node: 'pharma_industry' },
    aliases: ['Medical Affairs', 'MSL', 'Medical Science Liaison'],
    title_patterns: [
      /\bmedical\s+affairs\b/i,
      /\bmedical\s+science\s+liaison\b/i,
    ],
    v1_overlay_status: 'light',
  },

  healthcare_analytics: {
    cluster_key: 'healthcare_pharma_clinical_business',
    path_key: 'healthcare_analytics',
    label: 'Healthcare Analytics',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated healthcare_analytics cell; closest neighbours sit across healthcare and technology.data_scientist.',
    aliases: ['Healthcare Analytics', 'Clinical Analytics'],
    title_patterns: [
      /\bhealthcare\s+analytics\b/i,
      /\bclinical\s+analytics\b/i,
    ],
    v1_overlay_status: 'light',
  },

  hospital_finance: {
    cluster_key: 'healthcare_pharma_clinical_business',
    path_key: 'hospital_finance',
    label: 'Hospital Finance',
    benchmark_path_ref: null,
    _ref_null_reason: 'No dedicated hospital_finance cell; closest neighbours sit across healthcare and finance.fp_and_a_corporate_finance.',
    aliases: ['Hospital Finance'],
    title_patterns: [
      /\bhospital\s+finance\b/i,
    ],
    v1_overlay_status: 'light',
  },

};

export const PATH_KEYS = Object.keys(PATHS);

export function getPath(pathKey) {
  return PATHS[pathKey] || null;
}

export function assertCanonicalPathKey(pathKey) {
  if (!PATHS[pathKey]) {
    throw new Error(`[paths] Non-canonical path_key: ${pathKey}`);
  }
  return pathKey;
}

export function pathsForCluster(clusterKey) {
  return Object.values(PATHS).filter(p => p.cluster_key === clusterKey);
}

/* Benchmark-comparability gate. Returns true when the path has a non-null
   benchmark_path_ref — meaning consumer surfaces (Terminal / Dashboard /
   Path Comparison / City Move) may make benchmark-comparative claims for
   this path. Returns false for the 31 null-ref paths shipped in V1 — the
   overlay still classifies into them, but consumers must not say
   "benchmark says X, overlay says Y" for those paths. */
export function isBenchmarkComparable(pathKey) {
  const p = PATHS[pathKey];
  if (!p) return false;
  return p.benchmark_path_ref !== null && p.benchmark_path_ref !== undefined;
}

/* Returns the benchmark cluster_node / path_node strings for a path, or
   null if the path is overlay-only. Use this to construct keys for
   benchmarks.js reads when composing comparative memos. */
export function getBenchmarkRef(pathKey) {
  const p = PATHS[pathKey];
  if (!p || !p.benchmark_path_ref) return null;
  return p.benchmark_path_ref;
}

/* Canonical 28-city vocabulary — mirrors benchmarks_master.json
   city_cost_of_living.cities keys. Overlay city resolver maps raw
   strings (synonyms, alt spellings) into these keys. */

export const CITIES = {
  mumbai:       { key: 'mumbai',       label: 'Mumbai',                 aliases: ['Mumbai', 'Bombay', 'BOM'] },
  gurgaon:      { key: 'gurgaon',      label: 'Gurgaon',                aliases: ['Gurgaon', 'Gurugram', 'GGN'] },
  delhi:        { key: 'delhi',        label: 'Delhi',                  aliases: ['Delhi', 'New Delhi', 'NCR', 'DEL'] },
  bangalore:    { key: 'bangalore',    label: 'Bangalore',              aliases: ['Bangalore', 'Bengaluru', 'BLR'] },
  pune:         { key: 'pune',         label: 'Pune',                   aliases: ['Pune', 'PNQ'] },
  hyderabad:    { key: 'hyderabad',    label: 'Hyderabad',              aliases: ['Hyderabad', 'HYD'] },
  chennai:      { key: 'chennai',      label: 'Chennai',                aliases: ['Chennai', 'Madras', 'MAA'] },
  kolkata:      { key: 'kolkata',      label: 'Kolkata',                aliases: ['Kolkata', 'Calcutta', 'CCU'] },
  ahmedabad:    { key: 'ahmedabad',    label: 'Ahmedabad',              aliases: ['Ahmedabad', 'AMD'] },
  noida:        { key: 'noida',        label: 'Noida',                  aliases: ['Noida', 'NCR-Noida'] },
  thane:        { key: 'thane',        label: 'Thane',                  aliases: ['Thane'] },
  navi_mumbai:  { key: 'navi_mumbai',  label: 'Navi Mumbai',            aliases: ['Navi Mumbai', 'New Bombay'] },
  chandigarh:   { key: 'chandigarh',   label: 'Chandigarh',             aliases: ['Chandigarh'] },
  kochi:        { key: 'kochi',        label: 'Kochi',                  aliases: ['Kochi', 'Cochin'] },
  indore:       { key: 'indore',       label: 'Indore',                 aliases: ['Indore'] },
  bhubaneswar:  { key: 'bhubaneswar',  label: 'Bhubaneswar',            aliases: ['Bhubaneswar', 'Bhubaneshwar'] },
  jaipur:       { key: 'jaipur',       label: 'Jaipur',                 aliases: ['Jaipur'] },
  lucknow:      { key: 'lucknow',      label: 'Lucknow',                aliases: ['Lucknow'] },
  bhopal:       { key: 'bhopal',       label: 'Bhopal',                 aliases: ['Bhopal'] },
  patna:        { key: 'patna',        label: 'Patna',                  aliases: ['Patna'] },
  dehradun:     { key: 'dehradun',     label: 'Dehradun',               aliases: ['Dehradun'] },
  coimbatore:   { key: 'coimbatore',   label: 'Coimbatore',             aliases: ['Coimbatore'] },
  surat:        { key: 'surat',        label: 'Surat',                  aliases: ['Surat'] },
  vadodara:     { key: 'vadodara',     label: 'Vadodara',               aliases: ['Vadodara', 'Baroda'] },
  rajkot:       { key: 'rajkot',       label: 'Rajkot',                 aliases: ['Rajkot'] },
  guwahati:     { key: 'guwahati',     label: 'Guwahati',               aliases: ['Guwahati'] },
  thiruvananthapuram: { key: 'thiruvananthapuram', label: 'Thiruvananthapuram', aliases: ['Thiruvananthapuram', 'Trivandrum'] },
  mughalsarai_varanasi_proxy: { key: 'mughalsarai_varanasi_proxy', label: 'Mughalsarai / Varanasi', aliases: ['Mughalsarai', 'Varanasi'] },
};

export const CITY_KEYS = Object.keys(CITIES);

export function assertCanonicalCityKey(cityKey) {
  if (!CITIES[cityKey]) {
    throw new Error(`[paths] Non-canonical city_key: ${cityKey}`);
  }
  return cityKey;
}
