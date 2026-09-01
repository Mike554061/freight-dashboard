/* =============================================================================
 * FleetView — Bid Scout feed (the nightly scan, surfaced in the dashboard)
 * -----------------------------------------------------------------------------
 * The Bid Scout runs on a schedule outside the browser, sweeps the federal and
 * state sources, and drafts a digest. This module carries that run INTO the
 * dashboard so the findings live next to the pipeline instead of in an inbox.
 *
 * Two things are recorded per run, and both matter:
 *   FINDINGS      — what the scan surfaced, ranked, with the "why it fits" read
 *   SOURCE_HEALTH — what each source actually returned, including the ones that
 *                   returned NOTHING and why. A scan that quietly loses a source
 *                   looks identical to a quiet day, so the failures are shown.
 *
 * Findings below are the real 2026-08-30 run. Live re-pulls go through the
 * Apps Script proxy (browsers can't call sam.gov directly — CORS).
 * =========================================================================== */
'use strict';

const SCOUT_RUNS = [
  {
    date: '2026-08-30',
    summary: '4 new federal matches, 1 strong. No verifiable Ohio state/hospital matches.',
    findings: [
      {
        id: 'sam_ac1898a7827447889d8093c8c4776f37',
        rank: 1, source: 'samgov', sourceLabel: 'Federal · SAM',
        title: 'East Coast Export Mission 2028-2033',
        agency: 'Defense Logistics Agency — DLA Distribution',
        solicitationNumber: 'SP330026SS5007',
        naics: '493120', type: 'Sources Sought',
        postedDate: '2026-08-25', dueDate: '2026-09-03T17:00:00Z',
        pop: { city:'', state:'' }, setAside: 'None', value: null, temp: 'reefer',
        url: 'https://sam.gov/opp/ac1898a7827447889d8093c8c4776f37/view',
        fit: 'Scope is literally cross-dock, cold/freeze packaging and delivery of perishable food for export — our core refrigerated handling. Sources-sought response is cheap and gets us listed for a 2028–2033 term.',
        flag: 'strong',
      },
      {
        id: 'sam_20d99580b9954ae5ab9dfd2b8671b98a',
        rank: 2, source: 'samgov', sourceLabel: 'Federal · SAM',
        title: 'Transfusion Service — Wright-Patterson AFB',
        agency: 'USAF — Air Force Life Cycle Management Center (AFLCMC)',
        solicitationNumber: 'Transfusion_Service',
        naics: '621991', type: 'Sources Sought',
        postedDate: '2026-08-28', dueDate: '2026-09-04T16:00:00Z',
        pop: { city:'Dayton', state:'OH' }, setAside: 'None', value: null, temp: 'reefer',
        url: 'https://sam.gov/opp/20d99580b9954ae5ab9dfd2b8671b98a/view',
        fit: 'Only in-Ohio federal hit this run, and blood-product handling is medical cold chain.',
        caveat: 'Posted text is truncated — pull the attachment to confirm transport is in scope vs. a lab/blood-bank service buy.',
        flag: 'verify',
      },
      {
        id: 'sam_55bdd9af877b4db9868104ab95002b19',
        rank: 3, source: 'samgov', sourceLabel: 'Federal · SAM',
        title: 'Equipment Relocation Services — Patrick AFB',
        agency: 'USAF — Space Systems Command',
        solicitationNumber: 'FA252126QB170',
        naics: '484110', type: 'Sources Sought',
        postedDate: '2026-08-28', dueDate: '2026-09-03T14:00:00Z',
        pop: { city:'Patrick AFB', state:'FL' }, setAside: 'None', value: null, temp: 'dry',
        url: 'https://sam.gov/opp/55bdd9af877b4db9868104ab95002b19/view',
        fit: 'Core trucking NAICS, but Florida place of performance and relocation scope — only worth it with a local partner.',
        flag: 'watch',
      },
      {
        id: 'sam_18752e7a1187434c8f35b6510ee10e51',
        rank: 4, source: 'samgov', sourceLabel: 'Federal · SAM',
        title: 'R602 — Pathology and Laboratory Medicine Courier',
        agency: 'Dept. of Veterans Affairs — NCO 20 (VISN 20)',
        solicitationNumber: '36C26026Q0959',
        naics: '492110', type: 'Combined Synopsis/Solicitation',
        postedDate: '2026-08-26', dueDate: '2026-09-01T19:00:00Z',
        pop: { city:'', state:'WA' }, setAside: 'None', value: null, temp: 'reefer',
        url: 'https://sam.gov/opp/18752e7a1187434c8f35b6510ee10e51/view',
        fit: 'Exactly our medical courier lane, but VISN 20 (Pacific NW) and two days out. Value is as a template — VA NCO 10 covers Ohio/Indiana and posts the same RFQ shape.',
        flag: 'intel',
      },
    ],
    screened: [
      { title: 'WIPP Transportation Services (DOE)', why: 'Nuclear waste transport — specialized certifications we do not hold.' },
      { title: 'FCI Bastrop dairy / bread menus (BOP)', why: 'Product supply, no transport scope.' },
      { title: 'Q301 Esoteric STAT Testing, Indianapolis (VA)', why: 'Lab testing services, not transport.' },
    ],
  },
];

