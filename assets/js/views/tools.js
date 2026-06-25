/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — TOOLS · The Execution Layer
   Four layers, top to bottom:
     1  Positioning + system status
     2  Decision entry — 7 pucks, each routing to a live engine
     3  Framework shelves — 6 sections, structurally identical
     4  System meta — thin operating-ledger footer
   ────────────────────────────────────────────────────────────────────── */

import { reveal } from '../motion.js';

let _registry = null;

async function loadRegistry() {
  if (_registry) return _registry;
  const res = await fetch('assets/data/tool-registry.json');
  _registry = await res.json();
  return _registry;
}

/* ── icon ───────────────────────────────────────────────────────────── */

function arrowSvg(cls = 'tool-card__cta-arrow') {
  return `<svg class="${cls}" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M2 5h6m0 0L5 2m3 3L5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════════════
   LAYER 1 · POSITIONING + STATUS
   ══════════════════════════════════════════════════════════════════════ */

function surfaceHeader(registry) {
  const tools = registry.tools;
  const liveCount = tools.filter(t => t.status === 'live').length;
  const totalCount = tools.length;
  const buildCount = tools.filter(t => t.status === 'build').length;
  const benchVer = registry.meta?.benchmark_version || '—';
  const terminalRoutes = registry.meta?.terminal_routes?.length || 0;

  return `
    <header class="tools-head">
      <div class="tools-head__eyebrow">Engine room · ${liveCount} of ${totalCount} engines online</div>
      <h1 class="tools-head__title">The execution layer of Verastra — six frameworks, ${totalCount} engines.</h1>
      <p class="tools-head__lede">
        Each engine answers a specific decision question. Each framework corresponds to a published
        methodology. Enter by decision question below, or browse the six framework shelves further down.
      </p>
      <div class="tools-status">
        <span class="tools-status__cell"><span class="tools-status__dot tools-status__dot--live"></span>${liveCount} online</span>
        <span class="tools-status__sep"></span>
        <span class="tools-status__cell"><span class="tools-status__dot tools-status__dot--build"></span>${buildCount} in build</span>
        <span class="tools-status__sep"></span>
        <span class="tools-status__cell">Benchmark layer ${benchVer} active</span>
        <span class="tools-status__sep"></span>
        <span class="tools-status__cell">Terminal routes ${terminalRoutes} engines</span>
      </div>
    </header>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   LAYER 2 · DECISION ENTRY
   ══════════════════════════════════════════════════════════════════════ */

function decisionEntry(registry) {
  const pucks = registry.decision_entries || [];
  /* Build a slug → engine map so pucks can surface the routed engine's output */
  const engineMap = Object.fromEntries(
    registry.tools.filter(t => t.status === 'live').map(t => [t.slug, t])
  );
  return `
    <section class="decision-entry" data-reveal>
      <div class="decision-entry__head">
        <div class="decision-entry__eyebrow">Enter by decision question</div>
        <div class="decision-entry__hint">fast paths to live engines</div>
      </div>
      <div class="decision-entry__grid">
        ${pucks.map(p => decisionPuck(p, engineMap[p.route_slug])).join('')}
      </div>
      <div class="decision-entry__terminal">
        Have a different question?
        <a href="#/terminal" class="decision-entry__terminal-link">Ask Terminal ${arrowSvg('decision-entry__terminal-arrow')}</a>
      </div>
    </section>
  `;
}

function decisionPuck(p, engine) {
  const output = engine?.output || '';
  return `
    <a class="decision-puck" href="#/tools/${p.route_slug}">
      <div class="decision-puck__top">
        <span class="decision-puck__kind">${p.kind}</span>
        <span class="decision-puck__frame">${p.framework}</span>
      </div>
      <div class="decision-puck__question">${p.question}</div>
      <div class="decision-puck__route">
        <span class="decision-puck__route-arrow">→</span>
        <span class="decision-puck__route-label">${p.route_label}</span>
      </div>
      ${output ? `
        <div class="decision-puck__output">
          <span class="decision-puck__output-label">Outputs</span>
          <span class="decision-puck__output-value">${output}</span>
        </div>
      ` : ''}
    </a>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   LAYER 3 · FRAMEWORK SHELVES
   ══════════════════════════════════════════════════════════════════════ */

function frameworkShelf(layer, tools) {
  const liveTools  = tools.filter(t => t.status === 'live');
  const buildTools = tools.filter(t => t.status === 'build');
  const count = tools.length;
  const liveCount = liveTools.length;

  /* Visual emphasis: shelves with multiple live engines get a subtle accent
     on the code rule. Roadmap-only frameworks (OT, 0 live) get the same
     shell — just no live grid. */
  const shelfClass = liveCount >= 2 ? 'shelf shelf--anchored'
                    : liveCount === 1 ? 'shelf shelf--standard'
                    : 'shelf shelf--roadmap-only';

  /* Live grid width collapses based on live count — single live engines
     render as a feature card capped in width, not a lonely card in an
     empty row. */
  const liveGridCountClass = liveCount === 1 ? 'shelf__grid--live-1'
                            : liveCount === 2 ? 'shelf__grid--live-2'
                            : 'shelf__grid--live-3';

  let toolIdx = 0;
  const renderLive  = list => list.map(t => { toolIdx++; return liveCard(t, toolIdx, layer.code); }).join('');
  const renderBuild = list => list.map(t => { toolIdx++; return buildCard(t, toolIdx, layer.code); }).join('');

  /* Roadmap divider line — same divider in all shelves, OT included */
  const roadmapDivider = buildTools.length
    ? `<div class="shelf__divider">
         <div class="shelf__divider-label">ROADMAP · ${buildTools.length} ENGINE${buildTools.length === 1 ? '' : 'S'} · ${layer.roadmap_theme || ''}</div>
       </div>`
    : '';

  return `
    <section class="shelf ${shelfClass}" data-reveal>
      <header class="shelf__head">
        <div class="shelf__identity">
          <span class="shelf__code">${layer.code}</span>
          <span class="shelf__code-sep">·</span>
          <span class="shelf__framework">${layer.framework}</span>
          <span class="shelf__counter">${liveCount}/${count} online</span>
        </div>
        <h2 class="shelf__name">${layer.name}</h2>
        <p class="shelf__purpose">${layer.purpose}</p>
        <div class="shelf__signals">
          <div class="shelf__signal-row">
            <span class="shelf__signal-label">Governs</span>
            <span class="shelf__signal-list">${(layer.governs || []).join(' · ')}</span>
          </div>
          <div class="shelf__signal-row">
            <span class="shelf__signal-label">Data</span>
            <span class="shelf__signal-list">${(layer.data_layers || []).join(' · ')}</span>
          </div>
        </div>
      </header>

      ${liveTools.length ? `<div class="shelf__grid shelf__grid--live ${liveGridCountClass}">${renderLive(liveTools)}</div>` : ''}
      ${roadmapDivider}
      ${buildTools.length ? `<div class="shelf__grid shelf__grid--build">${renderBuild(buildTools)}</div>` : ''}
    </section>
  `;
}

/* ── tool cards ─────────────────────────────────────────────────────── */

function liveCard(tool, idx, layerCode) {
  const code = `${layerCode} · ${String(idx).padStart(2, '0')}`;
  const signals = (tool.signals || []).slice(0, 3); /* hard cap at 3 */
  const inputs = (tool.inputs || []).join(' · ');

  return `
    <a class="tool-card tool-card--live" href="#/tools/${tool.slug}">
      <div class="tool-card__header">
        <span class="tool-card__code">${code}</span>
        <span class="tool-card__status tool-card__status--live">
          <span class="tool-card__status-dot"></span>
          Live
        </span>
      </div>
      <div class="tool-card__title">${tool.name}</div>
      <div class="tool-card__decision">${tool.decision || tool.purpose}</div>
      <div class="tool-card__spec">
        <div class="tool-card__spec-row">
          <span class="tool-card__spec-label">Kind</span>
          <span class="tool-card__spec-value">${tool.kind || '—'}</span>
        </div>
        ${inputs ? `
          <div class="tool-card__spec-row">
            <span class="tool-card__spec-label">Inputs</span>
            <span class="tool-card__spec-value tool-card__spec-value--mono">${inputs}</span>
          </div>
        ` : ''}
        ${tool.output ? `
          <div class="tool-card__spec-row">
            <span class="tool-card__spec-label">Output</span>
            <span class="tool-card__spec-value">${tool.output}</span>
          </div>
        ` : ''}
      </div>
      ${signals.length ? `
        <div class="tool-card__signals">
          ${signals.map(s => `<span class="tool-card__signal">${s}</span>`).join('')}
        </div>
      ` : ''}
      <div class="tool-card__foot">
        <span class="tool-card__cta">Open ${arrowSvg()}</span>
      </div>
    </a>
  `;
}

function buildCard(tool, idx, layerCode) {
  const code = `${layerCode} · ${String(idx).padStart(2, '0')}`;
  const forward = tool.forward || tool.purpose;

  return `
    <div class="tool-card tool-card--build" aria-disabled="true">
      <div class="tool-card__header">
        <span class="tool-card__code">${code}</span>
        <span class="tool-card__status tool-card__status--build">
          <span class="tool-card__status-dot"></span>
          In Build
        </span>
      </div>
      <div class="tool-card__title">${tool.name}</div>
      <div class="tool-card__forward">${forward}</div>
      <div class="tool-card__planned">
        <span class="tool-card__planned-label">Planned</span>
        <span class="tool-card__planned-kind">${tool.kind || 'Engine'}</span>
      </div>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   LAYER 4 · SYSTEM META
   ══════════════════════════════════════════════════════════════════════ */

function systemMeta(registry) {
  const tools = registry.tools;
  const live = tools.filter(t => t.status === 'live').length;
  const build = tools.filter(t => t.status === 'build').length;
  const benchVer = registry.meta?.benchmark_version || '—';
  const newestSlug = registry.meta?.newest_engine_slug;
  const newest = tools.find(t => t.slug === newestSlug);
  const terminalRoutes = registry.meta?.terminal_routes?.length || 0;

  return `
    <footer class="tools-meta">
      <div class="tools-meta__group tools-meta__group--status">
        <span class="tools-meta__live-dot"></span>
        <span class="tools-meta__cell tools-meta__cell--strong">System online</span>
        <span class="tools-meta__sep">·</span>
        <span class="tools-meta__cell">${live} live</span>
        <span class="tools-meta__sep">·</span>
        <span class="tools-meta__cell">${build} in build</span>
      </div>
      <div class="tools-meta__divider"></div>
      <div class="tools-meta__group">
        <span class="tools-meta__cell">Benchmark layer ${benchVer}</span>
        ${newest ? `
          <span class="tools-meta__sep">·</span>
          <span class="tools-meta__cell">Newest · ${newest.name}</span>
        ` : ''}
      </div>
      <div class="tools-meta__divider"></div>
      <div class="tools-meta__group">
        <span class="tools-meta__cell">Terminal → ${terminalRoutes} engines</span>
      </div>
    </footer>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════════ */

export async function render(container) {
  const registry = await loadRegistry();

  const shelves = registry.layers.map(layer => {
    const tools = registry.tools.filter(t => t.layer === layer.code);
    return frameworkShelf(layer, tools);
  }).join('');

  container.innerHTML = `
    <div class="tools">
      ${surfaceHeader(registry)}
      ${decisionEntry(registry)}
      <div class="tools__shelves">${shelves}</div>
      ${systemMeta(registry)}
    </div>
  `;

  reveal('[data-reveal]');
}
