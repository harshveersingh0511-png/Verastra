/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — ROUTER
   Hash-based router. Resolves #/<surface>[/<param>] to a view module.
   ────────────────────────────────────────────────────────────────────── */

import { Store } from './store.js';
import * as Dashboard   from './views/dashboard.js';
import * as Tools       from './views/tools.js';
import * as Methodology from './views/methodology.js';
import * as Terminal    from './views/terminal.js';
import * as ToolPage    from './views/tool-page.js';

const ROUTES = {
  '':            { view: Dashboard,   surface: 'dashboard',   title: 'Dashboard' },
  'dashboard':   { view: Dashboard,   surface: 'dashboard',   title: 'Dashboard' },
  'tools':       { view: Tools,       surface: 'tools',       title: 'Tools' },
  'methodology': { view: Methodology, surface: 'methodology', title: 'Methodology' },
  'terminal':    { view: Terminal,    surface: 'terminal',    title: 'Terminal' },
};

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  return {
    head: parts[0] || '',
    rest: parts.slice(1),
  };
}

function setActiveNav(surface) {
  document.querySelectorAll('.sidebar__item').forEach(el => {
    el.classList.toggle('is-active', el.dataset.surface === surface);
  });
}

function setBreadcrumb(crumbs) {
  const el = document.getElementById('topbar-crumb');
  if (!el) return;
  el.innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    const cls = isLast ? 'topbar__crumb-current' : '';
    return `${i > 0 ? '<span class="topbar__crumb-sep">/</span>' : ''}<span class="${cls}">${c}</span>`;
  }).join('');
}

async function render() {
  const { head, rest } = parseHash();
  const container = document.getElementById('view');
  if (!container) return;

  // Tool deep route: #/tools/<slug>
  if (head === 'tools' && rest.length > 0) {
    setActiveNav('tools');
    container.innerHTML = '';
    container.className = 'view';
    void container.offsetWidth; // restart animation
    await ToolPage.render(container, { slug: rest[0], store: Store });
    setBreadcrumb(['Tools', humanize(rest[0])]);
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

  const route = ROUTES[head];
  if (!route) {
    // Unknown route → dashboard
    window.location.hash = '#/dashboard';
    return;
  }

  setActiveNav(route.surface);
  container.innerHTML = '';
  container.className = route.surface === 'terminal' ? 'view view--terminal' : 'view';
  void container.offsetWidth; // restart animation
  await route.view.render(container, { store: Store });
  setBreadcrumb([route.title]);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function humanize(slug) {
  return slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function initRouter() {
  window.addEventListener('hashchange', render);
  if (!window.location.hash) {
    window.location.hash = '#/dashboard';
  } else {
    render();
  }
}

export function navigate(path) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}
