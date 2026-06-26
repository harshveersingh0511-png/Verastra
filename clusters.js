/* ──────────────────────────────────────────────────────────────────────
   CLUSTERS — Verastra 12-cluster registry (Market Overlay V1)

   Canonical source of truth for the cluster taxonomy used by the
   market-overlay layer. Frontend and backend both consume this file.

   This registry is the organizing layer for:
     - source applicability + influence weighting
     - normalization (cluster classifier)
     - overlay aggregation grouping
     - confidence scoring per cluster
     - consumer-surface output (Terminal / Dashboard / tools)

   Layer A (benchmark core) is unchanged by this file. Each cluster
   declares the benchmark cluster node(s) it joins back to via the
   benchmarks_master.json top-level keys listed in `benchmark_keys`.

   V1 depth tiers:
     S — broad + operational specialist sources
     A — broad + light specialist depth
     B — broad + defined-but-light specialist pack

   See README-MARKET-OVERLAY.md for the architecture.
   ────────────────────────────────────────────────────────────────────── */

export const CLUSTERS = {

  fin_acct_tax: {
    cluster_key: 'fin_acct_tax',
    label: 'Finance, Accounting & Tax',
    description: 'Finance function, tax & regulatory, controllership, treasury, finance transformation.',
    example_paths: [
      'FP&A', 'Business Finance', 'Corporate Finance', 'Treasury',
      'Controllership', 'Internal Audit', 'Direct Tax', 'Transfer Pricing',
      'GST / Indirect Tax', 'Investor Relations', 'Finance Transformation',
    ],
    benchmark_keys: ['finance'],
    v1_depth_tier: 'S',
  },

  consulting_strategy_deals: {
    cluster_key: 'consulting_strategy_deals',
    label: 'Consulting, Strategy & Deals',
    description: 'Management consulting, corporate strategy, transactions, founder\u2019s office, PMO.',
    example_paths: [
      'Management Consulting', 'Corporate Strategy', 'Business Transformation',
      'Deals / Transaction Advisory', 'M&A Advisory', 'Founder\u2019s Office',
      'Chief of Staff', 'Strategic PMO',
    ],
    benchmark_keys: ['consulting'],
    v1_depth_tier: 'S',
  },

  product_tech_data: {
    cluster_key: 'product_tech_data',
    label: 'Product, Technology & Data',
    description: 'Software, data, product, AI/automation, startup operating roles.',
    example_paths: [
      'Software Engineering', 'Data Analytics', 'Data Science', 'Data Engineering',
      'Business Intelligence', 'Product Management', 'Product Ops', 'ML Engineering',
    ],
    benchmark_keys: ['technology', 'product_and_design'],
    v1_depth_tier: 'S',
  },

  sales_marketing_growth: {
    cluster_key: 'sales_marketing_growth',
    label: 'Sales, Marketing & Growth',
    description: 'Revenue-generating commercial roles across sales, marketing, growth, partnerships.',
    example_paths: [
      'Sales', 'Business Development', 'Account Management',
      'Performance Marketing', 'Brand Marketing', 'CRM / Lifecycle',
      'Partnerships', 'Revenue Ops', 'Growth / Category',
    ],
    benchmark_keys: ['sales', 'marketing'],
    v1_depth_tier: 'A',
  },

  ops_scm_procurement: {
    cluster_key: 'ops_scm_procurement',
    label: 'Operations, Supply Chain & Procurement',
    description: 'Operations, supply chain, procurement, manufacturing ops, process excellence.',
    example_paths: [
      'Business Operations', 'Operations', 'Supply Chain', 'Procurement',
      'Sourcing', 'Logistics', 'Manufacturing Operations',
      'Process Excellence', 'Shared Services Ops',
    ],
    benchmark_keys: ['operations_scm', 'engineering_non_software'],
    v1_depth_tier: 'A',
  },

  hr_talent_ld: {
    cluster_key: 'hr_talent_ld',
    label: 'Human Resources, Talent & L&D',
    description: 'HRBP, talent acquisition, compensation, L&D, people analytics, HR operations.',
    example_paths: [
      'HRBP', 'Talent Acquisition', 'Compensation & Benefits',
      'L&D', 'People Analytics', 'HR Operations',
    ],
    benchmark_keys: ['hr_human_resources'],
    v1_depth_tier: 'A',
  },

  legal_compliance_risk_policy: {
    cluster_key: 'legal_compliance_risk_policy',
    label: 'Legal, Compliance, Risk & Policy',
    description: 'Legal counsel, compliance, regulatory, company secretarial, public policy, legal ops.',
    example_paths: [
      'Legal Counsel', 'Compliance', 'Regulatory Affairs',
      'Company Secretarial', 'Public Policy', 'Contract Management', 'Legal Ops',
    ],
    benchmark_keys: ['law_legal'],
    v1_depth_tier: 'A',
  },

  research_analytics_knowledge: {
    cluster_key: 'research_analytics_knowledge',
    label: 'Research, Analytics & Knowledge',
    description: 'Equity & investment research, market & business research, KPO/knowledge-center analytics.',
    example_paths: [
      'Equity Research', 'Investment Research', 'Market Research',
      'Business Research', 'Economic Research', 'Policy Research',
      'Knowledge Center Analyst',
    ],
    benchmark_keys: ['academia_research', 'finance'],
    v1_depth_tier: 'A',
  },

  design_creative_media: {
    cluster_key: 'design_creative_media',
    label: 'Design, Creative & Media',
    description: 'Product/UX/visual design, brand, content, media, creative production.',
    example_paths: [
      'UX Design', 'UI Design', 'Product Design',
      'Graphic / Visual Design', 'Brand Design', 'Content Strategy',
      'Copy / Editorial', 'Media / Communications',
    ],
    benchmark_keys: ['creative_media', 'product_and_design'],
    v1_depth_tier: 'B',
  },

  govt_psu_public_sector: {
    cluster_key: 'govt_psu_public_sector',
    label: 'Government, PSU & Public Sector',
    description: 'PSU roles, public-sector management & analyst pathways, public finance / policy execution.',
    example_paths: [
      'PSU Officer Pathways', 'Public-Sector Management',
      'Public Administration', 'Public Finance Roles', 'Public Policy Execution',
    ],
    benchmark_keys: ['government_psu'],
    v1_depth_tier: 'B',
  },

  academia_education_training: {
    cluster_key: 'academia_education_training',
    label: 'Academia, Education & Training',
    description: 'Teaching/training roles, academic administration, edtech program & curriculum roles.',
    example_paths: [
      'Teaching / Faculty', 'Academic Administration',
      'Curriculum / Program', 'Edtech Program Roles', 'Coaching / Learning',
    ],
    benchmark_keys: ['academia_research'],
    v1_depth_tier: 'B',
  },

  healthcare_pharma_clinical_business: {
    cluster_key: 'healthcare_pharma_clinical_business',
    label: 'Healthcare, Pharma & Clinical-Business',
    description: 'Pharma commercial, hospital admin, diagnostics, healthcare operations & analytics.',
    example_paths: [
      'Pharma Commercial', 'Hospital Administration', 'Healthcare Operations',
      'Diagnostics / Life-Sciences Business', 'Medical Affairs',
      'Healthcare Analytics', 'Hospital Finance',
    ],
    benchmark_keys: ['healthcare'],
    v1_depth_tier: 'A',
  },

};

export const CLUSTER_KEYS = Object.keys(CLUSTERS);

export function getCluster(clusterKey) {
  return CLUSTERS[clusterKey] || null;
}

export function assertCanonicalClusterKey(clusterKey) {
  if (!CLUSTERS[clusterKey]) {
    throw new Error(`[clusters] Non-canonical cluster_key: ${clusterKey}`);
  }
  return clusterKey;
}
