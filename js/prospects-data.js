/* =============================================================================
 * FleetView — Shipper Prospecting: intelligence + outreach engine
 * -----------------------------------------------------------------------------
 * Direct shippers = top of the value ladder. Seeded with REAL researched
 * NE-Ohio shippers in SupplyNow's lanes. Two thick layers:
 *   INTELLIGENCE — own-fleet read, entry angle, likely lanes, triggers, pain
 *                  points, deal size, and a 4-part fit sub-score breakdown.
 *   OUTREACH     — 3 angle variants + a 5-touch cadence (email/call/voicemail/
 *                  LinkedIn/breakup) + objection handling, all personalized.
 * Contact enrichment (direct email/phone) fills from Apollo/ZoomInfo once
 * authorized in claude.ai connector settings.
 * =========================================================================== */

const P_HOME = { city:'Cleveland', region:['Bedford Heights','Bedford','Tallmadge','Akron','Solon','Twinsburg','Macedonia','Independence','Valley View','Lorain','Elyria','Mentor','Strongsville'] };
const PROSPECT_CONFIG = { useMock:true, proxyUrl:'' };

const SN = { name:'Supply Now Inc.', mc:'MC 1660872', dot:'DOT 3976910', phone:'216-548-7070', email:'dispatch@supplynow.org', rep:'Mike Cook' };
const SIG = `${SN.rep}\nSupplyNow — Asset-Based Reefer & Dry Carrier\n${SN.phone} · ${SN.email}\n${SN.mc} · ${SN.dot}`;
const TYPE_LABEL = { manufacturer:'Manufacturer', coldstorage:'Cold Storage', '3pl':'3PL', distributor:'Distributor', brewery:'Brewery' };

/* ---------- Fit scoring with a 4-part breakdown ---------- */
function scoreProspect(p) {
  const commodity = (p.category === 'reefer' || p.category === 'both') ? 90 : 60;
  const need = ({ manufacturer:90, coldstorage:85, brewery:80, '3pl':70, distributor:55 })[p.type] || 60;
  const proximity = p.city === P_HOME.city ? 100 : (P_HOME.region.indexOf(p.city) > -1 ? 80 : 40);
  let winnability = p.warm ? 95 : ({ manufacturer:78, coldstorage:76, brewery:72, '3pl':66, distributor:56 })[p.type] || 60;
  const subScores = { commodity, need, proximity, winnability };
  const fitScore = Math.round(0.30*commodity + 0.30*need + 0.20*proximity + 0.20*winnability);
  const fitLabel = fitScore >= 78 ? 'Hot' : fitScore >= 64 ? 'Warm' : fitScore >= 50 ? 'Worth a look' : 'Long shot';
  const fitReasons = [];
  fitReasons.push(commodity >= 90 ? 'Reefer / cold-chain — your core' : 'Dry freight — in scope');
  fitReasons.push(({manufacturer:'Manufacturer — carrier-dependent for outbound',coldstorage:'Cold-storage — drayage in + distribution out','3pl':'3PL — overflow & dedicated lanes',distributor:'Distributor — overflow + backhaul (runs own fleet)',brewery:'Brewery — self-distributes locally'})[p.type]);
  fitReasons.push(proximity === 100 ? 'In Cleveland' : proximity === 80 ? 'NE Ohio metro' : p.city+', '+p.state);
  if (p.warm) fitReasons.push('Existing relationship — warm intro');
  return { fitScore, fitLabel, fitReasons, subScores };
}

