/* =============================================================================
 * FleetView — Unified Freight Load Schema + Sample Data
 * -----------------------------------------------------------------------------
 * Every connector (Direct Freight, 123Loadboard, future boards) normalizes its
 * raw payload into THIS shape. The UI only ever knows about this shape, so the
 * dashboard is board-agnostic — add a board = add an adapter, nothing else.
 * =========================================================================== */

/**
 * @typedef {Object} Load
 * @property {string}  id            Unique id (prefixed by source, e.g. "df_10234")
 * @property {string}  source        Board key: 'directfreight' | '123loadboard'
 * @property {Object}  origin        {city, state, lat, lng}
 * @property {Object}  destination   {city, state, lat, lng}
 * @property {string}  pickupDate    ISO date (YYYY-MM-DD)
 * @property {string}  deliveryDate  ISO date (YYYY-MM-DD)
 * @property {string}  equipment     Normalized equipment code (see EQUIPMENT)
 * @property {number}  weight        lbs
 * @property {number}  length        ft
 * @property {number}  miles         Loaded trip miles
 * @property {number}  rate          Total offered pay ($). 0 = "Call for rate"
 * @property {string}  fullPartial   'Full' | 'Partial'
 * @property {string}  commodity     Free text
 * @property {number}  ageMins       Minutes since posted
 * @property {Object}  broker        {name, phone, email, mc, creditScore, daysToPay}
 * @property {string}  notes         Free text
 * @property {string}  [url]         Link to the original post (Craigslist etc.)
 * @property {boolean} [local]       True for local gigs with no lane/miles
 * @property {string}  [payNote]     Human pay string for local gigs ("$28/hr")
 */

// Canonical equipment types (what the filter dropdown + normalizers map onto)
const EQUIPMENT = {
  V:  'Van (Dry)',
  R:  'Reefer',
  F:  'Flatbed',
  SD: 'Step Deck',
  HS: 'Hotshot',
  PO: 'Power Only',
  CV: 'Cargo Van',
  BOX:'Box Truck',
  RGN:'RGN / Lowboy',
};

// Rate-per-mile helper (guards against divide-by-zero / call-for-rate loads)
function rpm(load) {
  if (!load.rate || !load.miles) return 0;
  return load.rate / load.miles;
}

// SupplyNow target rate model (from Freight Calculator: $1.69/loaded mi)
const SUPPLYNOW_TARGET_RPM = 1.69;

/* ---------------------------------------------------------------------------
 * Sample loads — realistic freight across the SupplyNow footprint so the
 * dashboard is fully interactive before live API tokens are wired in.
 * Coordinates are real city centroids so the map renders correctly.
 * ------------------------------------------------------------------------- */
const CITY = {
  Cleveland:    { state: 'OH', lat: 41.4993, lng: -81.6944 },
  Youngstown:   { state: 'OH', lat: 41.0998, lng: -80.6495 },
  Columbus:     { state: 'OH', lat: 39.9612, lng: -82.9988 },
  Toledo:       { state: 'OH', lat: 41.6528, lng: -83.5379 },
  Akron:        { state: 'OH', lat: 41.0814, lng: -81.5190 },
  Cincinnati:   { state: 'OH', lat: 39.1031, lng: -84.5120 },
  Pittsburgh:   { state: 'PA', lat: 40.4406, lng: -79.9959 },
  Erie:         { state: 'PA', lat: 42.1292, lng: -80.0851 },
  Philadelphia: { state: 'PA', lat: 39.9526, lng: -75.1652 },
  Chicago:      { state: 'IL', lat: 41.8781, lng: -87.6298 },
  Indianapolis: { state: 'IN', lat: 39.7684, lng: -86.1581 },
  Detroit:      { state: 'MI', lat: 42.3314, lng: -83.0458 },
  GrandRapids:  { state: 'MI', lat: 42.9634, lng: -85.6681 },
  Louisville:   { state: 'KY', lat: 38.2527, lng: -85.7585 },
  Nashville:    { state: 'TN', lat: 36.1627, lng: -86.7816 },
  Buffalo:      { state: 'NY', lat: 42.8864, lng: -78.8784 },
  Charlotte:    { state: 'NC', lat: 35.2271, lng: -80.8431 },
  Atlanta:      { state: 'GA', lat: 33.7490, lng: -84.3880 },
  StLouis:      { state: 'MO', lat: 38.6270, lng: -90.1994 },
  Milwaukee:    { state: 'WI', lat: 43.0389, lng: -87.9065 },
};

function place(name) {
  const c = CITY[name];
  return { city: name.replace(/([a-z])([A-Z])/g, '$1 $2'), state: c.state, lat: c.lat, lng: c.lng };
}

