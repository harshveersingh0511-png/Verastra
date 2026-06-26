/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — DASHBOARD PREMIUM
   Additive motion layer for the app shell. Bridges visual language to the
   landing page (brass particles, cursor halo, scroll progress) and adds
   targeted dashboard enhancements (curve draw, pip cascade, magnetic
   queue rows, rail tile cursor glow, decomp bars).

   Architecture:
     1. Mark body with .is-premium IMMEDIATELY so CSS overrides activate
        even if Three.js fails to load.
     2. Inject chrome (canvas, vignette, scroll progress, cursor glow).
     3. Try Three.js via dynamic import; on failure, fall back to CSS-only
        particle drift (body.no-webgl).
     4. Run all DOM enhancements regardless of WebGL state.
     5. Re-run on every router view replacement.
   ────────────────────────────────────────────────────────────────────── */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Mark body immediately so CSS rules activate even before DOM ready. */
function markPremium() {
  if (!document.body) return;
  document.body.classList.add('is-premium');
}
if (document.body) markPremium();
else document.addEventListener('DOMContentLoaded', markPremium, { once: true });

/* ════════════════════════════════════════════════════════════
   1 · GLOBAL CHROME
   ════════════════════════════════════════════════════════════ */

function ensureChrome() {
  if (document.getElementById('dash-bg-canvas')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'dash-bg-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const vignette = document.createElement('div');
  vignette.className = 'dash-vignette';
  vignette.setAttribute('aria-hidden', 'true');
  document.body.prepend(vignette);

  const glow = document.createElement('div');
  glow.className = 'dash-cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);

  const progress = document.createElement('div');
  progress.className = 'dash-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);
}

/* ── WebGL ambient particle field (dynamic import for resilience) ──── */
async function initWebGL() {
  if (reduceMotion) return;
  let THREE;
  try {
    THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
  } catch (e) {
    console.warn('[verastra] Three.js load failed; falling back to CSS particles.', e);
    document.body.classList.add('no-webgl');
    return;
  }

  const canvas = document.getElementById('dash-bg-canvas');
  if (!canvas) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    console.warn('[verastra] WebGL unavailable; falling back to CSS particles.', e);
    document.body.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const isLight = document.body.classList.contains('theme-light');

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(isLight ? 0xf5f1e8 : 0x07090c, 0.07);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9);

  const N = 1600;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);

  const accent   = new THREE.Color(isLight ? 0x7a3e1e : 0xc9a961);
  const accentHi = new THREE.Color(isLight ? 0x9a4f26 : 0xe4c47a);
  const blue     = new THREE.Color(isLight ? 0x1b3d5f : 0x6ea8d8);
  const teal     = new THREE.Color(isLight ? 0x1f5c4a : 0x5ec5b8);

  for (let i = 0; i < N; i++) {
    const r = 8 + Math.random() * 18;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta) * 0.5;
    positions[i*3+2] = r * Math.cos(phi) - 6;

    const t = Math.random();
    const c = t < 0.6 ? accent : t < 0.82 ? accentHi : t < 0.95 ? blue : teal;
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    sizes[i] = 0.018 + Math.random() * 0.045;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: isLight ? THREE.MultiplyBlending : THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: isLight ? 0.5 : 0.9 } },
    vertexShader: `
      attribute float aSize;
      varying vec3 vColor;
      uniform float uTime;
      void main() {
        vColor = color;
        vec3 p = position;
        p.y += sin(uTime * 0.3 + position.x * 0.4) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (280.0 / -mv.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float uAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * uAlpha);
      }
    `,
    vertexColors: true
  });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);

  /* Soft drifting glow plane far behind */
  const planeGeo = new THREE.PlaneGeometry(28, 28);
  const planeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLight: { value: isLight ? 1.0 : 0.0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uLight;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        vec3 dark  = mix(vec3(0.79,0.66,0.38), vec3(0.43,0.66,0.85), sin(uTime*0.2)*0.5+0.5);
        vec3 light = mix(vec3(0.48,0.24,0.12), vec3(0.11,0.24,0.37), sin(uTime*0.2)*0.5+0.5);
        vec3 col = mix(dark, light, uLight);
        float a = smoothstep(0.55, 0.0, r) * mix(0.18, 0.10, uLight);
        gl_FragColor = vec4(col, a);
      }
    `
  });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.position.z = -10;
  scene.add(plane);

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollY = 0;
  window.addEventListener('mousemove', e => {
    mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });
  const updateScroll = () => {
    const v = document.querySelector('.view');
    scrollY = (v && v.scrollTop) || window.scrollY;
  };
  window.addEventListener('scroll', updateScroll, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    mat.uniforms.uTime.value = t;
    planeMat.uniforms.uTime.value = t;
    updateScroll();

    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;

    stars.rotation.y = t * 0.012 + mouse.x * 0.12;
    stars.rotation.x = mouse.y * 0.06 + scrollY * 0.0003;

    camera.position.x = mouse.x * 0.3;
    camera.position.y = -mouse.y * 0.2;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
  console.log('[verastra] WebGL backdrop online.');
}

/* ── Cursor glow follower ─────────────────────────────────── */
function initCursorGlow() {
  if (reduceMotion) return;
  const glow = document.querySelector('.dash-cursor-glow');
  if (!glow) return;
  let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  let tx = cx, ty = cy;
  let shown = false;

  window.addEventListener('mousemove', e => {
    tx = e.clientX; ty = e.clientY;
    if (!shown) { glow.style.opacity = '1'; shown = true; }
  });
  window.addEventListener('mouseleave', () => { glow.style.opacity = '0'; shown = false; });

  function follow() {
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    glow.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(follow);
  }
  follow();
}

/* ── Scroll progress (listens to .view + window) ─────────── */
function initScrollProgress() {
  const bar = document.querySelector('.dash-scroll-progress');
  if (!bar) return;

  function updateFromView(target) {
    const max = Math.max(1, target.scrollHeight - target.clientHeight);
    bar.style.transform = `scaleX(${Math.min(1, target.scrollTop / max)})`;
  }

  function bindView() {
    const v = document.querySelector('.view');
    if (v && !v.dataset.progressBound) {
      v.dataset.progressBound = '1';
      v.addEventListener('scroll', () => updateFromView(v), { passive: true });
      updateFromView(v);
    }
  }
  bindView();

  if (!window.__dashWinProgressBound) {
    window.__dashWinProgressBound = true;
    window.addEventListener('scroll', () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      bar.style.transform = `scaleX(${Math.min(1, window.scrollY / max)})`;
    }, { passive: true });
  }
}

/* ════════════════════════════════════════════════════════════
   2 · DASHBOARD-SPECIFIC ENHANCEMENTS
   ════════════════════════════════════════════════════════════ */

function enhanceDashboard(root) {
  if (reduceMotion) return;

  /* A · Salary curve draw-in */
  const userPath = root.querySelector('.dash-capital__chart-user');
  const benchPath = root.querySelector('.dash-capital__chart-bench');
  [userPath, benchPath].forEach((p, idx) => {
    if (!p) return;
    try {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      void p.getBoundingClientRect();
      setTimeout(() => {
        p.style.transition = `stroke-dashoffset ${2200 + idx * 200}ms cubic-bezier(0.19, 1, 0.22, 1)`;
        p.style.strokeDashoffset = '0';
      }, 240 + idx * 180);
    } catch (e) { /* getTotalLength unsupported */ }
  });

  /* B · Risk pip cascade */
  const riskCells = root.querySelectorAll('.dash-risk__cell');
  const riskIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const pips = en.target.querySelectorAll('.dash-risk__pip');
      pips.forEach((pip, i) => pip.style.setProperty('--pip-i', i));
      en.target.classList.add('is-revealed');
      riskIO.unobserve(en.target);
    });
  }, { threshold: 0.35 });
  riskCells.forEach(c => riskIO.observe(c));

  /* C · Stagger groups */
  const groupSelectors = [
    '.dash-rail--state',
    '.dash-snapshot__split',
    '.dash-capital__decomp-row',
    '.dash-risk__grid',
    '.dash-queue__rows',
    '.dash-stack__rows',
  ];
  const groups = groupSelectors.map(s => root.querySelector(s)).filter(Boolean);
  groups.forEach(group => {
    group.classList.add('dash-stagger');
    Array.from(group.children).forEach((ch, i) => ch.style.setProperty('--i', i));
  });
  const groupIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      groupIO.unobserve(en.target);
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
  groups.forEach(g => groupIO.observe(g));

  /* D · Rail tile + risk cell cursor-follow glow */
  root.querySelectorAll('.dash-rail__tile, .dash-risk__cell').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top)  + 'px');
    });
  });

  /* E · Magnetic queue rows */
  root.querySelectorAll('.dash-queue__row').forEach(row => {
    let raf;
    row.addEventListener('mousemove', e => {
      const r = row.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.04;
      const y = (e.clientY - r.top - r.height / 2) * 0.10;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        row.style.setProperty('transform', `translate(${x}px, ${y}px)`);
      });
    });
    row.addEventListener('mouseleave', () => row.style.removeProperty('transform'));
  });

  /* F · Sidebar active route */
  syncSidebarActive();

  console.log('[verastra] Dashboard premium enhancements applied.');
}

function syncSidebarActive() {
  const hash = location.hash || '#/dashboard';
  document.querySelectorAll('.sidebar__item').forEach(item => {
    const href = item.getAttribute('href');
    if (!href) return;
    item.classList.toggle('is-active', hash.startsWith(href));
  });
}

/* ════════════════════════════════════════════════════════════
   2b · TOOLS / METHODOLOGY / TERMINAL ENHANCEMENTS
   ════════════════════════════════════════════════════════════ */

function staggerGroup(group) {
  if (!group) return;
  group.classList.add('dash-stagger');
  Array.from(group.children).forEach((ch, i) => ch.style.setProperty('--i', i));
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
  io.observe(group);
}

function attachCursorGlow(els) {
  els.forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top)  + 'px');
    });
  });
}

function attachMagnetic(els, strength = 0.06) {
  els.forEach(el => {
    let raf;
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * strength;
      const y = (e.clientY - r.top - r.height / 2) * (strength * 1.5);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('transform', `translate(${x}px, ${y}px)`);
      });
    });
    el.addEventListener('mouseleave', () => el.style.removeProperty('transform'));
  });
}

function enhanceTools(root) {
  if (reduceMotion) return;
  staggerGroup(root.querySelector('.decision-entry__grid'));
  attachCursorGlow(root.querySelectorAll('.decision-puck'));
  attachMagnetic(root.querySelectorAll('.decision-puck'), 0.04);
  console.log('[verastra] Tools enhancements applied.');
}

function enhanceMethodology(root) {
  if (reduceMotion) return;
  /* TOC stays as-is — sticky sidebars don't need entrance animation. */
  root.querySelectorAll('.meth-engines').forEach(g => staggerGroup(g));
  /* Framework section divider draw-in */
  const fwIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in-view');
        fwIO.unobserve(en.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  root.querySelectorAll('.meth-framework').forEach(f => fwIO.observe(f));
  console.log('[verastra] Methodology enhancements applied.');
}

function enhanceTerminal(root) {
  if (reduceMotion) return;
  staggerGroup(root.querySelector('.terminal-samples__list'));
  staggerGroup(root.querySelector('.terminal-meta__list'));
  /* Stagger memo sections on render */
  const memo = root.querySelector('.memo');
  if (memo) {
    const sections = memo.querySelectorAll('.memo-section');
    sections.forEach((s, i) => {
      s.style.opacity = '0';
      s.style.transform = 'translateY(14px)';
      s.style.transition = `opacity 700ms cubic-bezier(0.19, 1, 0.22, 1), transform 700ms cubic-bezier(0.19, 1, 0.22, 1)`;
      s.style.transitionDelay = `${i * 110 + 200}ms`;
      requestAnimationFrame(() => {
        s.style.opacity = '1';
        s.style.transform = 'translateY(0)';
      });
    });
  }
  /* Watch terminal-memo for memo replacements */
  const memoEl = root.querySelector('#terminal-memo');
  if (memoEl && !memoEl.dataset.premiumBound) {
    memoEl.dataset.premiumBound = '1';
    const mo = new MutationObserver(() => {
      const m = memoEl.querySelector('.memo');
      if (m && !m.dataset.staggered) {
        m.dataset.staggered = '1';
        m.querySelectorAll('.memo-section').forEach((s, i) => {
          s.style.opacity = '0';
          s.style.transform = 'translateY(14px)';
          s.style.transition = `opacity 700ms cubic-bezier(0.19, 1, 0.22, 1), transform 700ms cubic-bezier(0.19, 1, 0.22, 1)`;
          s.style.transitionDelay = `${i * 110 + 200}ms`;
          requestAnimationFrame(() => {
            s.style.opacity = '1';
            s.style.transform = 'translateY(0)';
          });
        });
      }
    });
    mo.observe(memoEl, { childList: true, subtree: true });
  }
  console.log('[verastra] Terminal enhancements applied.');
}

/* ════════════════════════════════════════════════════════════
   3 · BOOT
   ════════════════════════════════════════════════════════════ */

function boot() {
  markPremium();
  ensureChrome();
  initWebGL();           // async, may fail gracefully
  initCursorGlow();
  initScrollProgress();
  syncSidebarActive();

  const view = document.getElementById('view');
  if (!view) {
    console.warn('[verastra] No #view found; dashboard enhancer skipped.');
    return;
  }

  const tryEnhance = () => {
    const dash = view.querySelector('.dash');
    if (dash && !dash.dataset.premiumEnhanced) {
      dash.dataset.premiumEnhanced = '1';
      requestAnimationFrame(() => enhanceDashboard(dash));
    }
    const tools = view.querySelector('.tools');
    if (tools && !tools.dataset.premiumEnhanced) {
      tools.dataset.premiumEnhanced = '1';
      requestAnimationFrame(() => enhanceTools(tools));
    }
    const meth = view.querySelector('.meth');
    if (meth && !meth.dataset.premiumEnhanced) {
      meth.dataset.premiumEnhanced = '1';
      requestAnimationFrame(() => enhanceMethodology(meth));
    }
    const term = view.querySelector('.terminal-page');
    if (term && !term.dataset.premiumEnhanced) {
      term.dataset.premiumEnhanced = '1';
      requestAnimationFrame(() => enhanceTerminal(term));
    }
    initScrollProgress();
  };

  tryEnhance();

  const mo = new MutationObserver(() => tryEnhance());
  mo.observe(view, { childList: true, subtree: false });

  window.addEventListener('hashchange', () => {
    syncSidebarActive();
    setTimeout(tryEnhance, 80);
  });

  console.log('[verastra] Dashboard premium overlay booted.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