/* ---------- Intelligence: derive + per-company overrides ---------- */
function lanesFrom(city, category) {
  const hubs = ['Detroit, MI','Columbus, OH','Pittsburgh, PA','Chicago, IL','Buffalo, NY','Cincinnati, OH'];
  return hubs.slice(0,4).map(h => `${city} → ${h}`);
}
function deriveIntel(p) {
  const ownFleet = ({ distributor:'Yes — route fleet', brewery:'Partial — local', beverage:'Yes',
                      manufacturer:'No / limited', coldstorage:'No — uses carriers', '3pl':'Asset-based (own + brokered)' })[p.type] || 'Unknown';
  const approach = ({ manufacturer:'Dedicated outbound lanes (they need carriers)',
                      coldstorage:'Drayage in + outbound distribution to retail DCs',
                      distributor:'Overflow / peak capacity → earn dedicated lanes',
                      '3pl':'Overflow when their assets are tight + dedicated',
                      brewery:'Dedicated local + regional distribution (the wedge)' })[p.type] || 'Overflow → dedicated';
  const dealPotential = ({ manufacturer:'High ($$$)', coldstorage:'High ($$$)', '3pl':'Med–High ($$)', distributor:'Med–High ($$)', brewery:'Med ($$)' })[p.type] || 'Med ($$)';
  const triggers = ({ manufacturer:['High outbound frequency','DC/retail expansion'],
                      coldstorage:['Filling to capacity — more outbound','Retail DC delivery windows'],
                      distributor:['Peak-season/holiday overflow','Driver shortage on their fleet'],
                      '3pl':['Client wins exceed their fleet','Seasonal surges'],
                      brewery:['Self-distribution = direct carrier need','Seasonal/event spikes'] })[p.type] || ['Capacity gaps at peak'];
  const painPoints = ({ manufacturer:['Reliable outbound capacity','On-time to retail appointments'],
                        coldstorage:['Temp-integrity in transit','Appointment adherence'],
                        distributor:['Weekend/holiday coverage','Cost creep from brokers'],
                        '3pl':['Overflow without margin loss','Reefer-qualified carriers'],
                        brewery:['Local delivery reliability','Small-drop economics'] })[p.type] || ['Capacity + reliability'];
  return { ownFleet, approach, dealPotential, decisionMaker:'Transportation / Logistics Mgr (Ops Director at smaller shops)',
           triggers, painPoints, likelyLanes: lanesFrom(p.city, p.category) };
}
const INTEL_OVERRIDES = {
  'National Freezer': { approach:'Expand from US Foods lane → ask for intros to their other tenants; dedicated tenant lanes', triggers:['You already deliver here','1.5M+ cu ft of tenants who need outbound carriers'], likelyLanes:['Cleveland → Detroit (US Foods)','Cleveland → tenant retail DCs'] },
  'Nor-Am Cold Storage': { triggers:['$50M hub, ~half full and filling','Tenants incl. Meijer, Orlando Baking, Arlington Valley Farms'], likelyLanes:['Cleveland → Meijer DCs (MI)','Rail/port drayage → E 75th','Cleveland → regional retail'] },
  'Orlando Baking Company': { ownFleet:'Yes — DSD bakery routes', approach:'Dedicated long-haul/DC lanes beyond their local DSD routes', likelyLanes:['Cleveland → Midwest grocery DCs','Cleveland → Columbus/Cincinnati'] },
  'Great Lakes Brewing Co.': { approach:'Dedicated local/regional distribution — same play as the Sibling Revelry prospect', likelyLanes:['Cleveland → NE Ohio accounts','Cleveland → Columbus/Pittsburgh'] },
  'Arlington Valley Farms': { ownFleet:'No', triggers:['Frozen manufacturer inside Nor-Am','Needs outbound frozen carriers'], likelyLanes:['Cleveland → national retail/foodservice (frozen)'] },
  'Sysco Cleveland': { approach:'Overflow + redistribution/shuttle lanes (they flex to carriers at peak)', likelyLanes:['Cleveland RDC → regional','Redistribution shuttles'] },
  'Northern Haserot': { likelyLanes:['Bedford Heights → NE Ohio restaurants','Inbound center-of-plate → their DC'] },
};

