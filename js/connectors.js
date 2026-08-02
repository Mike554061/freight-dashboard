/* =============================================================================
 * FleetView — Board Connectors
 * -----------------------------------------------------------------------------
 * Each board is an adapter with two responsibilities:
 *   1) buildQuery(filters)  -> the board-native request payload
 *   2) normalize(raw)       -> Load[]  (our unified schema.js shape)
 *
 * MODE: flip CONFIG.useMock=false and set CONFIG.proxyUrl once you have tokens.
 * When live, the browser NEVER calls the boards directly (CORS + token secrecy).
 * It calls the Apps Script proxy (proxy/Code.gs), which holds the tokens and
 * returns already-normalized Load[]. The adapters below double as the reference
 * for what the proxy does server-side.
 * =========================================================================== */

const CONFIG = {
  useMock: true,                         // ← set false when proxy + tokens are live
  proxyUrl: '',                          // ← paste your Apps Script /exec URL here
  sources: {                             // toggle boards on/off in the UI
    directfreight: { label: 'Direct Freight', enabled: true,  delayNote: '' },
    '123loadboard':{ label: '123Loadboard',   enabled: false, delayNote: 'Free tier: ~15 min delayed' },
    craigslist:    { label: 'Craigslist · NE Ohio', enabled: true, delayNote: 'Local gigs' },
  },
};

/* -------------------------------------------------------------------------
 * Direct Freight — https://github.com/Direct-Freight/df-api-docs
 * POST /boards/{board_type}  with these filter params (per swagger):
 *   origin_city, origin_state, origin_radius, destination_city,
 *   destination_state, destination_radius, min/max_weight, min/max_length,
 *   trailer_type, min/max_pay_rate, max_tripmiles, max_age, full_load,
 *   sort_parameter, sort_direction, page_number, item_count
 * Auth headers: api-token (partner) + end-user-token (session).  <-- proxy holds these
 * ---------------------------------------------------------------------- */
const DirectFreightAdapter = {
  key: 'directfreight',

  // Our equipment codes -> Direct Freight trailer_type values
  equipMap: { V:'Van', R:'Reefer', F:'Flatbed', SD:'Step Deck', HS:'Hotshot',
              PO:'Power Only', CV:'Cargo Van', BOX:'Box Truck', RGN:'RGN' },

  buildQuery(f) {
    const q = { page_number: 1, item_count: 100, sort_parameter: 'age', sort_direction: 'asc' };
    if (f.originCity)   q.origin_city = f.originCity;
    if (f.originState)  q.origin_state = f.originState;
    if (f.originRadius) q.origin_radius = f.originRadius;
    if (f.destCity)     q.destination_city = f.destCity;
    if (f.destState)    q.destination_state = f.destState;
    if (f.destRadius)   q.destination_radius = f.destRadius;
    if (f.equipment)    q.trailer_type = this.equipMap[f.equipment] || f.equipment;
    if (f.minWeight)    q.min_weight = f.minWeight;
    if (f.maxWeight)    q.max_weight = f.maxWeight;
    if (f.minRate)      q.min_pay_rate = f.minRate;
    if (f.maxRate)      q.max_pay_rate = f.maxRate;
    if (f.maxMiles)     q.max_tripmiles = f.maxMiles;
    if (f.maxAgeMins)   q.max_age = Math.round(f.maxAgeMins);
    if (f.fullOnly)     q.full_load = true;
    return q;
  },

  // Reverse-map a Direct Freight trailer string -> our equipment code
  _equipFrom(s='') {
    const t = s.toLowerCase();
    if (t.includes('reefer')) return 'R';
    if (t.includes('flat'))   return 'F';
    if (t.includes('step'))   return 'SD';
    if (t.includes('hot'))    return 'HS';
    if (t.includes('power'))  return 'PO';
    if (t.includes('cargo'))  return 'CV';
    if (t.includes('box'))    return 'BOX';
    if (t.includes('rgn') || t.includes('lowboy')) return 'RGN';
    return 'V';
  },

  normalize(raw) {
    // raw.loads[] per swagger board response
    return (raw.loads || raw.results || []).map(r => ({
      id: `df_${r.entry_id || r.id}`,
      source: 'directfreight',
      origin:      { city: r.origin_city,      state: r.origin_state,      lat: +r.origin_lat,      lng: +r.origin_lng },
      destination: { city: r.destination_city, state: r.destination_state, lat: +r.destination_lat, lng: +r.destination_lng },
      pickupDate:   r.pickup_date || r.available_date,
      deliveryDate: r.delivery_date || '',
      equipment:    this._equipFrom(r.trailer_type),
      weight:       +r.weight || 0,
      length:       +r.length || 0,
      miles:        +r.trip_miles || +r.miles || 0,
      rate:         +r.pay_rate || +r.rate || 0,
      fullPartial:  r.full_load ? 'Full' : 'Partial',
      commodity:    r.commodity || '',
      ageMins:      +r.age_minutes || 0,
      broker: {
        name: r.company_name, phone: r.contact_phone, email: r.contact_email,
        mc: r.mc_number, creditScore: +r.credit_score || null, daysToPay: +r.days_to_pay || null,
      },
      notes: r.comments || '',
    }));
  },
};

