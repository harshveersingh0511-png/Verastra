/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — STORE
   Profile + scenario state. localStorage-backed for Phase 1.
   Firestore sync hook deferred to a later phase.
   ────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'verastra:store:v1';

const DEFAULT_PROFILE = {
  name: 'Harshveer Singh',
  initials: 'HS',
  role: 'tp', // role key inside the cluster's role list
  cluster: 'finance',
  roleLabel: 'Transfer Pricing Associate',
  city: 'mumbai',
  yearsExp: 3,
  currentComp: 14, // ₹ Lakhs annual total
  skills: ['Transfer Pricing', 'Form 3CEB', 'ALP Benchmarking'],
  framework: { onboarded: false },
};

const DEFAULT_SCENARIOS = {};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profile: { ...DEFAULT_PROFILE }, scenarios: { ...DEFAULT_SCENARIOS } };
    const parsed = JSON.parse(raw);
    return {
      profile: { ...DEFAULT_PROFILE, ...(parsed.profile || {}) },
      scenarios: { ...DEFAULT_SCENARIOS, ...(parsed.scenarios || {}) },
    };
  } catch {
    return { profile: { ...DEFAULT_PROFILE }, scenarios: { ...DEFAULT_SCENARIOS } };
  }
}

function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('Verastra store: persist failed', e); }
}

const state = load();
const listeners = new Set();

function notify() { listeners.forEach(fn => fn(state)); }

export const Store = {
  get profile() { return state.profile; },
  get scenarios() { return state.scenarios; },

  updateProfile(patch) {
    Object.assign(state.profile, patch);
    persist(state);
    notify();
  },

  saveScenario(toolSlug, scenario) {
    state.scenarios[toolSlug] = scenario;
    persist(state);
    notify();
  },

  getScenario(toolSlug) { return state.scenarios[toolSlug]; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  reset() {
    Object.assign(state.profile, DEFAULT_PROFILE);
    state.scenarios = { ...DEFAULT_SCENARIOS };
    persist(state);
    notify();
  },
};