/* ---------- Apollo-sourced live leads (Greater Cleveland medical + cold-chain) ---------- */
const APOLLO_LEADS = [
  { company:'Euro USA', type:'distributor', category:'reefer', city:'Cleveland', state:'OH',
    about:'Specialty + frozen/refrigerated food importer-distributor (~$67M rev). Reefer volume across the Midwest.',
    signals:['~$67M revenue','Frozen/refrigerated import distro','Steady headcount growth'], url:'http://www.euro-usa.com',
    contact:{ name:'', title:'Logistics / Operations Manager', email:'', phone:'800-999-5939', linkedin:'' } },
  { company:'Blue Ribbon Meats', type:'manufacturer', category:'reefer', city:'Cleveland', state:'OH',
    about:'Meat processor & distributor since 1948; +42% headcount over 24mo — scaling outbound.',
    signals:['Meat processor → reefer outbound','+42% headcount 24mo (scaling)','Est. 1948'], url:'http://www.blueribbonmeats.com',
    contact:{ name:'', title:'Plant / Logistics Manager', email:'', phone:'216-631-8850', linkedin:'' } },
  { company:'Catanese Classics', type:'distributor', category:'reefer', city:'Cleveland', state:'OH',
    about:'Seafood & specialty distributor — refrigerated/frozen daily.',
    signals:['Seafood → strict cold-chain','Specialty foodservice'], url:'http://www.cataneseclassics.com',
    contact:{ name:'', title:'Operations Manager', email:'', phone:'216-696-0080', linkedin:'' } },
  { company:'Compass Health Brands', type:'manufacturer', category:'dry', city:'Cleveland', state:'OH',
    about:'Medical device / DME manufacturer (~$58M rev, Drive Medical family) — outbound to healthcare DCs.',
    signals:['~$58M revenue','DME manufacturer → carrier-dependent','Medical device outbound'], url:'http://www.compasshealthbrands.com',
    contact:{ name:'', title:'Supply Chain / Logistics Mgr', email:'', phone:'800-376-7263', linkedin:'' } },
  { company:'Health Aid of Ohio', type:'distributor', category:'both', city:'Cleveland', state:'OH',
    about:'Medical equipment distributor (~$14.5M rev) — DME + home medical delivery.',
    signals:['~$14.5M revenue','Medical equipment distro','Home-medical delivery need'], url:'http://www.healthaidofohio.com',
    contact:{ name:'', title:'Operations Manager', email:'', phone:'216-252-3900', linkedin:'' } },
  { company:'Mansa Medical', type:'distributor', category:'both', city:'Cleveland', state:'OH',
    about:'Medical equipment distributor — fast-growing (+25% headcount 12mo).',
    signals:['+25% headcount 12mo (hot)','Medical equipment distro','Scaling'], url:'http://www.mansamedical.com',
    contact:{ name:'', title:'Operations Manager', email:'', phone:'833-626-7263', linkedin:'' } },
];