/* -------------------------------------------------------------------------
 * 123Loadboard — https://www.123loadboard.com/api/
 * Partner API (approval + assigned tech lead). Exact field names finalize
 * during onboarding, so the mapping below is intentionally defensive: it
 * reads several likely field aliases and is easy to lock down once the
 * integration doc is in hand. Free tier returns loads ~15 min delayed.
 * ---------------------------------------------------------------------- */
const Loadboard123Adapter = {
  key: '123loadboard',
  equipMap: { V:'Van', R:'Reefer', F:'Flatbed', SD:'StepDeck', HS:'Hotshot',
              PO:'PowerOnly', CV:'CargoVan', BOX:'BoxTruck', RGN:'RGN' },

  buildQuery(f) {
    // 123LB uses an equivalent search contract; names TBD at onboarding.
    const q = { maxResults: 100, sortBy: 'age' };
    if (f.originCity)  q.originCity = f.originCity;
    if (f.originState) q.originState = f.originState;
    if (f.originRadius)q.originRadius = f.originRadius;
    if (f.destCity)    q.destinationCity = f.destCity;
    if (f.destState)   q.destinationState = f.destState;
    if (f.destRadius)  q.destinationRadius = f.destRadius;
    if (f.equipment)   q.equipmentType = this.equipMap[f.equipment] || f.equipment;
    if (f.minWeight)   q.minWeight = f.minWeight;
    if (f.maxWeight)   q.maxWeight = f.maxWeight;
    if (f.maxMiles)    q.maxLength = f.maxMiles;
    return q;
  },

  normalize(raw) {
    return (raw.loads || raw.items || []).map(r => ({
      id: `lb_${r.id || r.loadId}`,
      source: '123loadboard',
      origin:      { city: r.originCity || r.origin?.city, state: r.originState || r.origin?.state, lat: +(r.originLat ?? r.origin?.lat), lng: +(r.originLng ?? r.origin?.lng) },
      destination: { city: r.destinationCity || r.destination?.city, state: r.destinationState || r.destination?.state, lat: +(r.destinationLat ?? r.destination?.lat), lng: +(r.destinationLng ?? r.destination?.lng) },
      pickupDate:   r.pickupDate || r.availableDate,
      deliveryDate: r.deliveryDate || '',
      equipment:    (r.equipmentType || 'V').toString().charAt(0).toUpperCase() === 'R' ? 'R' : 'V',
      weight:       +r.weight || 0,
      length:       +r.length || 0,
      miles:        +r.miles || +r.tripMiles || 0,
      rate:         +r.rate || +r.payRate || 0,
      fullPartial:  r.fullPartial || (r.partial ? 'Partial' : 'Full'),
      commodity:    r.commodity || '',
      ageMins:      +r.ageMinutes || 0,
      broker: {
        name: r.companyName || r.brokerName, phone: r.phone, email: r.email,
        mc: r.mcNumber, creditScore: +r.creditScore || null, daysToPay: +r.daysToPay || null,
      },
      notes: r.comments || '',
    }));
  },
};

/* -------------------------------------------------------------------------
 * Craigslist — NE Ohio local freight/hauling gigs.
 * Fully scrapeable, NO login: each category exposes an RSS feed
 * (…?format=rss) the proxy parses server-side. Gigs have no lane/miles, so
 * they normalize as local:true loads (miles:0) whose commodity is the post
 * title and whose url links back to the original listing.
 * Categories: ggg=gigs, lbs=labor/hauling/moving, trp=transportation.
 * ---------------------------------------------------------------------- */
