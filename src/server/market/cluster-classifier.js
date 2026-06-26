/* ──────────────────────────────────────────────────────────────────────
   CLUSTER CLASSIFIER (Phase 1 skeleton)

   Resolves a raw posting to a Verastra cluster_key.

   Phase 1: ships the priority-ordered pattern table; the classify()
   function returns the highest-scoring match. The detailed scoring +
   tie-break against employer-allowlist bias is finalized in Phase 2.
   ────────────────────────────────────────────────────────────────────── */

const PATTERNS = [
  // Finance, Accounting & Tax
  { rx: /\b(transfer\s+pricing|direct\s+tax|gst|indirect\s+tax|fp\s*&?\s*a|fpna|controller(ship)?|treasur(y|er)|investor\s+relations?|internal\s+audit|corporate\s+finance|business\s+finance|finance\s+transformation)\b/i,
    cluster_key: 'fin_acct_tax', score: 0.95 },
  // Consulting, Strategy & Deals
  { rx: /\b(management\s+consult|strategy\s+consult|corporate\s+strategy|business\s+transformation|transaction\s+(advisor|services)|deals?\s+advisor|founder'?s\s+office|chief\s+of\s+staff|strategic\s+pmo)\b/i,
    cluster_key: 'consulting_strategy_deals', score: 0.95 },
  // Product, Technology & Data
  { rx: /\b(software|backend|frontend|full[\s-]?stack)\s+(engineer|developer)|sde\b|\bdata\s+(analyst|scientist|engineer)|\bml\s+engineer|\bproduct\s+manager|\bproduct\s+ops\b|\bbi\s+(analyst|developer)/i,
    cluster_key: 'product_tech_data', score: 0.95 },
  // Sales, Marketing & Growth
  { rx: /\b(account\s+executive|sales\s+(executive|manager|director)|business\s+development|account\s+manager|key\s+account|performance\s+marketing|brand\s+manager|crm|lifecycle\s+marketing|growth\s+(manager|lead)|partnerships?\s+(manager|lead)|revenue\s+ops|rev\s*ops)\b/i,
    cluster_key: 'sales_marketing_growth', score: 0.90 },
  // Operations, Supply Chain & Procurement
  { rx: /\b(supply\s+chain|procure(ment)?|sourcing\s+(manager|specialist)|logistics\s+(manager|coordinator)|manufacturing\s+(operations?|engineer|manager)|six\s*sigma|process\s+excellence|business\s+ops|shared\s+services?)\b/i,
    cluster_key: 'ops_scm_procurement', score: 0.90 },
  // HR, Talent & L&D
  { rx: /\b(hrbp|talent\s+acquisition|compensation\s+(&|and)\s+benefits|people\s+analytics|employer\s+branding|learning\s+(&|and)\s+development|l\s*&\s*d)\b/i,
    cluster_key: 'hr_talent_ld', score: 0.90 },
  // Legal, Compliance, Risk & Policy
  { rx: /\b(legal\s+counsel|company\s+secretary|compliance\s+(manager|officer)|regulatory\s+affairs|public\s+policy|contract\s+(manager|specialist)|legal\s+ops)\b/i,
    cluster_key: 'legal_compliance_risk_policy', score: 0.90 },
  // Research, Analytics & Knowledge
  { rx: /\b(equity\s+research|investment\s+research|market\s+research|business\s+research|knowledge\s+center|research\s+analyst|economic\s+research|policy\s+research)\b/i,
    cluster_key: 'research_analytics_knowledge', score: 0.85 },
  // Design, Creative & Media
  { rx: /\b(ui\/ux|ux\s+designer|ui\s+designer|product\s+designer|graphic\s+designer|brand\s+designer|content\s+strategist|copywriter|creative\s+(director|producer))\b/i,
    cluster_key: 'design_creative_media', score: 0.85 },
  // Government, PSU & Public Sector
  { rx: /\b(psu|public\s+sector|government\s+of\s+india|state\s+(government|public)|public\s+administration)\b/i,
    cluster_key: 'govt_psu_public_sector', score: 0.95 },
  // Academia, Education & Training
  { rx: /\b(assistant\s+professor|faculty|academic\s+(administrator|coordinator)|curriculum\s+(designer|specialist)|edtech|teacher\s+trainer)\b/i,
    cluster_key: 'academia_education_training', score: 0.85 },
  // Healthcare, Pharma & Clinical-Business
  { rx: /\b(hospital\s+administrator|pharma\s+(commercial|sales|brand)|medical\s+affairs|clinical\s+(operations|trial)|healthcare\s+(operations|analytics)|diagnostics?\s+(business|commercial))\b/i,
    cluster_key: 'healthcare_pharma_clinical_business', score: 0.90 },
];

/**
 * @param {string} title
 * @param {string} description
 * @returns {{cluster_key:string|null, score:number, source:'pattern'}}
 */
export function classifyCluster(title = '', description = '') {
  const text = `${title} ${description}`;
  let best = { cluster_key: null, score: 0, source: 'pattern' };
  for (const p of PATTERNS) {
    if (p.rx.test(text)) {
      if (p.score > best.score) {
        best = { cluster_key: p.cluster_key, score: p.score, source: 'pattern' };
      }
    }
  }
  return best;
}