/* ---- What each source actually returned on the last run ---- */
const SOURCE_HEALTH = [
  { key:'sam_public', label:'SAM.gov · public search', tier:'Federal', status:'live',
    detail:'Keyless public search endpoint returned all 8 freight/cold-chain NAICS sweeps.', found:4 },
  { key:'sam_proxy', label:'SAM.gov · keyed proxy', tier:'Federal', status:'degraded',
    detail:'Returned one page, then empty for the rest of the run — free key is ~10 pulls/day. Proxy now falls back to the keyless endpoint.', found:0 },
  { key:'usaspending', label:'USASpending.gov', tier:'Context', status:'live',
    detail:'Award history for bid sizing — used by the Bid Room, no key required.', found:null },
  { key:'procure_ohio', label:'procure.ohio.gov', tier:'Ohio state', status:'down',
    detail:'Bid list URL returns HTTP 404 — path has moved. Needs a re-map.', found:0 },
  { key:'ohiobuys', label:'OhioBuys', tier:'Ohio state', status:'blocked',
    detail:'Public browse is behind a JavaScript browser check — not machine-readable. Needs a headless session or portal login.', found:0 },
  { key:'odot', label:'ODOT invitations to bid', tier:'Ohio state', status:'down',
    detail:'Published bid page returns HTTP 404.', found:0 },
  { key:'metrohealth', label:'MetroHealth supply chain', tier:'Hospital', status:'blocked',
    detail:'Posts through the Lawson supplier portal and Premier GPO calendar — both need credentials.', found:0 },
  { key:'ccf', label:'Cleveland Clinic supplier bids', tier:'Hospital', status:'unchecked',
    detail:'No public machine-readable bid list located yet.', found:null },
];

const HEALTH_COLOR = { live:'#3fb950', degraded:'#f2a541', blocked:'#c471ed', down:'#f85149', unchecked:'#6b7684' };

function latestScoutRun() { return SCOUT_RUNS[0] || null; }

/* Turn scout findings into pipeline-shaped opportunities so they sort, score
 * and stage exactly like anything else in the funnel — no parallel universe. */
function scoutFindingsAsOpps() {
  const run = latestScoutRun();
  if (!run) return [];
  return run.findings.map(f => {
    const o = Object.assign({}, f, {
      naicsLabel: (typeof NAICS !== 'undefined' && NAICS[f.naics]) || f.naics,
      scoutRun: run.date,
      description: f.fit,
      contact: { name:'', email:'', phone:'' },
    });
    if (typeof scoreOpportunity === 'function') {
      const sc = scoreOpportunity(o);
      Object.assign(o, { worthScore: sc.score, worthLabel: sc.label, worthReasons: sc.reasons });
    }
    return o;
  });
}

/* Live re-pull. Goes through the Apps Script proxy — sam.gov blocks direct
 * browser calls (CORS), and the proxy is where the keyless fallback lives. */
async function refreshScout(filters) {
  if (typeof OPPS_CONFIG === 'undefined' || OPPS_CONFIG.useMock || !OPPS_CONFIG.proxyUrl) {
    return { opps: scoutFindingsAsOpps(), live:false, note:'Last recorded scout run (' + (latestScoutRun()||{}).date + ')' };
  }
  try {
    const url = `${OPPS_CONFIG.proxyUrl}?action=opps&filters=${encodeURIComponent(JSON.stringify(filters||{}))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Proxy ' + res.status);
    const data = await res.json();
    const raw = data.opps || [];
    if (!raw.length) return { opps: scoutFindingsAsOpps(), live:false, note: data.error ? 'SAM: '+data.error : 'Live pull empty — showing last recorded run' };
    return { opps: raw, live:true, note: raw.length + ' live from SAM.gov' };
  } catch (e) {
    return { opps: scoutFindingsAsOpps(), live:false, note:'Live fetch failed — showing last recorded run' };
  }
}