const CraigslistAdapter = {
  key: 'craigslist',
  // Only surface transport-relevant posts; the proxy filters on these terms.
  keywords: ['box truck','cargo van','sprinter','delivery','courier','hauling',
             'haul','mover','moving','freight','driver','route','hotshot','pallet'],

  buildQuery(f) {
    // Craigslist search params (the proxy appends format=rss per category).
    const q = { cats: ['trp','ggg','lbs'] };
    if (f.originCity) q.query = f.originCity;       // free-text search
    return q;
  },

  _equipFrom(title='') {
    const t = title.toLowerCase();
    if (t.includes('cargo van')||t.includes('sprinter')||t.includes('minivan')) return 'CV';
    if (t.includes('box truck')||t.includes('16ft')||t.includes('26ft')) return 'BOX';
    if (t.includes('hotshot')||t.includes('hot shot')||t.includes('trailer')||t.includes('rv')||t.includes('boat')) return 'HS';
    return 'BOX';
  },

  // raw = array of RSS items {title, link, location, date, description}
  normalize(raw) {
    return (raw.items || []).map((r, i) => ({
      id: `cl_${r.id || i}`,
      source: 'craigslist',
      origin:      { city: r.location || 'Cleveland', state: 'OH', lat: +r.lat || 41.4993, lng: +r.lng || -81.6944 },
      destination: { city: 'Local — NE Ohio', state: 'OH', lat: +r.lat || 41.4993, lng: +r.lng || -81.6944 },
      pickupDate: '', deliveryDate: '',
      equipment: this._equipFrom(r.title),
      weight: 0, length: 0, miles: 0,
      rate: 0,
      fullPartial: 'Local',
      commodity: r.title,
      ageMins: +r.ageMins || 0,
      broker: { name: 'Craigslist post', phone: '', email: '', mc: '', creditScore: null, daysToPay: null },
      notes: r.pay || '',
      url: r.link,
      local: true,
      payNote: r.pay || '',
    }));
  },
};

const ADAPTERS = {
  directfreight: DirectFreightAdapter,
  '123loadboard': Loadboard123Adapter,
  craigslist: CraigslistAdapter,
};

/* -------------------------------------------------------------------------
 * fetchLoads(filters) — the single entry point the UI calls.
 * Mock mode: filters the local sample set (so every filter is testable now).
 * Live mode: one GET to the proxy with the active sources + filter JSON; the
 * proxy fans out to each board, normalizes, and returns a merged Load[].
 * ---------------------------------------------------------------------- */
async function fetchLoads(filters) {
  const activeSources = Object.entries(CONFIG.sources)
    .filter(([, s]) => s.enabled).map(([k]) => k);

  if (CONFIG.useMock) {
    await new Promise(r => setTimeout(r, 250)); // simulate latency
    const all = buildSampleLoads().filter(l => activeSources.includes(l.source));
    return { loads: applyClientFilters(all, filters), live: false, ts: Date.now() };
  }

  // LIVE
  const url = `${CONFIG.proxyUrl}?sources=${encodeURIComponent(activeSources.join(','))}`
            + `&filters=${encodeURIComponent(JSON.stringify(filters))}`;
  const res = await fetch(url);                    // GET avoids CORS preflight
  if (!res.ok) throw new Error(`Proxy ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { loads: applyClientFilters(data.loads || [], filters), live: true, ts: Date.now() };
}

/* Client-side filtering. In mock mode this IS the filter engine; in live mode
 * it's a second-pass refine on top of what the boards already narrowed. */
function applyClientFilters(loads, f) {
  return loads.filter(l => {
    if (f.originState && l.origin.state !== f.originState) return false;
    if (f.destState   && l.destination.state !== f.destState) return false;
    if (f.originCity  && !l.origin.city.toLowerCase().includes(f.originCity.toLowerCase())) return false;
    if (f.destCity    && !l.destination.city.toLowerCase().includes(f.destCity.toLowerCase())) return false;
    if (f.equipment   && l.equipment !== f.equipment) return false;
    if (f.minWeight   && l.weight < f.minWeight) return false;
    if (f.maxWeight   && l.weight > f.maxWeight) return false;
    if (f.minRate     && l.rate && l.rate < f.minRate) return false;
    if (f.maxRate     && l.rate && l.rate > f.maxRate) return false;
    if (f.maxMiles    && l.miles > f.maxMiles) return false;
    if (f.minRpm      && rpm(l) && rpm(l) < f.minRpm) return false;
    if (f.maxAgeMins  && l.ageMins > f.maxAgeMins) return false;
    if (f.fullOnly    && l.fullPartial !== 'Full') return false;
    if (f.hideCallForRate && !l.rate) return false;
    return true;
  });
}