// Great-circle miles → padded to approximate road miles (×1.18)
function estMiles(a, b) {
  const R = 3958.8, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.18);
}

const BROKERS = [
  { name: 'Nolan Transportation Group', phone: '866-665-9047', email: 'loads@ntgfreight.com', mc: 'MC-518308', creditScore: 96, daysToPay: 21 },
  { name: 'TQL — Total Quality Logistics', phone: '800-580-3101', email: 'carrier@tql.com',    mc: 'MC-505903', creditScore: 98, daysToPay: 30 },
  { name: 'Coyote Logistics',            phone: '877-626-9683', email: 'ops@coyote.com',       mc: 'MC-561188', creditScore: 95, daysToPay: 30 },
  { name: 'Echo Global Logistics',       phone: '800-354-7993', email: 'carriers@echo.com',    mc: 'MC-486053', creditScore: 93, daysToPay: 28 },
  { name: 'Arrive Logistics',            phone: '888-861-0650', email: 'carrier@arrive.com',   mc: 'MC-948731', creditScore: 91, daysToPay: 25 },
  { name: 'Midwest Regional Freight',    phone: '330-555-0142', email: 'dispatch@mwrf.com',    mc: 'MC-771204', creditScore: 84, daysToPay: 35 },
];

// Deterministic pseudo-random so the sample set is stable between reloads
let _seed = 42;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function between(a, b) { return a + rnd() * (b - a); }

function buildSampleLoads() {
  const lanes = [
    ['Cleveland','Chicago','R','Frozen foods'],
    ['Youngstown','Pittsburgh','V','Consumer goods'],
    ['Columbus','Indianapolis','V','Retail freight'],
    ['Cleveland','Detroit','F','Steel coils'],
    ['Pittsburgh','Philadelphia','V','Packaged goods'],
    ['Akron','Nashville','R','Dairy'],
    ['Toledo','GrandRapids','V','Auto parts'],
    ['Cincinnati','Louisville','BOX','LTL consolidation'],
    ['Cleveland','Buffalo','R','Produce'],
    ['Columbus','Charlotte','F','Building materials'],
    ['Chicago','Cleveland','V','E-commerce'],
    ['Indianapolis','Columbus','V','Paper products'],
    ['Detroit','Youngstown','PO','Trailer repo'],
    ['Pittsburgh','Erie','HS','Machined parts'],
    ['Nashville','Atlanta','R','Beverages'],
    ['StLouis','Chicago','V','Packaged food'],
    ['Milwaukee','Cleveland','R','Cheese'],
    ['Cleveland','Cincinnati','V','Restaurant supply'],
    ['Erie','Cleveland','SD','Equipment'],
    ['Louisville','Indianapolis','V','Appliances'],
    ['Charlotte','Pittsburgh','F','Lumber'],
    ['Atlanta','Nashville','V','Textiles'],
    ['GrandRapids','Chicago','R','Frozen'],
    ['Buffalo','Cleveland','V','Industrial'],
    ['Cleveland','Columbus','BOX','Foodservice'],
    ['Philadelphia','Pittsburgh','V','Pharma (non-controlled)'],
    ['Indianapolis','StLouis','F','Coils'],
    ['Chicago','Milwaukee','V','Retail'],
    ['Cincinnati','Cleveland','R','Meat'],
    ['Detroit','Chicago','PO','Power only'],
    ['Youngstown','Columbus','V','General freight'],
    ['Toledo','Cleveland','CV','Expedited parts'],
    ['Columbus','Pittsburgh','V','Palletized goods'],
    ['Nashville','Louisville','R','Ice cream'],
    ['Cleveland','Philadelphia','R','Seafood'],
    ['Akron','Chicago','V','Rubber products'],
    ['Pittsburgh','Cleveland','HS','Hot parts'],
    ['StLouis','Indianapolis','V','Consumer'],
    ['GrandRapids','Detroit','BOX','Local distro'],
    ['Cincinnati','Atlanta','R','Poultry'],
  ];

  const today = new Date('2026-08-01');
  const iso = (d) => d.toISOString().slice(0,10);

  return lanes.map((lane, i) => {
    const [o, d, eq, commodity] = lane;
    const origin = place(o), destination = place(d);
    const miles = estMiles(origin, destination);
    // Rate anchored near a realistic market RPM with noise; some "call for rate"
    const marketRpm = between(1.55, 2.95);
    const callForRate = rnd() < 0.10;
    const rate = callForRate ? 0 : Math.round((miles * marketRpm) / 5) * 5;
    const source = rnd() < 0.5 ? 'directfreight' : '123loadboard';
    const pickOffset = Math.floor(between(0, 3));
    const pu = new Date(today); pu.setDate(pu.getDate() + pickOffset);
    const del = new Date(pu);   del.setDate(del.getDate() + Math.max(1, Math.round(miles/550)));

    return {
      id: `${source === 'directfreight' ? 'df' : 'lb'}_${10000 + i}`,
      source,
      origin, destination,
      pickupDate: iso(pu),
      deliveryDate: iso(del),
      equipment: eq,
      weight: Math.round(between(4, 44) * 1000),
      length: eq === 'BOX' || eq === 'CV' ? 26 : eq === 'HS' ? 40 : 53,
      miles,
      rate,
      fullPartial: eq === 'BOX' || eq === 'CV' || rnd() < 0.15 ? 'Partial' : 'Full',
      commodity,
      ageMins: Math.floor(between(1, 340)),
      broker: pick(BROKERS),
      notes: rnd() < 0.3 ? 'No touch. Drop trailer available.' : '',
    };
  }).concat(buildCraigslistSamples());
}

