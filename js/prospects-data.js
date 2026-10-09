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

const P_HOME = { city:'Cleveland', region:['Bedford Heights','Bedford','Tallmadge','Akron','Solon','Twinsburg','Macedonia','Independence','Valley View','Lorain','Elyria','Mentor','Strongsville','Willoughby Hills','Willoughby','Wickliffe','Eastlake','Canton','North Canton','Hartville','Louisville','Navarre','Massillon','Kent','Stow','Ravenna','Medina','Brook Park','Cuyahoga Falls'] };
/* paidEnrichment GATE: Apollo credit-spending reveals (direct dials / verified emails) are OFF by
 * default. Never enrich/reveal or publish a paid personal contact unless Mike explicitly directs it.
 * Research leads below carry NO paid data — company + public main line only. */
const PROSPECT_CONFIG = { useMock:true, proxyUrl:'', paidEnrichment:false };

const SN = { name:'Supply Now Inc.', mc:'MC 1660872', dot:'DOT 3976910', phone:'216-548-7070', email:'dispatch@supplynow.org', rep:'Mike Cook' };
const SIG = `${SN.rep}\nSupplyNow — Asset-Based Reefer & Dry Carrier\n${SN.phone} · ${SN.email}\n${SN.mc} · ${SN.dot}`;
const TYPE_LABEL = { manufacturer:'Manufacturer', coldstorage:'Cold Storage', '3pl':'3PL', distributor:'Distributor', brewery:'Brewery' };

