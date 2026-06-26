/* ──────────────────────────────────────────────────────────────────────
   Adapter registry — V1 live + light implementations.

   v1_status here is authoritative at runtime. Future-slot adapters are
   not imported; the orchestrator excludes them via getActiveAdapters().
   ────────────────────────────────────────────────────────────────────── */

import { stubAdapter } from './_base.js';

// Live (broad)
import naukri from './naukri.js';
import indeed_in from './indeed_in.js';
import foundit from './foundit.js';

// Live (specialist)
import iimjobs from './iimjobs.js';
import wellfound_in from './wellfound_in.js';
import employer_careers from './employer-careers/employer-careers.js';

// Light (specialist)
import cutshort from './cutshort.js';
import psu_official_portals from './psu_official_portals.js';

// Future slots — typed stubs (never invoked by getActiveAdapters)
const linkedin         = stubAdapter({ id: 'linkedin',         kind: 'broad',          v1_status: 'future_slot' });
const hirist           = stubAdapter({ id: 'hirist',           kind: 'specialist',     v1_status: 'future_slot' });
const shine            = stubAdapter({ id: 'shine',            kind: 'broad',          v1_status: 'future_slot' });
const behance_dribbble = stubAdapter({ id: 'behance_dribbble', kind: 'specialist',     v1_status: 'future_slot' });
const remoteok         = stubAdapter({ id: 'remoteok',         kind: 'weak_auxiliary', v1_status: 'future_slot' });

export {
  naukri, indeed_in, foundit,
  iimjobs, wellfound_in, employer_careers,
  cutshort, psu_official_portals,
  linkedin, hirist, shine, behance_dribbble, remoteok,
};

export function getAllAdapters() {
  return [
    naukri, indeed_in, foundit,
    iimjobs, wellfound_in, employer_careers,
    cutshort, psu_official_portals,
    linkedin, hirist, shine, behance_dribbble, remoteok,
  ];
}

export function getActiveAdapters() {
  return getAllAdapters().filter(a => a.v1_status === 'live' || a.v1_status === 'light');
}
