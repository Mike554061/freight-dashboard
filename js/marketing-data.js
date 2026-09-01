/* =============================================================================
 * FleetView — Marketing layer (collateral, plays, campaigns, attribution)
 * -----------------------------------------------------------------------------
 * Marketing here is not a vanity dashboard. It is the demand side of the same
 * pipeline: assets we can send, plays we can run, and campaigns that get
 * ATTRIBUTED to real pursuit records so "what did marketing do" is answered by
 * the funnel itself.
 *
 * Deliberately ships with ZERO invented performance numbers. Campaigns are
 * created by the user and stored locally; every metric on the marketing page is
 * computed from actual pipeline records tagged to that campaign. An empty board
 * means nothing has run yet — which is information, not a gap to fill with
 * plausible-looking figures.
 * =========================================================================== */
'use strict';

const CAMPAIGN_KEY = 'fleetview_campaigns';

/* Company facts used to generate outbound copy — the real registration
 * details buyers screen on. */
const SN_IDENTITY = {
  legal: 'Supply Now Inc.',
  brand: 'SupplyNow',
  mc: 'MC 1660872',
  dot: 'DOT 3976910',
  hq: '2800 Euclid Ave, Cleveland, OH',
  phone: '216-548-7070',
  email: 'mike@supplynow.org',
  capabilities: [
    'Refrigerated (reefer) and dry van freight — asset-based',
    'Cold-chain last-mile: food service, school nutrition, medical/pharma courier',
    'Multi-stop route delivery with POD capture and live driver tracking',
    'Regional coverage: Ohio + PA / MI / IN / KY / WV / NY',
  ],
  naics: ['484110','484121','484122','484220','484230','492110','493120'],
  differentiators: [
    'Own trucks and own drivers — no brokered handoff on the cold leg',
    'Route-level cost model, so pricing holds up under a bid protest',
    'Small business — eligible for total small-business set-asides',
  ],
};

/* Collateral that actually exists in this repo or is a known live asset. */
const COLLATERAL = [
  { key:'onepager',  name:'Carrier One-Pager',      type:'PDF-ready page', href:'carrier-onepager.html',
    use:'Leave-behind for a first shipper conversation.', status:'ready' },
  { key:'packet',    name:'Carrier Packet',         type:'PDF-ready page', href:'carrier-packet.html',
    use:'Sent when a broker or shipper asks to set us up.', status:'ready' },
  { key:'signature', name:'Email Signature',        type:'HTML snippet',   href:'email-signature.html',
    use:'Brand consistency on every outbound email.', status:'ready' },
  { key:'onboarding',name:'Onboarding Flow',        type:'Interactive',    href:'onboarding.html',
    use:'What a new account sees after they say yes.', status:'ready' },
  { key:'capstmt',   name:'Capability Statement',   type:'Generated',      href:'',
    use:'Required leave-behind for federal buyers and sources-sought replies.', status:'generate' },
];

/* Plays = repeatable marketing motions tied to a pipeline stage. These are
 * the motion definitions, not results. */
const PLAYS = [
  { key:'sources_sought', name:'Sources-sought reply', stage:'Scoping', channel:'Federal',
    trigger:'Bid Scout surfaces a Sources Sought / Presolicitation in a fit NAICS',
    asset:'capstmt',
    why:'Cheapest way onto a buyer\'s radar — shapes the eventual solicitation and costs one email.' },
  { key:'va_nco10', name:'VA NCO 10 courier watch', stage:'New', channel:'Federal',
    trigger:'Any VA medical-courier RFQ posts in VISN 10 (Ohio / Indiana)',
    asset:'capstmt',
    why:'VA reposts the same courier RFQ shape by region. NCO 20 postings are the template for our home network.' },
  { key:'hospital_direct', name:'Hospital supply-chain intro', stage:'New', channel:'Direct',
    trigger:'Ohio hospital system with no public bid feed (MetroHealth, Cleveland Clinic, UH)',
    asset:'onepager',
    why:'These buy courier and cold-chain outside public portals — the only way in is direct outreach to supply chain.' },
  { key:'shipper_direct', name:'Direct shipper outreach', stage:'New', channel:'Direct',
    trigger:'Regional food, beverage or pharma shipper self-distributing on owned trucks',
    asset:'packet',
    why:'Highest-margin work in the book and no bid cycle. The wedge is their owned-fleet cost per routed mile.' },
  { key:'reengage', name:'Lost-bid re-engagement', stage:'Passed', channel:'Federal',
    trigger:'A pursuit is marked Passed or the incumbent award posts',
    asset:'capstmt',
    why:'Federal contracts recompete on a clock. A pass today is a dated callback, not a dead end.' },
];

/* ---- Campaign store (user-created, local) ---- */
function loadCampaigns() { try { return JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || '[]'); } catch { return []; } }
function saveCampaigns(c) { localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(c)); }
function addCampaign(c) {
  const all = loadCampaigns();
  all.unshift(Object.assign({ id: 'cmp_' + Date.now(), created: Date.now(), touches: 0 }, c));
  saveCampaigns(all);
  if (typeof Pipeline !== 'undefined') Pipeline.log({ id:'campaign', title:c.name, kind:'campaign', text:'Campaign created' });
  return all;
}
function removeCampaign(id) {
  saveCampaigns(loadCampaigns().filter(c => c.id !== id));
}
function bumpTouches(id, n) {
  const all = loadCampaigns();
  const c = all.find(x => x.id === id);
  if (!c) return all;
  c.touches = Math.max(0, (c.touches || 0) + n);
  saveCampaigns(all);
  return all;
}

/* ---- Attribution: computed from the pipeline, never stored twice ---- */
function campaignAttribution(campaignId, opps) {
  const tagged = opps.filter(o => o.campaign === campaignId);
  const won = tagged.filter(o => o.status === 'Won');
  const open = tagged.filter(o => typeof Pipeline !== 'undefined' ? Pipeline.isOpen(o) : true);
  const value = open.reduce((s,o) => s + (o.effValue || o.value || 0), 0);
  return { touched: tagged.length, open: open.length, won: won.length, openValue: value, items: tagged };
}

/* ---- Capability statement, generated from the real identity block ---- */
function capabilityStatementText() {
  const I = SN_IDENTITY;
  return [
    `${I.legal} (dba ${I.brand}) — Capability Statement`,
    `${I.hq} · ${I.phone} · ${I.email}`,
    `${I.mc} · ${I.dot}`,
    '',
    'CORE COMPETENCIES',
    ...I.capabilities.map(c => '  • ' + c),
    '',
    'DIFFERENTIATORS',
    ...I.differentiators.map(c => '  • ' + c),
    '',
    'NAICS CODES',
    '  ' + I.naics.join(', '),
    '',
    'BUSINESS TYPE',
    '  Small business. Asset-based motor carrier, active SAM registration.',
  ].join('\n');
}
