/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — LANDING JS
   Hero PCV chart, reveal-on-scroll, curtain transition.
   ────────────────────────────────────────────────────────────────────── */

import { countUp } from './motion.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Hero chart — a real PCV computation, not a mock ─────────────── */

const HERO_SCENARIO = {
  currentComp: 16,     // ₹L — generalist FP&A professional
  growthRate: 0.13,
  volatility: 0.28,
  discountRate: 0.09,
  horizonYears: 30,
};

function computeHero(s) {
  const haircut = 0.3 * s.volatility;
  const years = [], expected = [], discounted = [];
  let pv = 0, nominal = 0;
  for (let t = 0; t < s.horizonYears; t++) {
    const e = s.currentComp * Math.pow(1 + s.growthRate, t) * (1 - haircut);
    const d = e / Math.pow(1 + s.discountRate, t);
    years.push(2026 + t);
    expected.push(e);
    discounted.push(d);
    pv += d;
    nominal += e;
  }
  return {
    pvCr: pv / 100,
    nominalCr: nominal / 100,
    drag: 1 - (pv / nominal),
    peak: expected[expected.length - 1],
    years, expected, discounted,
  };
}

function buildHeroChart() {
  const host = document.getElementById('hero-chart');
  if (!host) return;
  const r = computeHero(HERO_SCENARIO);

  const W = 900, H = 240;
  const padL = 40, padR = 16, padT = 16, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xMin = r.years[0], xMax = r.years[r.years.length - 1];
  const xScale = x => padL + ((x - xMin) / (xMax - xMin)) * innerW;
  const yMax = Math.max(...r.expected) * 1.05;
  const yScale = y => padT + innerH - (y / yMax) * innerH;

  const yTicks = 3;
  const yVals = [];
  for (let i = 1; i <= yTicks; i++) yVals.push((yMax / yTicks) * i);

  const grid = yVals.map(v => {
    const y = yScale(v);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--hairline)" stroke-width="1" />`;
  }).join('');

  const yLabels = yVals.map(v => {
    const y = yScale(v);
    return `<text x="${padL - 8}" y="${y + 4}" text-anchor="end"
      font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-tertiary)">₹${v.toFixed(0)}L</text>`;
  }).join('');

  const xLabelYears = [r.years[0], r.years[Math.floor(r.years.length / 2)], r.years[r.years.length - 1]];
  const xLabels = xLabelYears.map(y => `
    <text x="${xScale(y)}" y="${H - padB + 16}" text-anchor="middle"
      font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-tertiary)">${y}</text>
  `).join('');

  const path = (vals) => vals.map((v, i) => {
    const x = xScale(r.years[i]);
    const y = yScale(v);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  const pathExpected = path(r.expected);
  const pathDiscounted = path(r.discounted);
  const areaDiscounted = pathDiscounted +
    ` L${xScale(r.years[r.years.length - 1])},${yScale(0)} L${xScale(r.years[0])},${yScale(0)} Z`;

  const anim = REDUCED ? '' : `
    <style>
      .hero-line-expected { stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: hero-draw-1 1600ms cubic-bezier(0.19,1,0.22,1) 200ms forwards; }
      .hero-line-discounted { stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: hero-draw-2 1600ms cubic-bezier(0.19,1,0.22,1) 400ms forwards; }
      .hero-area { opacity: 0; animation: hero-fade 1200ms ease-out 1200ms forwards; }
      @keyframes hero-draw-1 { to { stroke-dashoffset: 0; } }
      @keyframes hero-draw-2 { to { stroke-dashoffset: 0; } }
      @keyframes hero-fade { to { opacity: 0.08; } }
    </style>
  `;

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="hero__chart-svg" preserveAspectRatio="none">
      ${anim}
      ${grid}
      ${yLabels}
      ${xLabels}
      <path class="hero-area" d="${areaDiscounted}" fill="var(--accent)" />
      <path class="hero-line-expected" d="${pathExpected}" fill="none"
        stroke="var(--data-blue)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path class="hero-line-discounted" d="${pathDiscounted}" fill="none"
        stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;

  // Count up the headline number
  const valueEl = document.getElementById('hero-pcv-value');
  if (valueEl) {
    countUp(valueEl, r.pvCr, {
      duration: 1600,
      formatter: v => v.toFixed(2),
    });
  }

  // Fill in the sub-metrics
  const subFills = {
    'hero-nominal': `₹${r.nominalCr.toFixed(1)} Cr`,
    'hero-drag':    `${(r.drag * 100).toFixed(0)}%`,
    'hero-peak':    `₹${r.peak.toFixed(0)}L`,
  };
  Object.entries(subFills).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
}

/* ── Reveal on scroll ────────────────────────────────────────────── */

function setupReveals() {
  const els = document.querySelectorAll('[data-reveal]');
  if (REDUCED) {
    els.forEach(el => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.revealDelay || '0', 10);
        setTimeout(() => entry.target.classList.add('is-in'), delay);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => io.observe(el));
}

/* ── Curtain transition into the product ─────────────────────────── */

function setupCurtain() {
  document.querySelectorAll('[data-enter]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const href = el.getAttribute('href') || 'app.html#/dashboard';
      if (REDUCED) {
        window.location.href = href;
        return;
      }
      document.body.classList.add('curtain-down');
      setTimeout(() => { window.location.href = href; }, 600);
    });
  });
}

/* ── Boot ────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // Hero must be visible immediately, no scroll reveal
  document.querySelectorAll('.hero [data-reveal]').forEach(el => el.classList.add('is-in'));
  buildHeroChart();
  setupReveals();
  setupCurtain();
});