/* ---------- Real NE-Ohio shipper targets ---------- */
function buildProspects() {
  const R = [
    { company:'Northern Haserot', type:'distributor', category:'reefer', city:'Bedford Heights', state:'OH',
      about:'Leading Midwest foodservice distributor since 1878, 10,000+ products, center-of-the-plate focus.',
      signals:['10,000+ SKUs','Own fleet → overflow/peak + backhaul lanes'], url:'https://www.northernhaserot.com/' },
    { company:'The Sanson Company', type:'distributor', category:'reefer', city:'Cleveland', state:'OH',
      about:"Northeast Ohio's largest full-service produce distributor (retail, wholesale, foodservice).",
      signals:['Largest NE-OH produce distributor','Daily refrigerated volume'], url:'https://www.sansonco.com/' },
    { company:'Hillcrest Foods', type:'distributor', category:'both', city:'Bedford Heights', state:'OH',
      about:'One of the largest family-owned independent food distributors in Ohio.',
      signals:['Independent → flexible on carriers','Mixed reefer + dry'], url:'https://www.hillcrestfoods.com/' },
    { company:'Orlando Baking Company', type:'manufacturer', category:'dry', city:'Cleveland', state:'OH',
      about:'Major regional bakery manufacturer; breads/rolls shipped across the Midwest daily.',
      signals:['High-frequency outbound','Regional DC lanes'], url:'https://www.orlandobaking.com/' },
    { company:'Nor-Am Cold Storage', type:'coldstorage', category:'reefer', city:'Cleveland', state:'OH',
      about:'$50M frozen-food PRW at 2797 E 75th St; customers incl. Meijer, Orlando Baking, Arlington Valley Farms.',
      signals:['15K pallet positions','Drayage in + outbound distribution'], url:'https://www.refrigeratedfrozenfood.com/articles/101867' },
    { company:'National Freezer', type:'coldstorage', category:'reefer', city:'Cleveland', state:'OH', warm:true,
      about:'Public refrigerated warehouse, 2700 E 40th St — ALREADY your US Foods cold-storage partner.',
      signals:['Existing relationship','1.5M+ cu ft — expand to their other tenants'], url:'https://www.nationalfreezer.com/' },
    { company:'Peoples Services / Total Distribution', type:'3pl', category:'both', city:'Tallmadge', state:'OH',
      about:'Asset-based 3PL, temperature-controlled + dry; grew via Kandel Cold Storage acquisition.',
      signals:['Temp-controlled + dry','Overflow when their assets are tight'], url:'https://www.peoplesservices.com/' },
    { company:'National Commercial Warehouse', type:'3pl', category:'both', city:'Akron', state:'OH',
      about:'2M sq ft across Lee Rd, Rockside Rd (Cleveland) and Akron.',
      signals:['3 NE-OH facilities','Distribution outbound lanes'], url:'https://www.nationalcommercialwarehouse.com/' },
    { company:'Beverage Distributors Inc.', type:'distributor', category:'dry', city:'Cleveland', state:'OH',
      about:'Delivers major beverage brands across Cleveland & NE Ohio.',
      signals:['Regional route density','Peak-season overflow'], url:'https://beveragedist.com/' },
    { company:'Great Lakes Brewing Co.', type:'brewery', category:'dry', city:'Cleveland', state:'OH',
      about:'Ohio City brewery; self-distributes regionally (the wedge — same play as Sibling Revelry).',
      signals:['Kegs/cases','Self-distribution = direct carrier need'], url:'https://www.greatlakesbrewing.com/' },
    { company:'Arlington Valley Farms', type:'manufacturer', category:'reefer', city:'Cleveland', state:'OH',
      about:'Frozen sandwich manufacturer (a Nor-Am tenant) — needs outbound frozen carriers.',
      signals:['Manufacturer → carrier-dependent','Frozen outbound'], url:'https://www.arlingtonvalleyfarms.com/' },
    { company:'Sysco Cleveland', type:'distributor', category:'reefer', city:'Cleveland', state:'OH',
      about:'National broadline foodservice distributor; large fleet but uses carriers for overflow & dedicated.',
      signals:['Scale → overflow + dedicated','Redistribution lanes'], url:'https://www.sysco.com/Cleveland' },
  ];
  const seeded = R.map((p, i) => {
    const intel = Object.assign(deriveIntel(p), INTEL_OVERRIDES[p.company] || {});
    return Object.assign(p, { id:'pr_'+(70000+i), source:'research',
      contact:{ name:'', title:'Logistics / Transportation Manager', email:'', phone:'', linkedin:'' }, intel },
      scoreProspect(p));
  });
  const apollo = APOLLO_LEADS.map((p, i) => {
    const intel = Object.assign(deriveIntel(p), INTEL_OVERRIDES[p.company] || {});
    return Object.assign(p, { id:'ap_'+(80000+i), source:'apollo', intel }, scoreProspect(p));
  });
  return seeded.concat(apollo);
}

