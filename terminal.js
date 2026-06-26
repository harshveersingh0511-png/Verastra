/* ──────────────────────────────────────────────────────────────────────
   TERMINAL view  ·  Phase 6

   Natural-language query → structured decision memo.
   Explicitly not a chatbot. One query, one structured memo.
   ────────────────────────────────────────────────────────────────────── */

import { Store } from '../store.js';
import { extractEntities } from '../terminal/entities.js';
import { classify, QUERY_CLASSES } from '../terminal/classifier.js';
import { runRecipe } from '../terminal/recipes.js';
import { composeOverlayForRecipe } from '../terminal/overlay-composer.js';

const SAMPLE_PROMPTS = [
  'what is my career worth',
  'should I move from Mumbai to Bangalore for ₹22L',
  'I got an offer of ₹35L at a Big 4 firm — is it good',
  'where do I sit vs my TP cohort',
  'should I do CFA',
  'how risky is my path',
];

export function render(root) {
  const profile = Store.profile;

  root.innerHTML = `
    <div class="terminal-page">
      <header class="terminal-page__header">
        <div class="terminal-page__crumb">VERASTRA · TERMINAL</div>
        <h1 class="terminal-page__title">Decision routing surface</h1>
        <p class="terminal-page__lede">
          Type a natural-language decision query. The classifier routes across the framework engines
          and returns a structured memo with evidence, what-this-means, and a next-action.
          Rules-based, no chatbot fallback. One query, one memo.
        </p>
      </header>

      <div class="terminal-command">
        <div class="terminal-command__prompt">→</div>
        <input
          id="terminal-input"
          class="terminal-command__input"
          type="text"
          placeholder='type a query. e.g. "should I move from Mumbai to Bangalore for ₹22L"'
          autocomplete="off"
          spellcheck="false"
        />
        <button id="terminal-run" class="terminal-command__run">ROUTE ↵</button>
      </div>

      <div class="terminal-samples">
        <div class="terminal-samples__label">Try one of:</div>
        <div class="terminal-samples__list">
          ${SAMPLE_PROMPTS.map(p => `<button class="terminal-samples__item" data-prompt="${escapeAttr(p)}">${escapeHtml(p)}</button>`).join('')}
        </div>
      </div>

      <div id="terminal-memo" class="terminal-memo" data-empty="true">
        <div class="terminal-memo__empty">No query routed yet. Type above and press <strong>↵</strong>.</div>
      </div>

      <div class="terminal-meta">
        <div class="terminal-meta__title">12 query classes routed</div>
        <ul class="terminal-meta__list">
          ${QUERY_CLASSES.map(c => `<li><code>${c}</code></li>`).join('')}
        </ul>
        <div class="terminal-meta__note">
          Phase 6 ships fully-composed memos for <strong>CAPITAL_VALUATION</strong>,
          <strong>CITY_MOVE</strong>, <strong>OFFER_EVALUATION</strong>, and <strong>COHORT_POSITION</strong>.
          The remaining eight classes route correctly today, pre-fill the right engine,
          and surface detected entities — full memo composition follows in subsequent passes.
        </div>
      </div>
    </div>
  `;

  const input = root.querySelector('#terminal-input');
  const runBtn = root.querySelector('#terminal-run');
  const memo = root.querySelector('#terminal-memo');

  async function runQuery(q) {
    if (!q || !q.trim()) return;
    let ent, cls, recipe;
    try {
      ent = extractEntities(q);
      cls = classify(q, ent);
      recipe = runRecipe(cls.class, q, ent, profile);
    } catch (err) {
      console.error('Terminal recipe error', err);
      renderErrorMemo(memo, q, err);
      return;
    }
    /* Phase 3 overlay: await one string from the shared overlay service.
       Returns null whenever overlay is silent (stale, THIN, missing,
       version-mismatched, or recipe declared benchmark-only). All
       decision logic lives in market-overlay.js + overlay-composer.js;
       terminal.js only awaits and forwards. */
    let overlayParagraph = null;
    try {
      overlayParagraph = await composeOverlayForRecipe(recipe._overlayContext);
    } catch (err) {
      console.warn('Terminal overlay compose failed:', err);
    }
    renderMemo(memo, q, cls, ent, recipe, overlayParagraph);
  }

  runBtn.addEventListener('click', () => runQuery(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runQuery(input.value);
  });
  root.querySelectorAll('.terminal-samples__item').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.prompt;
      runQuery(btn.dataset.prompt);
    });
  });
}

