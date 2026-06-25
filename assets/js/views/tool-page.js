/* ──────────────────────────────────────────────────────────────────────
   TOOL PAGE RENDERER — universal shell.
   Every tool page renders through this. Specific tool logic lives in
   assets/js/tools/<slug>.js as a pure module exporting { meta, schema,
   defaults, compute, interpret, related, related_methodology }.
   ────────────────────────────────────────────────────────────────────── */

import { countUp } from '../motion.js';

let _registry = null;
async function loadRegistry() {
  if (_registry) return _registry;
  const res = await fetch('assets/data/tool-registry.json');
  _registry = await res.json();
  return _registry;
}

function arrow(size = 12) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 10 10" fill="none">
    <path d="M2 5h6m0 0L5 2m3 3L5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function render(container, { slug, store }) {
  const registry = await loadRegistry();
  const meta = registry.tools.find(t => t.slug === slug);
  const layer = meta ? registry.layers.find(l => l.code === meta.layer) : null;

  if (!meta || meta.status !== 'live') {
    renderUnavailable(container, meta, layer);
    return;
  }

  // Dynamically import the tool module
  let toolModule;
  try {
    toolModule = await import(`../tools/${slug}.js`);
  } catch (e) {
    console.error('Tool module load failed:', e);
    renderUnavailable(container, meta, layer);
    return;
  }

  renderToolShell(container, { meta, layer, toolModule, store });
}

function renderUnavailable(container, meta, layer) {
  container.innerHTML = `
    <div class="surface-head">
      <div class="surface-head__inner">
        <div class="surface-head__eyebrow">${layer ? layer.code + ' · ' + layer.name : 'Tool'}</div>
        <h1 class="surface-head__title">${meta ? meta.name : 'Tool unavailable'}</h1>
        <p class="surface-head__sub">This engine is on the roadmap. The framework is published — only the engine surface awaits build.</p>
      </div>
    </div>
    <div class="scaffold">
      <div class="scaffold__label">In Build</div>
      <div class="scaffold__title">Ships in a later phase</div>
      <p class="scaffold__body">In the meantime, you can read the methodology for ${layer ? layer.framework : 'the relevant framework'}.</p>
      <div style="margin-top: var(--s-5); display: flex; gap: var(--s-3); justify-content: center;">
        <a class="btn btn--secondary" href="#/tools">← Back to Tools</a>
        <a class="btn btn--ghost" href="#/methodology">Read methodology ${arrow()}</a>
      </div>
    </div>
  `;
}