/* =====================  OUTREACH ENGINE  ===================== */
function _first(p){ return p.contact.name ? p.contact.name.split(' ')[0] : 'there'; }
function _equip(p){ return p.category === 'dry' ? 'dry van + box-truck' : 'refrigerated + dry'; }
function _lane(p){ return (p.intel.likelyLanes && p.intel.likelyLanes[0]) || `${p.city} regional`; }

/* Three intro angles — pick per prospect */
function outreachAngles(p) {
  const first = _first(p), eq = _equip(p), lane = _lane(p);
  return [
    { key:'overflow', label:'Overflow / backup capacity',
      subject:`Backup capacity for ${p.company} — reefer + dry, NE Ohio`,
      body:`Hi ${first},\n\nMike Cook with SupplyNow (${SN.name}, ${SN.mc}/${SN.dot}) — an asset-based ${eq} carrier in Cleveland. I know ${p.company} runs ${p.intel.ownFleet.toLowerCase().includes('yes')?'its own fleet':'tight capacity'}, so I'm not asking to replace anything — I want to be your backup call when your trucks are tight or a lane spikes.\n\nWe run recurring foodservice and cold-chain freight across NE Ohio with live GPS + temperature tracking. Give me the loads nobody else wants to cover, and I'll earn the dedicated lanes from there.\n\n10 minutes this week? I'll send our profile + COI ahead.\n\n${SIG}` },
    { key:'reliability', label:'Cold-chain reliability',
      subject:`Temp-controlled capacity you can trust — ${p.company}`,
      body:`Hi ${first},\n\nMike with SupplyNow (${SN.mc}/${SN.dot}), a Cleveland ${eq} carrier. For ${TYPE_LABEL[p.type].toLowerCase()} freight, the two things that bite are ${p.intel.painPoints.join(' and ').toLowerCase()} — both are exactly what we're built for: live temp + GPS on every load and appointment-tight delivery.\n\nWe already run cold-chain lanes like ${lane}. I'd like to quote a lane for you and prove it on a trial run.\n\nWorth a quick call?\n\n${SIG}` },
    { key:'dedicated', label:'Dedicated lane / cost',
      subject:`A dedicated ${p.category==='dry'?'dry':'reefer'} lane for ${p.company}`,
      body:`Hi ${first},\n\n${SN.rep} with SupplyNow (${SN.mc}). As an asset-based carrier we can commit a truck to a recurring lane — no broker markup between us. Based on your operation, ${_lane(p)} looks like a natural fit.\n\nIf you're paying broker rates on any repeating lane today, I can likely beat it and give you consistent equipment + a driver you know. Send me one lane and I'll quote it same day.\n\n${SIG}` },
  ];
}

/* 5-touch cadence */
function outreachSequence(p, angleKey) {
  const first = _first(p), lane = _lane(p);
  const intro = (outreachAngles(p).find(a=>a.key===angleKey) || outreachAngles(p)[0]);
  return [
    { day:0, channel:'Email', label:'Intro email', subject:intro.subject, body:intro.body },
    { day:2, channel:'Call', label:'Call + voicemail', body:
`CALL OPENER:\n"Hi, this is Mike with SupplyNow — asset-based reefer & dry carrier here in Cleveland. I emailed about being ${p.company}'s backup capacity when your trucks are tight. Who handles your outbound transportation?"\n\nVOICEMAIL (if no answer):\n"Hi, Mike Cook with SupplyNow, ${SN.phone}. We run cold-chain lanes out of Cleveland and I'd like to be ${p.company}'s backup for ${lane}. Quick call when you have 5 minutes — ${SN.phone}. Thanks."` },
    { day:4, channel:'LinkedIn', label:'LinkedIn connect note', body:
`"Hi ${first} — I run SupplyNow, a Cleveland reefer/dry carrier. We cover recurring foodservice & cold-chain lanes across NE Ohio. Would love to connect and be a capacity resource for ${p.company}."` },
    { day:7, channel:'Email', label:'Value follow-up', subject:`Re: ${intro.subject}`, body:
`Hi ${first},\n\nCircling back. Three reasons carriers like us earn a shot with ${TYPE_LABEL[p.type].toLowerCase()}s:\n • Live GPS + temperature on every load (share link at pickup)\n • Asset-based — same equipment, driver you know, no broker daisy-chain\n • Cleveland-based, so ${lane} and NE-Ohio drops are our backyard\n\nHappy to run one trial load so you can see it. What lane should I quote?\n\n${SIG}` },
    { day:12, channel:'Email', label:'Breakup / permission to close', subject:`Should I close the loop, ${first}?`, body:
`Hi ${first},\n\nI don't want to crowd your inbox. If capacity isn't a need right now, just say the word and I'll check back next quarter. If it is — even one overflow lane — I'm ready to quote today.\n\nEither way, keep my number for the day a load falls through.\n\nThanks for the time.\n\n${SIG}` },
  ];
}