/* ---------------------------------------------------------------------------
 * Craigslist NE-Ohio local gigs — seeded from real postings scraped from the
 * Cleveland gigs/labor/transportation categories. Local gigs have no lane or
 * trip miles (miles:0, local:true); pay is a human string in payNote.
 * ------------------------------------------------------------------------- */
const CL_SUBURB = {
  'Brook Park':       { lat:41.3984, lng:-81.8043 },
  'Brooklyn Heights': { lat:41.4356, lng:-81.6790 },
  'Richfield':        { lat:41.2378, lng:-81.6379 },
  'Parma':            { lat:41.4048, lng:-81.7229 },
  'North Olmsted':    { lat:41.4158, lng:-81.9235 },
  'Strongsville':     { lat:41.3145, lng:-81.8357 },
  'Cleveland':        { lat:41.4993, lng:-81.6944 },
  'Maple Heights':    { lat:41.4153, lng:-81.5665 },
};
const CL_CAT = {
  ggg: 'https://www.craigslist.org/search/area/cleveland?cat=ggg',
  lbs: 'https://www.craigslist.org/search/area/cleveland?cat=lbs',
  trp: 'https://www.craigslist.org/search/area/cleveland?cat=trp',
};

function buildCraigslistSamples() {
  // [title, suburb, equipment, rate($ or 0), payNote, ageMins, category]
  const gigs = [
    ['Box truck driver — recurring contract route', 'Brook Park', 'BOX', 0, 'Contract · pay DOE', 38, 'trp'],
    ['Tire delivery route — 16ft box truck owner/driver', 'Cleveland', 'BOX', 0, 'Per-route · recurring', 95, 'trp'],
    ['Auto parts delivery driver', 'Brooklyn Heights', 'CV', 0, 'Recurring route', 142, 'trp'],
    ['Appliance delivery — independent contractor', 'Richfield', 'BOX', 0, 'IC · per-stop', 176, 'trp'],
    ['Cargo / sprinter van owner-operators needed', 'Cleveland', 'CV', 0, 'Owner-operator', 60, 'trp'],
    ['Movers needed ASAP — same day', 'Parma', 'BOX', 0, '$28/hr', 22, 'ggg'],
    ['RV / trailer / boat / vehicle hauling', 'Cleveland', 'HS', 0, 'Per-job · 48 states', 210, 'lbs'],
    ['Studio / 1-BR move specialist w/ truck', 'Strongsville', 'BOX', 300, '$300–350 flat', 130, 'lbs'],
    ['Own-vehicle delivery route', 'Cleveland', 'CV', 75, '$75–140+ / route', 48, 'ggg'],
    ['Delivery driver — recurring', 'Maple Heights', 'CV', 0, 'Recurring', 158, 'trp'],
  ];
  return gigs.map((g, i) => {
    const [title, suburb, eq, rate, payNote, ageMins, cat] = g;
    const c = CL_SUBURB[suburb];
    const loc = { city: suburb, state: 'OH', lat: c.lat, lng: c.lng };
    return {
      id: `cl_${20000 + i}`,
      source: 'craigslist',
      origin: loc,
      destination: { city: 'Local — NE Ohio', state: 'OH', lat: c.lat, lng: c.lng },
      pickupDate: '', deliveryDate: '',
      equipment: eq,
      weight: 0, length: 0, miles: 0,
      rate,
      fullPartial: 'Local',
      commodity: title,
      ageMins,
      broker: { name: 'Craigslist post', phone: '', email: '', mc: '', creditScore: null, daysToPay: null },
      notes: payNote,
      url: CL_CAT[cat],
      local: true,
      payNote,
    };
  });
}