function renderToolShell(container, { meta, layer, toolModule, store }) {
  const { schema, defaults, compute, interpret, related, related_methodology, context } = toolModule;

  // Defensive: a tool's defaults() can throw (e.g. when benchmark data is
  // incomplete or empty). When that happens, surface a clear error instead
  // of a blank screen.
  let base, initial;
  try {
    const saved = store.getScenario(meta.slug);
    base = defaults(store.profile);
    initial = saved ? { ...base, ...saved } : base;
    if (initial.cluster && !defaults({ cluster: initial.cluster, role: initial.role }).role) {
      Object.assign(initial, base);
    }
    // Validate every select-field value against the current options universe.
    // Saved scenarios from earlier builds can carry stale keys (e.g. lowercase
    // city slugs) that no longer match the canonical benchmark-driven option
    // values. When a stale value is detected, fall back to the schema's fresh
    // default for that field so the dropdown renders the correct selection.
    for (const field of schema) {
      if (field.kind !== 'select') continue;
      const opts = (typeof field.getOptions === 'function') ? field.getOptions(initial) : (field.options || []);
      if (!opts || opts.length === 0) continue;
      const hasMatch = opts.some(o => o.value === initial[field.key]);
      if (!hasMatch) initial[field.key] = base[field.key] ?? opts[0].value;
    }
  } catch (err) {
    console.error('Tool init failed:', err);
    container.innerHTML = `
      <div class="surface-head">
        <div class="surface-head__inner">
          <div class="surface-head__eyebrow">${layer ? layer.code + ' · ' + layer.name : 'Tool'}</div>
          <h1 class="surface-head__title">${meta.name}</h1>
          <p class="surface-head__sub">This tool couldn't initialize — usually because the benchmark dataset failed to load.</p>
        </div>
      </div>
      <div class="scaffold">
        <div class="scaffold__label">Initialization error</div>
        <div class="scaffold__title">Tool did not load</div>
        <p class="scaffold__body">Try refreshing the page. If the issue persists, the benchmark file
          (<code>assets/data/benchmarks/benchmarks_master.json</code>) may not be reachable from this
          deployment, or a saved scenario contains an invalid field. Open the browser console for the trace.</p>
        <p class="scaffold__body" style="margin-top:var(--s-3); font-family:var(--font-mono); font-size:11px; color:var(--ink-tertiary);">
          ${escapeHtml(err.message || String(err))}
        </p>
        <div style="margin-top: var(--s-5); display: flex; gap: var(--s-3); justify-content: center;">
          <a class="btn btn--secondary" href="#/tools">← Back to Tools</a>
          <button class="btn btn--ghost" onclick="location.reload()">Reload</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <header class="tool-head">
      <div class="topbar__crumb" style="margin-bottom: var(--s-4);">
        <a href="#/tools">Tools</a>
        <span class="topbar__crumb-sep">/</span>
        <span class="topbar__crumb-current">${layer.name}</span>
      </div>

      <div class="tool-head__row">
        <div class="tool-head__title-group">
          <h1 class="tool-head__title">${meta.name}</h1>
          <p class="tool-head__purpose">${meta.purpose}</p>
          <div class="tool-head__tags" style="margin-top: var(--s-4);">
            <span class="tag tag--framework">${meta.layer}</span>
            <span class="tag tag--status-live">Live</span>
          </div>
        </div>
        <div class="tool-head__actions">
          <button class="btn btn--ghost btn--sm" id="ask-verastra">Ask Verastra ${arrow()}</button>
          <button class="btn btn--secondary btn--sm" id="save-scenario">Save scenario</button>
        </div>
      </div>
    </header>

    ${context ? renderContext(context) : ''}

    <div class="tool-workspace">
      <aside class="workspace-inputs">
        <div class="workspace-inputs__head">
          <div class="workspace-inputs__title">Assumptions</div>
          <button class="workspace-inputs__reset" id="reset-inputs">Reset</button>
        </div>
        <div id="inputs-body"></div>
      </aside>

      <div class="workspace-outputs">
        <div class="output-headline" id="output-headline"></div>
        <div class="output-chart" id="output-chart"></div>
        <div class="output-rail" id="output-rail"></div>
      </div>
    </div>

    <section class="interpretation">
      <div class="interpretation__head">
        <div class="interpretation__eyebrow">Interpretation</div>
        <h2 class="interpretation__title">How to read this result.</h2>
      </div>
      <div class="interpretation__grid" id="interpretation-grid"></div>
    </section>

    <section class="related-routes">
      <div class="related-routes__label">Related Engines & Doctrine</div>
      <div class="related-routes__grid" id="related-grid"></div>
    </section>
  `;

  // State
  const state = { ...initial };

  // Wire context toggle
  const ctxEl = container.querySelector('.tool-context');
  if (ctxEl) {
    ctxEl.querySelector('.tool-context__head').addEventListener('click', () => {
      ctxEl.classList.toggle('is-open');
    });
  }

  // Render inputs
  const inputsBody = container.querySelector('#inputs-body');
  renderInputs(inputsBody, schema, state, () => rerender());

  // Wire reset
  container.querySelector('#reset-inputs').addEventListener('click', () => {
    Object.assign(state, defaults(store.profile));
    renderInputs(inputsBody, schema, state, () => rerender());
    rerender();
  });

  // Wire save scenario
  container.querySelector('#save-scenario').addEventListener('click', (e) => {
    store.saveScenario(meta.slug, { ...state });
    const btn = e.currentTarget;
    const orig = btn.textContent;
    btn.textContent = 'Saved ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1600);
  });

  // Wire ask verastra
  container.querySelector('#ask-verastra').addEventListener('click', () => {
    window.location.hash = '#/terminal';
  });

  // Initial output render
  let isFirstRender = true;
  function rerender() {
    const result = compute(state);
    renderHeadline(container.querySelector('#output-headline'), result, isFirstRender);
    renderChart(container.querySelector('#output-chart'), result, isFirstRender);
    renderRail(container.querySelector('#output-rail'), result);
    renderInterpretation(container.querySelector('#interpretation-grid'), interpret(result, state));
    renderRelated(container.querySelector('#related-grid'), related, related_methodology);
    isFirstRender = false;
  }
  rerender();
}

function renderContext(ctx) {
  return `<div class="tool-context">
    <div class="tool-context__head">
      <span class="tool-context__head-label">Context · What this tool is for</span>
      <span class="tool-context__caret">⌄</span>
    </div>
    <div class="tool-context__body">
      <div>
        <div class="tool-context__item-label">When to use</div>
        <div class="tool-context__item-text">${ctx.when}</div>
      </div>
      <div>
        <div class="tool-context__item-label">What it returns</div>
        <div class="tool-context__item-text">${ctx.returns}</div>
      </div>
      <div>
        <div class="tool-context__item-label">What it does not do</div>
        <div class="tool-context__item-text">${ctx.limits}</div>
      </div>
    </div>
  </div>`;
}

function renderInputs(host, schema, state, onRecompute) {
  function getOpts(field) {
    // Lazy options: any field can provide getOptions(state) and it will be
    // called at render time. This is essential for benchmark-driven option
    // lists, which may be empty at module-import time and only populate
    // once the benchmark dataset has finished loading.
    if (typeof field.getOptions === 'function') return field.getOptions(state);
    return field.options || [];
  }

  function build() {
    host.innerHTML = schema.map(field => {
      const val = state[field.key];
      if (field.kind === 'select') {
        const opts = getOpts(field);
        const optionsHtml = opts.map(o =>
          `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`
        ).join('');
        return `<div class="input-field">
          <div class="input-field__head">
            <label class="input-field__label">${field.label}</label>
          </div>
          <select class="select" data-key="${field.key}">${optionsHtml}</select>
          ${field.hint ? `<div class="input-field__hint">${field.hint}</div>` : ''}
        </div>`;
      }
      // range
      const display = field.format ? field.format(val) : val;
      return `<div class="input-field">
        <div class="input-field__head">
          <label class="input-field__label">${field.label}</label>
          <span class="input-field__value" data-display="${field.key}">${display}</span>
        </div>
        <input type="range" class="range" data-key="${field.key}"
          min="${field.min}" max="${field.max}" step="${field.step || 1}" value="${val}" />
        ${field.hint ? `<div class="input-field__hint">${field.hint}</div>` : ''}
      </div>`;
    }).join('');

    host.querySelectorAll('[data-key]').forEach(input => {
      const key = input.dataset.key;
      const field = schema.find(f => f.key === key);
      input.addEventListener('input', (e) => {
        let v = e.target.value;
        if (field.kind !== 'select') v = parseFloat(v);
        state[key] = v;

        // If the field has side effects (e.g. cluster changes role + priors),
        // run them, then re-render the whole inputs panel because other state
        // keys (including ranges) may have shifted.
        if (typeof field.onChange === 'function') {
          field.onChange(state);
          build();
        } else {
          const displayEl = host.querySelector(`[data-display="${key}"]`);
          if (displayEl) displayEl.textContent = field.format ? field.format(v) : v;
        }

        onRecompute();
      });
    });
  }

  build();
}

function renderHeadline(host, result, animate) {
  const h = result.headline;
  host.innerHTML = `
    <div class="output-headline__label">${h.label}</div>
    <div class="output-headline__value">
      <span id="headline-value">${animate ? '0' : h.formatted}</span>
      <span class="output-headline__unit">${h.unit}</span>
    </div>
    <div class="output-headline__sub">
      ${h.sub.map(s => `
        <div class="output-headline__sub-item">
          <div class="output-headline__sub-label">${s.label}</div>
          <div class="output-headline__sub-value">${s.value}</div>
        </div>
      `).join('')}
    </div>
  `;
  if (animate) {
    const el = host.querySelector('#headline-value');
    countUp(el, h.value, { duration: 1200, formatter: h.formatter });
  }
}

function renderChart(host, result, animate) {
  const c = result.chart;
  if (!c) { host.innerHTML = ''; return; }
  const type = c.type || 'line';
  host.innerHTML = `
    <div class="output-chart__head">
      <div class="output-chart__title">${c.title}</div>
      ${c.series && c.series.length ? `
        <div class="output-chart__legend">
          ${c.series.map(s => `
            <div class="output-chart__legend-item">
              <span class="output-chart__swatch" style="background:${s.color}"></span>
              ${s.label}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
    ${
      type === 'bar'          ? buildBarSvg(c, animate) :
      type === 'distribution' ? buildDistSvg(c, animate) :
                                buildSvg(c, animate)
    }
  `;
}

function buildBarSvg(c, animate) {
  // Horizontal stacked-or-grouped bar. c.bars = [{label, value, color, max}]
  const bars = c.bars || [];
  const W = 800, H = Math.max(180, bars.length * 56 + 40);
  const padL = 180, padR = 80, padT = 24, padB = 16;
  const innerW = W - padL - padR;
  const max = c.barMax || Math.max(...bars.map(b => b.value)) * 1.1;
  const rowH = 28;
  const rowGap = 24;

  const rows = bars.map((b, i) => {
    const y = padT + i * (rowH + rowGap);
    const width = Math.max(2, (b.value / max) * innerW);
    const dashStyle = animate ? `transform: scaleX(0); transform-origin: left; animation: bar-grow-${i} 900ms cubic-bezier(0.19,1,0.22,1) ${i * 80}ms forwards;` : '';
    return `
      <text x="${padL - 12}" y="${y + rowH / 2 + 4}" text-anchor="end"
        font-family="Inter Tight, sans-serif" font-size="13" fill="var(--ink-secondary)">${b.label}</text>
      <rect x="${padL}" y="${y}" width="${innerW}" height="${rowH}" rx="3" fill="var(--bg-elevated)" />
      <rect x="${padL}" y="${y}" width="${width.toFixed(2)}" height="${rowH}" rx="3" fill="${b.color}" style="${dashStyle}" />
      <text x="${padL + width + 8}" y="${y + rowH / 2 + 4}"
        font-family="JetBrains Mono, monospace" font-size="12" fill="var(--ink-primary)">${b.display || b.value.toFixed(2)}</text>
    `;
  }).join('');

  const keyframes = animate ? `<style>
    ${bars.map((_, i) => `@keyframes bar-grow-${i} { to { transform: scaleX(1); } }`).join('')}
  </style>` : '';

  return `<svg viewBox="0 0 ${W} ${H}" class="output-chart__svg" preserveAspectRatio="none" style="height:${H}px;">
    ${keyframes}
    ${rows}
  </svg>`;
}

function buildDistSvg(c, animate) {
  // Normal distribution curve with vertical marker at c.markerZ (in stdev units)
  const W = 800, H = 280;
  const padL = 48, padR = 24, padT = 24, padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Sample the curve from -3 to +3 sigma
  const samples = 120;
  const points = [];
  let yMax = 0;
  for (let i = 0; i <= samples; i++) {
    const z = -3 + (6 * i / samples);
    const y = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-z * z / 2);
    points.push({ z, y });
    if (y > yMax) yMax = y;
  }

  const xScale = z => padL + ((z + 3) / 6) * innerW;
  const yScale = y => padT + innerH - (y / yMax) * innerH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.z).toFixed(2)},${yScale(p.y).toFixed(2)}`).join(' ');
  const areaPath = path + ` L${xScale(3)},${yScale(0)} L${xScale(-3)},${yScale(0)} Z`;

  // Marker
  const markerZ = c.markerZ != null ? Math.max(-3, Math.min(3, c.markerZ)) : 0;
  const markerX = xScale(markerZ);
  const markerY = yScale((1 / Math.sqrt(2 * Math.PI)) * Math.exp(-markerZ * markerZ / 2));

  // X-axis labels in percentile units
  const pcts = [10, 25, 50, 75, 90];
  const zFromPct = p => {
    // Approximate inverse normal (Beasley-Springer)
    const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2, 1.383577518672690e+2, -3.066479806614716e+1, 2.506628277459239];
    const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2, 6.680131188771972e+1, -1.328068155288572e+1];
    const pp = p / 100;
    const q = pp - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = q * q;
      return q * (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) /
                 (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    }
    return 0;
  };
  const xLabels = pcts.map(p => {
    const z = zFromPct(p);
    return `<text x="${xScale(z)}" y="${H - padB + 18}" text-anchor="middle"
      font-family="JetBrains Mono, monospace" font-size="10" fill="var(--ink-tertiary)">${p}th</text>`;
  }).join('');

  const anim = animate ? `<style>
    .dist-curve { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: dist-draw 1400ms cubic-bezier(0.19,1,0.22,1) forwards; }
    .dist-area  { opacity: 0; animation: dist-fade 1000ms ease-out 800ms forwards; }
    .dist-marker { opacity: 0; animation: dist-fade 600ms ease-out 1400ms forwards; }
    @keyframes dist-draw { to { stroke-dashoffset: 0; } }
    @keyframes dist-fade { to { opacity: 1; } }
  </style>` : '';

  return `<svg viewBox="0 0 ${W} ${H}" class="output-chart__svg" preserveAspectRatio="none">
    ${anim}
    <path class="dist-area" d="${areaPath}" fill="var(--accent)" fill-opacity="0.08" />
    <path class="dist-curve" d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    ${xLabels}
    <g class="dist-marker">
      <line x1="${markerX}" y1="${padT}" x2="${markerX}" y2="${H - padB}" stroke="var(--data-blue)" stroke-width="1.6" stroke-dasharray="3 3" />
      <circle cx="${markerX}" cy="${markerY}" r="5" fill="var(--data-blue)" stroke="var(--bg-panel)" stroke-width="2" />
      <text x="${markerX}" y="${padT - 8}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="11" fill="var(--data-blue)">You · ${c.markerLabel || ''}</text>
    </g>
  </svg>`;
}

function buildSvg(c, animate) {
  const W = 800, H = 280;
  const padL = 48, padR = 24, padT = 24, padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const years = c.years;
  const xMin = years[0], xMax = years[years.length - 1];
  const xScale = x => padL + ((x - xMin) / (xMax - xMin)) * innerW;

  // determine y range across all series
  const allVals = c.series.flatMap(s => s.values);
  const yMax = Math.max(...allVals) * 1.05;
  const yMin = 0;
  const yScale = y => padT + innerH - ((y - yMin) / (yMax - yMin)) * innerH;

  // y-axis ticks
  const yTicks = 4;
  const yTickVals = [];
  for (let i = 0; i <= yTicks; i++) yTickVals.push((yMax / yTicks) * i);

  const gridLines = yTickVals.map(v => {
    const y = yScale(v);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
      stroke="var(--hairline)" stroke-width="1" />`;
  }).join('');

  const yLabels = yTickVals.map(v => {
    const y = yScale(v);
    return `<text x="${padL - 8}" y="${y + 4}" text-anchor="end"
      font-family="var(--font-mono)" font-size="10" fill="var(--ink-tertiary)">${c.yFormatter(v)}</text>`;
  }).join('');

  const xTickEvery = Math.max(1, Math.floor(years.length / 6));
  const xLabels = years.filter((_, i) => i % xTickEvery === 0 || i === years.length - 1).map(y => {
    return `<text x="${xScale(y)}" y="${H - padB + 18}" text-anchor="middle"
      font-family="var(--font-mono)" font-size="10" fill="var(--ink-tertiary)">${y}</text>`;
  }).join('');

  const seriesPaths = c.series.map((s, i) => {
    const path = s.values.map((v, idx) => {
      const x = xScale(years[idx]);
      const y = yScale(v);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');

    const dashLen = animate ? 2000 : 0;
    const styleAnim = animate ? `stroke-dasharray:${dashLen}; stroke-dashoffset:${dashLen};
      animation: drawline-${i} 1400ms cubic-bezier(0.19,1,0.22,1) forwards;` : '';

    // Filled area below the line (subtle)
    const areaPath = path + ` L${xScale(years[years.length - 1])},${yScale(0)} L${xScale(years[0])},${yScale(0)} Z`;
    const area = s.fill ? `<path d="${areaPath}" fill="${s.color}" fill-opacity="0.06" />` : '';

    return `${area}
      <path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}"
        stroke-linecap="round" stroke-linejoin="round" style="${styleAnim}"
        ${s.dashed ? 'stroke-dasharray="4 4"' : ''} />`;
  }).join('');

  const keyframes = animate ? `<style>
    ${c.series.map((_, i) => `@keyframes drawline-${i} { to { stroke-dashoffset: 0; } }`).join('')}
  </style>` : '';

  return `<svg viewBox="0 0 ${W} ${H}" class="output-chart__svg" preserveAspectRatio="none">
    ${keyframes}
    ${gridLines}
    ${yLabels}
    ${xLabels}
    ${seriesPaths}
  </svg>`;
}

function renderRail(host, result) {
  host.innerHTML = result.rail.map(item => `
    <div class="output-rail__item">
      <div class="output-rail__label">${item.label}</div>
      <div class="output-rail__value">${item.value}</div>
      ${item.sub ? `<div class="output-rail__sub">${item.sub}</div>` : ''}
    </div>
  `).join('');
}

function renderInterpretation(host, blocks) {
  host.innerHTML = blocks.map(b => `
    <div class="interpretation__block">
      <div class="interpretation__block-label">${b.label}</div>
      <div class="interpretation__block-body">${b.body}</div>
    </div>
  `).join('');
}

function renderRelated(host, tools = [], methodology = []) {
  const toolItems = tools.map(t => `
    <a href="#/tools/${t.slug}" class="related-routes__item">
      <div class="related-routes__item-text">
        <div class="related-routes__item-label">Engine</div>
        <div class="related-routes__item-name">${t.name}</div>
      </div>
      <span class="related-routes__arrow">${arrow(14)}</span>
    </a>
  `).join('');
  const methodItems = methodology.map(m => `
    <a href="#/methodology" class="related-routes__item">
      <div class="related-routes__item-text">
        <div class="related-routes__item-label">Methodology</div>
        <div class="related-routes__item-name">${m.name}</div>
      </div>
      <span class="related-routes__arrow">${arrow(14)}</span>
    </a>
  `).join('');
  host.innerHTML = toolItems + methodItems;
}
