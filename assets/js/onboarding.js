/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — ONBOARDING
   First-entry intake. Shown when profile.framework.onboarded !== true.
   Collects name, profession, role, compensation, city, experience.
   ────────────────────────────────────────────────────────────────────── */

import { Store } from './store.js';
import { CLUSTERS, ROLES, rolesForCluster, rolePrior } from './tools/professional-capital-value.js';

const CITY_OPTIONS = [
  { value: 'mumbai',    label: 'Mumbai' },
  { value: 'delhi',     label: 'Delhi NCR' },
  { value: 'bangalore', label: 'Bangalore' },
  { value: 'gurgaon',   label: 'Gurgaon' },
  { value: 'hyderabad', label: 'Hyderabad' },
  { value: 'pune',      label: 'Pune' },
  { value: 'chennai',   label: 'Chennai' },
  { value: 'kolkata',   label: 'Kolkata' },
  { value: 'singapore', label: 'Singapore' },
  { value: 'dubai',     label: 'Dubai' },
  { value: 'london',    label: 'London' },
  { value: 'sf_bay',    label: 'San Francisco Bay' },
  { value: 'nyc',       label: 'New York' },
  { value: 'other',     label: 'Other' },
];

export function shouldShow() {
  return Store.profile.framework?.onboarded !== true;
}

export function show() {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding';
  overlay.innerHTML = template();
  document.body.appendChild(overlay);

  // Allow CSS transition to register
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  wireUp(overlay);
  return overlay;
}

function template() {
  const profile = Store.profile;
  return `
    <div class="onb-backdrop"></div>
    <div class="onb-card">
      <div class="onb-brand">
        <div class="onb-brand__mark"></div>
        <span class="onb-brand__name">Verastra</span>
      </div>

      <div class="onb-eyebrow">Intake · 30 Seconds</div>
      <h2 class="onb-title">A quick read before you enter.</h2>
      <p class="onb-sub">
        Verastra runs every engine against your profile by default. Six fields now so the
        dashboard, PCV, CVI, Cohort Benchmark and the rest open on your numbers — not on a stranger's.
      </p>

      <div class="onb-form">

        <div class="onb-field">
          <label class="onb-field__label">Name</label>
          <input type="text" class="onb-input" id="onb-name" placeholder="Your name" value="${profile.name || ''}" />
        </div>

        <div class="onb-field__row">
          <div class="onb-field">
            <label class="onb-field__label">Profession</label>
            <select class="onb-select" id="onb-cluster">
              ${CLUSTERS.map(c => `<option value="${c.value}" ${c.value === (profile.cluster || 'finance') ? 'selected' : ''}>${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="onb-field">
            <label class="onb-field__label">Role</label>
            <select class="onb-select" id="onb-role"></select>
          </div>
        </div>

        <div class="onb-field__row">
          <div class="onb-field">
            <label class="onb-field__label">Current annual comp · ₹ L</label>
            <input type="number" class="onb-input onb-input--comp" id="onb-comp"
              min="2" max="500" step="0.5"
              value="${profile.currentComp || ''}" placeholder="e.g. 16" />
          </div>
          <div class="onb-field">
            <label class="onb-field__label">Years of experience</label>
            <input type="number" class="onb-input onb-input--comp" id="onb-yrs"
              min="0" max="40" step="1"
              value="${profile.yearsExp ?? ''}" placeholder="e.g. 3" />
          </div>
        </div>

        <div class="onb-field">
          <label class="onb-field__label">Primary city</label>
          <select class="onb-select" id="onb-city">
            ${CITY_OPTIONS.map(c => `<option value="${c.value}" ${c.value === (profile.city || 'mumbai') ? 'selected' : ''}>${c.label}</option>`).join('')}
          </select>
        </div>

      </div>

      <div class="onb-cta-row">
        <button class="onb-skip" id="onb-skip">Skip for now</button>
        <button class="onb-submit" id="onb-submit">
          Enter Verastra
          <svg class="onb-submit__arrow" width="12" height="12" viewBox="0 0 10 10" fill="none">
            <path d="M2 5h6m0 0L5 2m3 3L5 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div class="onb-footer-note">Stored locally only · no account required · editable anytime</div>
    </div>
  `;
}

function wireUp(overlay) {
  const clusterSel = overlay.querySelector('#onb-cluster');
  const roleSel = overlay.querySelector('#onb-role');

  function fillRoles(clusterKey, selectedRole) {
    const list = rolesForCluster(clusterKey);
    roleSel.innerHTML = list.map(r =>
      `<option value="${r.value}" ${r.value === selectedRole ? 'selected' : ''}>${r.label}</option>`
    ).join('');
  }

  // Initial role population
  const initialCluster = Store.profile.cluster || 'finance';
  fillRoles(initialCluster, Store.profile.role);

  clusterSel.addEventListener('change', () => {
    fillRoles(clusterSel.value, null);
  });

  overlay.querySelector('#onb-submit').addEventListener('click', () => {
    const name = overlay.querySelector('#onb-name').value.trim() || 'Professional';
    const cluster = clusterSel.value;
    const role = roleSel.value;
    const currentComp = parseFloat(overlay.querySelector('#onb-comp').value) || rolePrior(cluster, role).median;
    const yearsExp = parseInt(overlay.querySelector('#onb-yrs').value, 10);
    const city = overlay.querySelector('#onb-city').value;

    const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'YOU';
    const roleLabel = rolePrior(cluster, role).label.replace(/\s*\([^)]*\)\s*$/, '');

    Store.updateProfile({
      name, initials, cluster, role, roleLabel,
      currentComp, city,
      yearsExp: isFinite(yearsExp) ? yearsExp : 0,
      framework: { onboarded: true },
    });

    // Update sidebar identity immediately
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarRole = document.getElementById('sidebar-role');
    if (sidebarAvatar) sidebarAvatar.textContent = initials;
    if (sidebarName) sidebarName.textContent = name;
    if (sidebarRole) sidebarRole.textContent = roleLabel;

    dismiss(overlay, true);
  });

  overlay.querySelector('#onb-skip').addEventListener('click', () => {
    // Mark onboarded with whatever seeded profile is present, so we don't re-prompt
    Store.updateProfile({ framework: { onboarded: true } });
    dismiss(overlay, false);
  });
}

function dismiss(overlay, refreshDashboard) {
  overlay.classList.remove('is-open');
  setTimeout(() => {
    overlay.remove();
    if (refreshDashboard) {
      // Trigger a re-render of the current view if on dashboard
      if (window.location.hash === '' || window.location.hash.startsWith('#/dashboard')) {
        window.location.hash = '#/dashboard';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }
  }, 280);
}