/* Objection handling */
function objections(p) {
  return [
    { q:'"We run our own trucks."', a:`Perfect — I'm not asking to replace them. Use me for overflow, peak weeks, and the lanes your drivers hate. ${p.intel.ownFleet.includes('Yes')?'Even the best fleets have gaps on holidays and surges.':''}` },
    { q:'"We already use a broker/3PL."', a:`Then you're paying a 15–25% markup and getting whatever truck they find. We're asset-based — same equipment, a driver you know, and you deal directly with me. Give me one lane to prove the difference.` },
    { q:'"Just send me your info."', a:`Sending our profile + COI now. Can I put 10 minutes on the calendar Thursday so it doesn't sit in a folder? Even a no is useful to me.` },
    { q:'"We\'re not looking right now."', a:`No problem — capacity needs show up the day a load falls through. Can I check back next quarter, and keep my cell handy for emergencies in the meantime?` },
    { q:'"Your rate is too high."', a:`Tell me the target. As an asset carrier I've got room brokers don't — and on a recurring lane I can sharpen it further once we're dialed in.` },
  ];
}

/* legacy single-email helpers (kept for any callers) */
function outreachEmail(p){ const a=outreachAngles(p)[0]; return { subject:a.subject, body:a.body }; }
function outreachCall(p){ return outreachSequence(p,'overflow')[1].body; }

/* ---------- fetch entry ---------- */
async function fetchProspects(filters) {
  if (PROSPECT_CONFIG.useMock) {
    await new Promise(r => setTimeout(r, 200));
    return { prospects: applyProspectFilters(buildProspects(), filters), enriched:false };
  }
  const url = `${PROSPECT_CONFIG.proxyUrl}?action=prospects&filters=${encodeURIComponent(JSON.stringify(filters))}`;
  const res = await fetch(url); const data = await res.json();
  const scored = (data.prospects || []).map(p => { p.intel = p.intel || Object.assign(deriveIntel(p), INTEL_OVERRIDES[p.company]||{}); return Object.assign(p, scoreProspect(p)); });
  return { prospects: applyProspectFilters(scored, filters), enriched:true };
}
function applyProspectFilters(list, f) {
  return list.filter(p => {
    if (f.keyword) { const hay=(p.company+' '+p.about+' '+p.type).toLowerCase(); if (!hay.includes(f.keyword.toLowerCase())) return false; }
    if (f.category && f.category!=='any') {
      if (f.category==='reefer' && !(p.category==='reefer'||p.category==='both')) return false;
      if (f.category==='dry' && !(p.category==='dry'||p.category==='both')) return false;
    }
    if (f.type && p.type!==f.type) return false;
    if (f.city && p.city.toLowerCase()!==f.city.toLowerCase()) return false;
    if (f.minFit && p.fitScore < f.minFit) return false;
    return true;
  });
}