/* ---------- Fit scoring with a 4-part breakdown ---------- */
function scoreProspect(p) {
  const commodity = (p.category === 'reefer' || p.category === 'both') ? 90 : 60;
  let need = ({ manufacturer:90, coldstorage:85, brewery:80, '3pl':70, distributor:55 })[p.type] || 60;
  const proximity = p.city === P_HOME.city ? 100 : (P_HOME.region.indexOf(p.city) > -1 ? 80 : 40);
  let winnability = p.warm ? 95 : ({ manufacturer:78, coldstorage:76, brewery:72, '3pl':66, distributor:56 })[p.type] || 60;
  /* SNAP-model overflow leads run their own fleets → score like distributors (overflow last, per Mike) */
  if (p.group === 'overflow') { need = Math.min(need, 55); winnability = Math.min(winnability, 56); }
  const subScores = { commodity, need, proximity, winnability };
  let fitScore = Math.round(0.30*commodity + 0.30*need + 0.20*proximity + 0.20*winnability);
  if (p.closing) fitScore = Math.min(fitScore, 40);
  const fitLabel = fitScore >= 78 ? 'Hot' : fitScore >= 64 ? 'Warm' : fitScore >= 50 ? 'Worth a look' : 'Long shot';
  const fitReasons = [];
  fitReasons.push(commodity >= 90 ? 'Reefer / cold-chain — your core' : 'Dry freight — in scope');
  fitReasons.push(({manufacturer:'Manufacturer — carrier-dependent for outbound',coldstorage:'Cold-storage — drayage in + distribution out','3pl':'3PL — overflow & dedicated lanes',distributor:'Distributor — overflow + backhaul (runs own fleet)',brewery:'Brewery — self-distributes locally'})[p.type]);
  fitReasons.push(proximity === 100 ? 'In Cleveland' : proximity === 80 ? 'NE Ohio metro' : p.city+', '+p.state);
  if (p.warm) fitReasons.push('Existing relationship — warm intro');
  if (p.segment === 'snap-model') fitReasons.push('SNAP-model lead — ' + ({cold:'cold chain / mixed',dry:'dry',overflow:'overflow fill (own fleet)',other:'other play'})[p.group]);
  if (p.closing) fitReasons.push('CLOSING per its website — check before outreach');
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
  'Produce Packaging (PPI)': { ownFleet:'No — 100% third-party carriers',
    approach:'Straight to Logistics Mgr Albert Pursel — fresh-cut short-notice reefer + repack outbound to retail/foodservice DCs. Warm path: sister company to The Sanson Company (also a target).',
    triggers:['No trucks of their own — every load is a carrier','Fresh-cut = high-frequency, appointment-tight reefer','Sister-company intro to Sanson & Great Lakes Packers'],
    painPoints:['Short-notice reefer capacity','On-time to retail DC delivery windows','Temp integrity on cut produce'],
    likelyLanes:['Willoughby Hills → Cleveland Produce Terminal','Willoughby Hills → Midwest retail DCs','Willoughby Hills → NE Ohio foodservice'] },
  'Oriental Better Foods': { ownFleet:'No — import brokerage / distribution',
    approach:'Frozen distribution from their cold-storage point to Midwest foodservice/retail buyers, plus port/rail drayage on inbound containers.',
    triggers:['Frozen IQF imports need reefer trucks on the outbound','No owned fleet','Growing import volume (~110 shipments)'],
    painPoints:['Frozen temp integrity in transit','Drayage timing from port/rail ramp','Small-drop distribution economics'],
    likelyLanes:['Cold storage → Midwest foodservice buyers','Port/rail ramp → Cleveland cold storage (drayage)','Cleveland → regional retail (frozen)'] },
  'Lineage (Solon / Oakwood Village)': { ownFleet:'Yes — integrated/managed transportation (brokers to carriers)',
    approach:'Get on Lineage’s carrier network for NE-Ohio outbound — be the local reefer that runs Solon/Oakwood Village → regional retail DCs. Start at facility transportation, not corporate; national onboarding is slow.',
    triggers:['480+ site network leans on local reefer carriers for last-leg distribution','You’re Cleveland-based reefer, minutes from Solon & Oakwood Village','Retail DC delivery windows they must hit'],
    painPoints:['Appointment-tight retail DC delivery','Local reefer capacity at the facility','Temp integrity door-to-door'],
    likelyLanes:['Solon → Midwest retail DCs','Oakwood Village → NE-Ohio retail/foodservice','Rail/port drayage → Solon'] },
  'Great Lakes Cold Logistics': { ownFleet:'Yes — asset-based reefer + LTL consolidation',
    approach:'NEO networking play, not a Pittsburgh lane. They’re in Solon — around the corner from our NEO base — so build the relationship as their go-to local NEO reefer for short-notice / overflow drops and trade referrals. We do NOT chase their Pittsburgh dock-to-dock (no spare truck capacity for that corridor). Relationship-first: dispatch Eric Vickers (x727) or Jim Short (Sr Dir Logistics).',
    triggers:['They run their own reefer fleet — overflow spikes when capacity is tight','LTL consolidation → partial loads they’ll hand off','Shared NE-Ohio + Pittsburgh corridor'],
    painPoints:['Overflow coverage without margin loss','Reefer-qualified partner carriers','Weekend/holiday capacity'],
    likelyLanes:['NEO local drops (their overflow, short-notice)','Cleveland / Solon → NE-Ohio retail & foodservice','Local reefer runs when their trucks are committed'] },

  /* SNAP-model leads (10/8/26) */
  "DeVitis Fine Italian Foods": { ownFleet:"None on record (no USDOT)", approach:"SNAP setup: one kitchen, fresh product, recurring stops at hospital, school and retail accounts — we run it as their fleet.", triggers:["Sales \"grown way more than I ever thought\" (ABJ 2/7/25)", "New owner since 12/31/24", "Hospital + school accounts = SNAP customer types"], painPoints:["Fast growth outpacing delivery", "Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Akron commissary → Summa Health + schools", "Akron commissary → grocery, gas-station & coffee-shop accounts"] },
  "Mitchell's Homemade Ice Cream": { ownFleet:"Yes — own delivery drivers (no USDOT on record)", approach:"Take over or back up their grocery and shop routes with our drivers and reefers — the SNAP setup.", triggers:["Actively hiring delivery drivers", "6–7 day delivery schedule", "Kitchen runs 7a–11p, 7 days"], painPoints:["Driver hiring for a 6–7 day schedule", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Ohio City kitchen → Heinen's / Dave's / Giant Eagle stores", "Ohio City kitchen → its own shops"] },
  "Pierre's Ice Cream Co.": { ownFleet:"Yes — 8 trucks / 8 drivers (FMCSA 3955646)", approach:"3PL takeover of their store-delivery routes, or backup for them.", triggers:["Runs its own DSD fleet", "2nd-shift + weekend work posted", "Half a mile from our SNAP base"], painPoints:["Second-shift and weekend staffing", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["6200 Euclid → Ohio retail store-delivery routes", "Plant → foodservice + private-label accounts"] },
  "Miceli Dairy Products": { ownFleet:"Yes — 8 trucks / 8 drivers (FMCSA 177312)", approach:"Fleet backup or route takeover as they grow — same cold product we haul for SNAP.", triggers:["$13M storage expansion (6/2025)", "Mozzarella plant planned", "Consolidating rented storage"], painPoints:["Outgrowing space — storage spread across the city", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["E 90th plant → customer accounts (channels not stated)", "Plant ↔ rented storage sites"] },
  "Hartville Kitchen": { ownFleet:"None on record (distributor not stated)", approach:"Refrigerated grocery runs plus its own restaurant & bakery — several channels from one kitchen, like SNAP.", triggers:["Multi-channel: grocery + restaurant + online", "Refrigerated SKUs"], painPoints:["Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Hartville kitchen → grocery produce departments (Acme and others)", "Kitchen → own restaurant & bakery"] },
  "Malley's Chocolates": { ownFleet:"None on record (no USDOT)", approach:"Temperature-controlled restocking of 18 stores from one plant, plus holiday peak and fundraiser drops.", triggers:["Peak-season ship delays up to 5 business days", "18-store replenishment"], painPoints:["Holiday peaks", "Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Brookpark Rd plant → 18 NE Ohio stores", "Plant → fundraiser + corporate drops"] },
  "Raddell's Sausage Shop": { ownFleet:"None on record — moves via distributors", approach:"Scheduled reefer runs from the shop to its distributors’ docks.", triggers:["Broadline (Sysco) + regional distributors", "How product reaches distributors not stated"], painPoints:["Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["E 152nd shop → Sysco + Oleksy Meats docks", "Shop → Silver Star Meats"] },
  "Garden of Flavor": { ownFleet:"None on record (no USDOT)", approach:"Refrigerated runs to several grocery chains for a product made every day.", triggers:["Daily-made refrigerated product", "Whole Foods / Heinen’s accounts"], painPoints:["Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Cleveland plant → Whole Foods / Heinen's stores", "Plant → other grocery accounts"] },
  "Country Pure Foods": { ownFleet:"1 truck / 1 driver (FMCSA 44651, 2023 record)", approach:"Local and regional reefer runs — only one truck registered.", triggers:["New owner (Peterson Brands, 12/2025)", "School + healthcare channels"], painPoints:["Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Akron plant → K-12 + healthcare accounts", "Plant ↔ Akron cold storage"] },
  "Superior Dairy": { ownFleet:"2 trucks / 1 driver (FMCSA 330928)", approach:"Regional reefer loads out of Canton.", triggers:["Small registered fleet vs 45-state volume", "Who hauls the rest not stated"], painPoints:["2 trucks / 1 driver against 45-state distribution", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Canton plant → regional private-label loads"] },
  "Gardner Pie Co.": { ownFleet:"None on record — via frozen distributors", approach:"Frozen runs from the plant to distributor docks as volume ramps.", triggers:["16x capacity ramp (Food Engineering 4/6/26)"], painPoints:["Ramping volume on a new line", "Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Akron plant → frozen distributor docks"] },
  "Biery Cheese": { ownFleet:"None on record (no USDOT)", approach:"Regional reefer freight; local-route fit not shown in sources.", triggers:["High-volume cold plant in the Canton market"], painPoints:["Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Louisville plant → regional retail / wholesale / foodservice loads"] },
  "Mid's Pasta Sauce": { ownFleet:"0 trucks (FMCSA 979746, 2010 record)", approach:"Dense store coverage across Cleveland, Akron and Canton.", triggers:["320 stores in our 3 markets"], painPoints:["Keeping 320 stores stocked with no trucks on record", "Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Navarre → Giant Eagle / Marc's / Discount Drug Mart / Heinen's stores"] },
  "Bent Tree Coffee": { ownFleet:"None on record (no USDOT)", approach:"A mix of grocery, campus and cafe stops from one roastery.", triggers:["Multi-channel accounts"], painPoints:["Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Kent roastery → Acme / Giant Eagle / Heinen’s stores", "Roastery → Kent State, cafes, breweries"] },
  "Rising Star Coffee Roasters": { ownFleet:"None on record (no USDOT)", approach:"Restocking its own cafes plus wholesale drops.", triggers:["Own-cafe replenishment"], painPoints:["Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Walton Ave roastery → its 7 cafes", "Roastery → wholesale cafes/offices"] },
  "Euclid Fish Company": { ownFleet:"Yes — 5 trucks / 11 drivers (FMCSA 209939)", approach:"Overflow trucks and drivers while they hire.", triggers:["Driver openings in Mentor + Pittsburgh"], painPoints:["Driver hiring", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Mentor → restaurants, clubs, hotels across OH / W. PA"] },
  "Serv-Ice Delivery Co.": { ownFleet:"Yes — 9 trucks / 4 drivers (FMCSA 2629494)", approach:"Drivers and overflow capacity.", triggers:["Twice as many trucks as drivers"], painPoints:["More than twice as many trucks as drivers", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Akron → local ice accounts (customers not stated)"] },
  "Instantwhip-Akron": { ownFleet:"Yes — 17 trucks / 13 drivers (FMCSA 337602)", approach:"Drivers and overflow capacity.", triggers:["Truck count exceeds drivers"], painPoints:["4 more trucks than drivers", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Stow → restaurants, ice cream shops, c-stores across NE Ohio"] },
  "Sirna & Sons Produce": { ownFleet:"Yes — 55 trucks (directory, undated)", approach:"Overflow routes and drivers.", triggers:["Standing driver interviews"], painPoints:["Driver hiring", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Ravenna → restaurants, hotels, clubs, institutions (Mon–Sat)"] },
  "Sandridge Crafted Foods": { ownFleet:"Yes — MDS carrier, 35 trucks / 35 drivers (FMCSA 272185)", approach:"Overflow or last-mile only, since it already has a 35-truck carrier.", triggers:["Own 35-truck carrier"], painPoints:["Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Medina → college / healthcare dining + retail deli"] },
  "Festa Food Company": { ownFleet:"None on record (no USDOT)", approach:"Close to the SNAP model: frozen meals from one plant to schools, healthcare and senior living.", triggers:["Ownership change 11/2025", "DTC launch 2026"], painPoints:["New owners adding a direct-to-consumer line", "Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["W 58th plant → schools, healthcare & senior living", "Plant → retail / private-label + c-store accounts"] },
  "Cleveland Wholesale Cash & Carry": { ownFleet:"None — cash & carry", approach:"The model we run for Restaurant Depot: delivering cash-and-carry orders to small grocers, c-stores and restaurants.", triggers:["No delivery offered on record"], painPoints:["Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["3341 Superior → small grocers, c-stores, gas stations, restaurants"] },
  "Dean Supply Company": { ownFleet:"Yes — own trucks daily in Cleveland (no Ohio USDOT on record)", approach:"VIP customer deliveries, off-hours and peak overflow behind their own trucks.", triggers:["Runs own local fleet"], painPoints:["Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["Woodland Ave → restaurants & caterers across Cleveland"] },
  "Randy's Artisanal Pickles": { ownFleet:"None on record", approach:"Check before outreach — the play may be the team’s next product.", triggers:["Closure notice on site"], painPoints:["Closing on rising costs", "Staffing", "Fuel", "Tight margins — little room for delivery support"], likelyLanes:["Check status — closing per its site"] },
  "Borden Dairy (Cleveland)": { ownFleet:"Yes — 109 trucks / 91 drivers (FMCSA 468710)", approach:"VIP customer deliveries, off-hours and peak overflow behind their own fleet.", triggers:["MCS-150 updated 1/30/26", "Truck count exceeds drivers by 18"], painPoints:["18 more trucks than drivers", "Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["W 106th / Western Ave → grocery, c-store, drug-store + school accounts"] },
  'Hillcrest Foods': { ownFleet:"Yes — own trucks, 1.5M+ mi/yr (no USDOT found under Hillcrest names)", approach:"Late POs, VIP customer deliveries, off-hours and peak overflow. About a quarter mile from us.", triggers:["7,000+ restaurant visits a month", "Independent — flexible on carriers"], painPoints:["Staffing", "Fuel", "Tight margins", "Aging fleet"], likelyLanes:["E 51st warehouse → independent restaurants", "Late-PO and VIP runs"] },
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
    contact:{ name:'Al Radis', title:'Owner', email:'aradis@blueribbonmeats.com', phone:'216-631-8850', linkedin:'' } },
  { company:'Catanese Classics', type:'distributor', category:'reefer', city:'Cleveland', state:'OH',
    about:'Seafood & specialty distributor — refrigerated/frozen daily.',
    signals:['Seafood → strict cold-chain','Specialty foodservice'], url:'http://www.cataneseclassics.com',
    contact:{ name:'Michael McCann', title:'Operations Manager', email:'michael.mccann@cataneseclassics.com', phone:'216-696-0080', linkedin:'' } },
  { company:'Compass Health Brands', type:'manufacturer', category:'dry', city:'Cleveland', state:'OH',
    about:'Medical device / DME manufacturer (~$58M rev, Drive Medical family) — outbound to healthcare DCs.',
    signals:['~$58M revenue','DME manufacturer → carrier-dependent','Medical device outbound'], url:'http://www.compasshealthbrands.com',
    contact:{ name:'Grant Kozopas', title:'Transportation & Operations Manager', email:'grant.kozopas@compasshealthbrands.com', phone:'800-376-7263', linkedin:'' } },
  { company:'Health Aid of Ohio', type:'distributor', category:'both', city:'Cleveland', state:'OH',
    about:'Medical equipment distributor (~$14.5M rev) — DME + home medical delivery.',
    signals:['~$14.5M revenue','Medical equipment distro','Cleveland Clinic supplier'], url:'http://www.healthaidofohio.com',
    contact:{ name:'Carol Gilligan-Chack', title:'President', email:'carolg@healthaidofohio.com', phone:'216-252-3900', linkedin:'' } },
  { company:'Mansa Medical', type:'distributor', category:'both', city:'Cleveland', state:'OH',
    about:'Medical equipment distributor — fast-growing (+25% headcount 12mo).',
    signals:['+25% headcount 12mo (hot)','Medical imaging equipment distro','Scaling'], url:'http://www.mansamedical.com',
    contact:{ name:'David Sweitzer', title:'Director of Operations', email:'dsweitzer@mansamedical.com', phone:'833-626-7263', linkedin:'' } },
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
    { company:"Hillcrest Foods", type:"distributor", category:"both", city:"Cleveland", state:"OH", segment:"snap-model", group:"other", about:"Family-owned independent foodservice distributor for NE Ohio independent restaurants. Office 2735 E 40th St; warehouse & will-call 2699 E 51st St. Own trucks drive 1.5M+ mi/yr, 7,000+ restaurant visits/mo.", signals:["Own fleet: 1.5M+ mi/yr", "~0.25 mi from us (per Mike)", "Late POs / VIP / off-hours / peak overflow"], url:"https://www.hillcrestfoods.com/", contact:{"name": "", "title": "Transportation / Operations Manager", "email": "", "phone": "216-361-4625", "linkedin": ""} },
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
    { company:'Produce Packaging (PPI)', type:'manufacturer', category:'reefer', city:'Willoughby Hills', state:'OH',
      about:'$40M fresh-cut produce processor & repacker (est. 1994), 250+ employees; sister company to The Sanson Company and Great Lakes Packers. Serves retail chains, foodservice distributors, food manufacturers and schools within ~400 mi.',
      signals:['No owned fleet — 100% third-party freight','Fresh-cut = daily reefer, short-notice orders','Sister co. to Sanson (already a target)'],
      url:'https://ppifresh.net/',
      contact:{ name:'Albert Pursel', title:'Logistics Manager (inbound & outbound freight)', email:'', phone:'216-391-6129', linkedin:'' } },
    { company:'Oriental Better Foods', type:'distributor', category:'reefer', city:'Cleveland', state:'OH',
      about:'Importer/distributor of IQF frozen vegetables (diced onion, peppers, cauliflower, celery) from China & Korea; ~110 import shipments. Lean team — office at 1468 W 9th St (SPACES shared office); warehousing/cold storage via 3rd parties.',
      signals:['Frozen IQF import → drayage in + frozen distribution out','Container-import driven, growing volume','No owned fleet — small team'],
      url:'https://panjiva.com/Oriental-Better-Foods-Llc/230098556',
      contact:{ name:'', title:'Owner / Import Operations', email:'', phone:'', linkedin:'' } },
    { company:'Lineage (Solon / Oakwood Village)', type:'coldstorage', category:'reefer', city:'Solon', state:'OH',
      about:'World’s largest cold-storage REIT (480+ sites, 18 countries) with integrated transportation. NE-Ohio facilities: Solon (6531 Cochran Rd — the former Great Lakes Cold Storage it bought in 2021) and Oakwood Village (199 Oakleaf Oval), plus two Columbus DCs. Regional distribution centers moving frozen/refrigerated for major food shippers.',
      signals:['Local outbound reefer from Solon/Oakwood Village → retail DCs','Integrated transportation — uses carriers at facility level','National account: start local, long cycle'],
      url:'https://www.onelineage.com/facilities/solon',
      contact:{ name:'', title:'Facility Transportation Mgr / Carrier Onboarding (start at Cleveland/Solon facility)', email:'', phone:'800-678-7271', linkedin:'' } },
    { company:'Great Lakes Cold Logistics', type:'3pl', category:'reefer', city:'Solon', state:'OH',
      about:'Independent cold-storage + asset-based reefer carrier / LTL consolidator (Polar 3PL; USDOT 1325925), Solon OH roots with transportation dispatch in the Pittsburgh area (Warrendale/Cranberry PA) + Worcester MA. Runs its own refrigerated fleet nationwide. Solon HQ is minutes from our NEO base — a peer carrier and a local networking relationship, not a Pittsburgh-lane play.',
      signals:['Solon HQ — around the corner from our NEO ops','NEO networking / referrals, not their Pittsburgh dock-to-dock','Peer reefer carrier — local overflow + relationship'],
      url:'https://www.drivegreatlakes.com/',
      contact:{ name:'Eric Vickers', title:'Dispatch Coordinator (carrier relations) — x727; also Jim Short, Sr Dir Logistics', email:'evickers@glclogistics.com', phone:'724-741-9600', linkedin:'' } },

    /* ---- SMALL-PRODUCER LEAD LIST ----
     * Band = between SNAP Gourmet (~$6.7M, ~40 emp) and Pizza Bagel Lady (micro). NE-Ohio food
     * producers/manufacturers too small to run a fleet → outbound cold-chain need. Contacts left
     * blank on purpose (paid enrichment is gated). Sizes are estimates — confirm before pricing. */
    { company:'Ohio City Pasta', type:'manufacturer', category:'reefer', city:'Cleveland', state:'OH', segment:'small-producer',
      about:'Fresh & frozen pasta and pierogi maker; retail, wholesale & foodservice. Small Cleveland producer.',
      signals:['Fresh/frozen → reefer outbound','Retail + foodservice + wholesale drops','No fleet — carrier-dependent'], url:'https://www.ohiocitypasta.com/' },
    { company:'Pierogies of Cleveland', type:'manufacturer', category:'reefer', city:'Richfield', state:'OH', segment:'small-producer',
      about:'Handmade frozen pierogi, 36+ flavors; wholesale + DTC online. Small producer.',
      signals:['Frozen outbound','Wholesale + ecommerce shipping','Small — no own trucks'], url:'https://www.poconlinestore.com/' },
    { company:"Rudy's Strudel & Pierogi", type:'manufacturer', category:'reefer', city:'Parma', state:'OH', segment:'small-producer',
      about:'Parma-based frozen pierogi & strudel; retail + wholesale. Small family producer.',
      signals:['Frozen product','Local wholesale + shipping','Micro/small — carrier need'], url:'https://www.rudysstrudel.com/' },
    { company:'Cleveland Kitchen', type:'manufacturer', category:'reefer', city:'Cleveland', state:'OH', segment:'small-producer',
      about:'Refrigerated fermented foods (kraut, kimchi, dressings) sold in national retail; Ohio City. Top of the band.',
      signals:['Refrigerated → strict cold-chain','Ships to national grocery DCs','Growing — outbound scaling'], url:'https://www.clevelandkitchen.com/' },
    { company:'Cleveland Bagel Company', type:'manufacturer', category:'both', city:'Cleveland', state:'OH', segment:'small-producer',
      about:'Wholesale bagels & dough to cafes, grocers & foodservice. Small Cleveland producer.',
      signals:['Refrigerated dough + baked goods','Early-morning wholesale drops','No fleet'], url:'https://www.clevelandbagel.com/' },
    { company:'Mackenzie Creamery', type:'manufacturer', category:'reefer', city:'Hiram', state:'OH', segment:'small-producer',
      about:'Artisan goat-cheese creamery; retail & foodservice, ships regionally/nationally. Small producer.',
      signals:['Refrigerated cheese → cold-chain','Regional + national retail','Small — carrier-dependent'], url:'https://www.mackenziecreamery.com/' },
    { company:'Hartzler Family Dairy', type:'manufacturer', category:'reefer', city:'Wooster', state:'OH', segment:'small-producer',
      about:'Glass-bottle dairy & creamery; grocery + DTC across NE Ohio. Small-mid producer (top of band).',
      signals:['Refrigerated dairy','Grocery route + farm store','Own routes but overflow/backhaul'], url:'https://www.hartzlerdairy.com/' },
    { company:'Ohio City Provisions', type:'manufacturer', category:'reefer', city:'Cleveland', state:'OH', segment:'small-producer',
      about:'Whole-animal butcher & charcuterie; wholesale to restaurants + retail. Small Cleveland producer.',
      signals:['Refrigerated meat → strict cold-chain','Restaurant wholesale drops','Micro/small — no fleet'], url:'https://www.ohiocityprovisions.com/' },
    { company:"The Chef's Garden / Farmer Jones Farm", type:'manufacturer', category:'reefer', city:'Huron', state:'OH', segment:'small-producer',
      about:'Specialty produce grower shipping refrigerated to top restaurants & DTC nationwide. Small-mid producer.',
      signals:['Refrigerated specialty produce','Ships nationwide — outbound heavy','Cold-chain critical'], url:'https://www.chefs-garden.com/' },
    { company:'Bertman Foods (Ballpark Mustard)', type:'manufacturer', category:'dry', city:'Cleveland', state:'OH', segment:'small-producer',
      about:'Iconic Cleveland mustard/condiment maker; retail, stadium & foodservice. Small producer (dry/ambient).',
      signals:['Shelf-stable → dry van','Retail DC + stadium/foodservice','Small — carrier-dependent'], url:'https://www.ballparkmustard.com/' },

    /* ---- SNAP-MODEL LEADS ("Who We Run Next", 10/8/26) ----
     * Public facts only (sites, news, FMCSA SAFER). Contacts blank on purpose — paid enrichment gated.
     * group: cold | dry | overflow | other. */
    { company:"DeVitis Fine Italian Foods", type:"manufacturer", category:"reefer", city:"Akron", state:"OH", segment:"snap-model", group:"cold", about:"Fresh Italian subs & sandwiches made in its own commissary (plus house-made sausage); sold at 100+ locations incl. Summa Health, schools, grocers, gas stations, coffee shops. Closest copy of the SNAP model.", signals:["100+ wholesale locations incl. Summa Health + schools", "Added 1,750 sq ft of walk-in coolers/freezers to keep up", "No carrier registration on record"], url:"https://devitis.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Mitchell's Homemade Ice Cream", type:"manufacturer", category:"reefer", city:"Cleveland", state:"OH", segment:"snap-model", group:"cold", about:"Ice cream from one Ohio City kitchen (runs 7 AM–11 PM, 7 days) to its own shops + 59 grocery locations: Heinen's 18, Dave's 7, Giant Eagle Market District 7, Giant Eagle 3, Lucky's 2, independents.", signals:["Own delivery drivers: clock in by 6 AM, 6–7 days/wk", "59 grocery locations + own shops", "Hiring delivery drivers"], url:"https://www.mitchellshomemade.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Pierre's Ice Cream Co.", type:"manufacturer", category:"reefer", city:"Cleveland", state:"OH", segment:"snap-model", group:"cold", about:"Ice cream, frozen yogurt, sherbet, sorbet & novelties incl. private label at 6200 Euclid Ave (~0.5 mi from SNAP's kitchen). Own sub-zero DSD trucks. Owned by Ohio Processors since 2022.", signals:["FMCSA: 8 trucks / 8 drivers, 261,991 mi (2025), Ohio only", "Own direct-store-delivery program", "2nd-shift freezer pickers + weekend production posted"], url:"https://pierres.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Miceli Dairy Products", type:"manufacturer", category:"reefer", city:"Cleveland", state:"OH", segment:"snap-model", group:"cold", about:"Italian cheeses (ricotta, mozzarella, shreds, hard cheeses) at 2721 E 90th St. $13M cold/dry storage expansion (~50 jobs, June 2025); new mozzarella plant planned within 5 years.", signals:["FMCSA: 8 trucks / 8 drivers, 500,000 mi (2025), for-hire authority", "Was \"renting space all over the city\" for storage", "$13M expansion underway"], url:"https://www.miceli-dairy.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Hartville Kitchen", type:"manufacturer", category:"both", city:"Hartville", state:"OH", segment:"snap-model", group:"cold", about:"Salad dressings (refrigerated jars + shelf-stable bottles) and bakery goods; runs its own restaurant & bakery carry-out. Dressings sold in grocery produce departments across Ohio + several states (Acme carries it).", signals:["Refrigerated dressings in grocery produce depts", "Own restaurant + bakery", "No carrier registration on record"], url:"https://hartvillekitchen.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "330-877-9353", "linkedin": ""} },
    { company:"Malley's Chocolates", type:"manufacturer", category:"both", city:"Cleveland", state:"OH", segment:"snap-model", group:"cold", about:"Chocolates, truffles, fudge & bars from a 60,000 sq ft Brookpark Rd plant to its own 18 NE Ohio stores; 4 ice-cream parlors; corporate gifting + school/group fundraising (100+ box orders get free local delivery).", signals:["One plant → 18 stores", "Holiday peaks: shipping up to 5 business days", "Fundraiser pickups coordinated weekly"], url:"https://www.malleys.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Raddell's Sausage Shop", type:"manufacturer", category:"reefer", city:"Cleveland", state:"OH", segment:"snap-model", group:"cold", about:"Smoked Slovenian, Polish & Hungarian sausage at 478 E 152nd St; sold to restaurants, delis & grocers via Sysco, Oleksy Meats and Silver Star Meats; nationwide mail order.", signals:["Sells through Sysco + 2 meat distributors", "Refrigerated meat", "No carrier registration on record"], url:"https://www.raddells.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Garden of Flavor", type:"manufacturer", category:"reefer", city:"Cleveland", state:"OH", segment:"snap-model", group:"cold", about:"Organic cold-pressed juices made daily in its own refrigerated, GFSI-certified Cleveland plant; in \"many Whole Foods, Heinen's, Wegmans, Mariano's and other retailers.\"", signals:["Daily production, refrigerated", "Multiple grocery chains", "No carrier registration on record"], url:"https://gardenofflavor.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Country Pure Foods", type:"manufacturer", category:"both", city:"Akron", state:"OH", segment:"snap-model", group:"cold", about:"Juices, plant-based drinks & frozen novelties (Ardmore Farms, SideKicks, VBlend); Akron is 1 of 4 plants. Sells to K-12 schools, healthcare, restaurants & retail. Bought by Peterson Brands 12/2/25.", signals:["K-12 + healthcare = SNAP customer types", "FMCSA (Ohio Pure Foods): 1 truck / 1 driver, Ohio only", "24,000 sq ft cold storage built 2017"], url:"https://www.countrypure.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Superior Dairy", type:"manufacturer", category:"reefer", city:"Canton", state:"OH", segment:"snap-model", group:"cold", about:"Milk, cottage cheese, sour cream, ice cream mixes, 5-qt pails & ice cream cakes at 4719 Navarre Rd SW; mostly private label (Sam's Club, Costco, Aldi); distributed to 45 states. Owned by MMPA since 2022.", signals:["FMCSA: 2 trucks / 1 driver, 400,000 mi (2025)", "Private label for Sam’s, Costco, Aldi", "45-state distribution"], url:"https://www.superiordairy.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Gardner Pie Co.", type:"manufacturer", category:"reefer", city:"Akron", state:"OH", segment:"snap-model", group:"cold", about:"Unbaked, prebaked & thaw-and-sell frozen pies at 191 Logan Pkwy (family business since 1945); buyers order through frozen food distributors. Automated line (live 6/2024) takes capacity from 500K to an expected 8M pies/yr.", signals:["Capacity ramp 500K → 8M pies/yr", "Sells through frozen distributors", "No carrier registration on record"], url:"https://www.gardnerpie.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Biery Cheese", type:"manufacturer", category:"reefer", city:"Louisville", state:"OH", segment:"snap-model", group:"cold", about:"1B+ cheese slices/yr plus shreds, cubes, snack trays & plant-based cheese; private label + co-manufacturing for retailers, wholesalers, brands & food service.", signals:["1B+ slices/yr", "Private label + co-man", "No carrier registration on record"], url:"https://www.bierycheese.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Mid's Pasta Sauce", type:"manufacturer", category:"dry", city:"Navarre", state:"OH", segment:"snap-model", group:"dry", about:"12+ jarred pasta & pizza sauces; 320 stores in Cleveland/Akron/Canton ZIPs (Giant Eagle 92, Marc's 47, Discount Drug Mart 46, Walmart 41, Heinen's 32, Acme 17, Dave's 17) per its public store locator (10/7/26).", signals:["320 local stores", "FMCSA: 0 trucks (2010 record)", "Who delivers not stated"], url:"https://www.midssauce.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Bent Tree Coffee", type:"manufacturer", category:"dry", city:"Kent", state:"OH", segment:"snap-model", group:"dry", about:"Small-batch roasted coffee; Giant Eagle/Market District 19, Heinen's 16, Acme 9, Meijer 50+, Dave's, Lucky's, 8 local grocers, 11 cafes, 3 Kent State spots, 4 breweries/bars.", signals:["Grocery + campus + cafe stops", "Meijer 50+", "No carrier registration on record"], url:"https://www.benttreecoffee.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Rising Star Coffee Roasters", type:"manufacturer", category:"dry", city:"Cleveland", state:"OH", segment:"snap-model", group:"dry", about:"Roasted coffee at 3617 Walton Ave (roastery Mon–Thu 8–3, Fri 8–noon); its own 7 cafes plus wholesale to cafes & offices.", signals:["7 own cafes", "Wholesale cafes + offices", "Same block as CFH (Walton Ave)"], url:"https://risingstarcoffee.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Euclid Fish Company", type:"distributor", category:"reefer", city:"Mentor", state:"OH", segment:"snap-model", group:"overflow", about:"Cut-to-order fresh & frozen seafood plus meats, cheeses & specialty foods to restaurants, clubs, specialty grocers, hotels, casinos & GPOs in OH, W. PA, WV, N. KY.", signals:["FMCSA: 5 trucks / 11 drivers, 163,674 mi (2025)", "Hiring drivers (Mentor + Pittsburgh)", "2nd-shift warehouse role"], url:"https://www.euclidfish.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Serv-Ice Delivery Co.", type:"manufacturer", category:"reefer", city:"Akron", state:"OH", segment:"snap-model", group:"overflow", about:"Packaged ice & dry ice, 1621 E Market St (legal name Haller Enterprises Inc).", signals:["FMCSA: 9 trucks / 4 drivers, 200,000 mi (2024)", "More than 2x trucks vs drivers", "Ohio only"], url:"", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Instantwhip-Akron", type:"distributor", category:"reefer", city:"Stow", state:"OH", segment:"snap-model", group:"overflow", about:"Dairy & specialty foodservice distributor (4870 Hudson Dr) to restaurants, ice cream/custard shops, bakeries, coffee shops, c-stores, casinos & caterers across ~20 NE Ohio counties + Pittsburgh.", signals:["FMCSA: 17 trucks / 13 drivers, 292,263 mi (2025)", "4 more trucks than drivers", "Refrigerated"], url:"https://instantwhip.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Sirna & Sons Produce", type:"distributor", category:"both", city:"Ravenna", state:"OH", segment:"snap-model", group:"overflow", about:"Produce distributor + Christine's Cuts fresh-cut plant; delivers Mon–Sat to restaurants, hotels, country clubs & institutions in OH, central PA, northern WV. 2016 expansion added 50,000 sq ft cooler/dock space.", signals:["55 trucks (directory, undated)", "Open driver interviews every weekday 10–2", "Delivers Mon–Sat"], url:"https://sirnaandsonsproduce.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Sandridge Crafted Foods", type:"manufacturer", category:"reefer", city:"Medina", state:"OH", segment:"snap-model", group:"overflow", about:"Refrigerated deli salads, soups, sides, dips & entrées + private label for college & healthcare dining, retail delis & foodservice (SNAP-type channels). Uses MDS Inc. Logistics.", signals:["Related carrier MDS: 35 trucks / 35 drivers, for-hire", "Healthcare + college dining channels", "Overflow / last-mile only"], url:"https://www.sandridge.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Festa Food Company", type:"manufacturer", category:"reefer", city:"Cleveland", state:"OH", segment:"snap-model", group:"other", about:"Clean-label frozen meals at 3590 W 58th St (SQF Level 2): breakfasts, entrées, handhelds, burritos, medically tailored meals; private label + co-pack. Sells to schools, military/government, healthcare & senior living, retail, c-stores, foodservice; DTC launching 2026. New owner Festa Holdings (11/12/25).", signals:["Schools + healthcare + senior living = SNAP customer types", "New owner adding DTC in 2026", "No carrier registration on record"], url:"https://festafood.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Cleveland Wholesale Cash & Carry", type:"distributor", category:"both", city:"Cleveland", state:"OH", segment:"snap-model", group:"other", about:"Wholesale cash-and-carry at 3341 Superior Ave serving small/medium grocers, convenience stores, gas stations, restaurants, caterers & canteens. Delivery not stated.", signals:["Cash & carry — no delivery on record", "Same model we run for Restaurant Depot", "1.3 mi from SNAP base"], url:"", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "216-391-2274", "linkedin": ""} },
    { company:"Dean Supply Company", type:"distributor", category:"dry", city:"Cleveland", state:"OH", segment:"snap-model", group:"other", about:"Restaurant supply house at 3500 Woodland Ave (since 1950, 15,000+ products): equipment, disposables, cookware, bar, janitorial & party supplies; wholesale accounts. Own trucks daily in Cleveland plus FedEx/USPS/LTL.", signals:["Own trucks rolling through Cleveland daily", "Store Mon–Fri 9–5, Sat 10–4", "0.8 mi from SNAP base"], url:"https://www.shopatdean.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "216-325-0994", "linkedin": ""} },
    { company:"Randy's Artisanal Pickles", closing:true, type:"manufacturer", category:"dry", city:"Cleveland", state:"OH", segment:"snap-model", group:"other", about:"CLOSING per its website (rising ingredient, import-fee and shipping costs). Was in 300 stores / 8 states incl. Heinen's, Giant Eagle, Target (2017); UNFI item numbers. Team's next product: Guinness Steak Cuts (Sidari Artisan Brands).", signals:["CLOSING — check before outreach", "Next venture: Guinness Steak Cuts", "UNFI-distributed"], url:"https://randysartisanal.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
    { company:"Borden Dairy (Cleveland)", type:"manufacturer", category:"reefer", city:"Cleveland", state:"OH", segment:"snap-model", group:"other", about:"White & flavored milk, heavy cream; Cleveland plant 3068 W 106th St (2019). Grocery, c-store & drug-store channels (2019: Marc's, Dave's, Circle K, Walgreens, CVS, 7-Eleven, Pilot) + school milk program.", signals:["Carrier: Borden Transport Co of Ohio (dba Dairymens Milk Co)", "FMCSA: 109 trucks / 91 drivers, 3.7M mi (2025)", "18 more trucks than drivers"], url:"https://www.bordendairy.com/", contact:{"name": "", "title": "Owner / Operations Manager", "email": "", "phone": "", "linkedin": ""} },
  ];
  const seeded = R.map((p, i) => {
    const intel = Object.assign(deriveIntel(p), INTEL_OVERRIDES[p.company] || {});
    return Object.assign(p, { id:'pr_'+(70000+i), source:'research',
      contact:p.contact || { name:'', title:'Logistics / Transportation Manager', email:'', phone:'', linkedin:'' }, intel },
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
    if (f.keyword) { const hay=(p.company+' '+p.about+' '+p.type+' '+(p.segment==='snap-model'?'snap snap-model '+p.group:'')).toLowerCase(); if (!hay.includes(f.keyword.toLowerCase())) return false; }
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