function renderMemo(root, query, cls, ent, recipe, overlayParagraph) {
  const confidencePct = (cls.confidence * 100).toFixed(0);
  const confidenceTone = cls.confidence >= 0.6 ? 'high' : cls.confidence >= 0.4 ? 'moderate' : 'low';
  const altsHtml = cls.alternates.length > 0
    ? `<div class="memo-meta__alts">
         <span class="memo-meta__alts-label">Alternates:</span>
         ${cls.alternates.map(a => `<code class="memo-meta__alt">${a.class}</code>`).join('')}
       </div>`
    : '';
  const entHtml = renderEntityChips(ent);
  const valueLine = recipe.value != null
    ? `<div class="memo-headline__value">
         <span class="memo-headline__num">${formatValue(recipe.value, recipe.valueUnit)}</span>
         <span class="memo-headline__unit">${recipe.valueUnit}</span>
       </div>`
    : '';
  /* Phase 3 overlay section — rendered only when the shared composer
     returned a non-null paragraph. Text is escaped for defense in
     depth; composer output is plain prose by contract. */
  const overlayHtml = overlayParagraph
    ? `<section class="memo-section memo-section--overlay">
         <div class="memo-section__label">Live market overlay</div>
         <p class="memo-section__body">${escapeHtml(overlayParagraph)}</p>
       </section>`
    : '';

  root.removeAttribute('data-empty');
  root.innerHTML = `
    <article class="memo">
      <header class="memo__header">
        <div class="memo__crumb">DECISION MEMO</div>
        <div class="memo__query">Q: <span class="memo__query-text">${escapeHtml(query)}</span></div>
        <div class="memo-meta" data-tone="${confidenceTone}">
          <span class="memo-meta__chip">ROUTED · <code>${cls.class}</code></span>
          <span class="memo-meta__chip">confidence <strong>${confidencePct}%</strong></span>
          ${cls.fallback ? `<span class="memo-meta__chip memo-meta__chip--warn">FALLBACK</span>` : ''}
          ${altsHtml}
        </div>
        ${entHtml}
      </header>

      <section class="memo-section memo-section--headline">
        <div class="memo-section__label">Headline</div>
        ${valueLine}
        <div class="memo-headline__text">${escapeHtml(recipe.headline)}</div>
      </section>

      <section class="memo-section">
        <div class="memo-section__label">Evidence</div>
        <table class="memo-evidence">
          <tbody>
            ${recipe.evidence.map(e => `
              <tr>
                <td class="memo-evidence__label">${escapeHtml(e.label)}</td>
                <td class="memo-evidence__value">${escapeHtml(e.value)}</td>
                <td class="memo-evidence__source">${escapeHtml(e.source)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>

      <section class="memo-section">
        <div class="memo-section__label">What this means</div>
        <p class="memo-section__body">${escapeHtml(recipe.what)}</p>
      </section>

      ${overlayHtml}

      <section class="memo-section">
        <div class="memo-section__label">Next</div>
        <div class="memo-next">
          ${recipe.next.map(n => `
            <a class="memo-next__link" href="#/tools/${n.slug}">
              <span class="memo-next__arrow">↗</span>
              <span class="memo-next__label">${escapeHtml(n.label)}</span>
            </a>
          `).join('')}
        </div>
      </section>

      <section class="memo-section memo-section--provenance">
        <div class="memo-section__label">Provenance</div>
        <ul class="memo-provenance">
          ${recipe.provenance.map(p => `
            <li>
              <span class="memo-provenance__label">${escapeHtml(p.label)}</span>
              <code class="memo-provenance__source">${escapeHtml(p.source)}</code>
              <span class="memo-provenance__tier" data-tier="${p.tier}">tier ${p.tier}</span>
            </li>
          `).join('')}
          <li>
            <span class="memo-provenance__label">Routing</span>
            <code class="memo-provenance__source">terminal/classifier v1</code>
            <span class="memo-provenance__tier" data-tier="S">tier S</span>
          </li>
        </ul>
      </section>
    </article>
  `;
}

function renderErrorMemo(root, query, err) {
  root.removeAttribute('data-empty');
  root.innerHTML = `
    <article class="memo">
      <header class="memo__header">
        <div class="memo__crumb">DECISION MEMO · ERROR</div>
        <div class="memo__query">Q: <span class="memo__query-text">${escapeHtml(query)}</span></div>
        <div class="memo-meta" data-tone="low">
          <span class="memo-meta__chip memo-meta__chip--warn">RECIPE FAILED</span>
        </div>
      </header>
      <section class="memo-section">
        <div class="memo-section__label">What happened</div>
        <p class="memo-section__body">A recipe threw while composing this memo. Open the relevant tool surface directly and the same calculation runs without the orchestration layer.</p>
      </section>
      <section class="memo-section">
        <div class="memo-section__label">Error trace</div>
        <p class="memo-section__body"><code>${escapeHtml(err.message || String(err))}</code></p>
      </section>
    </article>
  `;
}

function renderEntityChips(ent) {
  const chips = [];
  if (ent.cluster) chips.push({ k: 'cluster', v: ent.cluster });
  if (ent.role) chips.push({ k: 'role', v: ent.role });
  for (const c of ent.cities) chips.push({ k: 'city', v: c.key });
  for (const c of ent.comps) chips.push({ k: 'comp', v: `₹${c.value}${c.unit}` });
  for (const y of ent.years) chips.push({ k: 'years', v: `${y.value}y` });
  for (const s of ent.skills) chips.push({ k: 'skill', v: s.key });
  if (ent.firmType) chips.push({ k: 'firm', v: ent.firmType });
  if (chips.length === 0) return '';
  return `<div class="memo-entities">
    <span class="memo-entities__label">Extracted:</span>
    ${chips.map(c => `<span class="memo-entities__chip"><span class="memo-entities__k">${c.k}</span>${escapeHtml(c.v)}</span>`).join('')}
  </div>`;
}

function formatValue(v, unit) {
  if (typeof v !== 'number') return String(v);
  if (unit.includes('Cr')) return v.toFixed(2);
  if (unit.includes('L')) return (v >= 0 ? '+' : '') + v.toFixed(1);
  return Math.round(v).toString();
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
