/* =============================================================================
 * FleetView Proxy — Apps Script Web App
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS
 *   - Load-board APIs are token-secured and CORS-locked. A browser can't (and
 *     shouldn't) call them directly — the api-token would be exposed in JS.
 *   - This proxy holds the tokens in Script Properties, calls each board
 *     server-side, normalizes to the unified Load shape, and returns merged JSON.
 *
 * SETUP (one time)
 *   1. Deploy > New deployment > Web app > Execute as: Me,
 *      Who has access: Anyone.  Copy the /exec URL.
 *   2. Paste that URL into js/connectors.js  ->  CONFIG.proxyUrl, and set
 *      CONFIG.useMock = false.
 *   3. Run setup() ONCE from the editor after filling the tokens below,
 *      OR set them via Project Settings > Script Properties:
 *        DF_API_TOKEN         (Direct Freight partner token)
 *        DF_USER, DF_PASS     (Direct Freight end-user creds -> session token)
 *        LB123_API_KEY        (123Loadboard API key, once approved)
 *
 * GET params from the frontend:  ?sources=directfreight,123loadboard&filters={json}
 * Optional bid action:           ?action=bid  with POST body {loadId,rate,message}
 * =========================================================================== */

function setup() {
  // Fill these, run once, then DELETE the values from this function.
  const p = PropertiesService.getScriptProperties();
  p.setProperties({
    DF_API_TOKEN: 'PASTE_DIRECT_FREIGHT_PARTNER_TOKEN',
    DF_USER:      'PASTE_DF_END_USER_LOGIN',
    DF_PASS:      'PASTE_DF_END_USER_PASSWORD',
    LB123_API_KEY:'PASTE_123LOADBOARD_KEY',
  });
  Logger.log('Script properties set. Remove the literals from setup() now.');
}

function doGet(e) {
  const params = e.parameter || {};

  // Opportunity Pipeline (SAM.gov federal solicitations) — ?action=opps
  if (params.action === 'opps') {
    var of = {}; try { of = JSON.parse(params.filters || '{}'); } catch (_) {}
    try { return json({ opps: fetchSamGov(of), ts: Date.now() }); }
    catch (err) { return json({ opps: [], error: String(err) }); }
  }

  const sources = (params.sources || 'directfreight,123loadboard').split(',');
  let filters = {};
  try { filters = JSON.parse(params.filters || '{}'); } catch (_) {}

  const loads = [];
  const errors = {};
  sources.forEach(src => {
    try {
      if (src === 'directfreight')      loads.push.apply(loads, fetchDirectFreight(filters));
      else if (src === '123loadboard')  loads.push.apply(loads, fetch123Loadboard(filters));
      else if (src === 'craigslist')    loads.push.apply(loads, fetchCraigslist(filters));
    } catch (err) {
      errors[src] = String(err);
    }
  });

  return json({ loads: loads, errors: errors, ts: Date.now() });
}

/* ---------------- Direct Freight ---------------- */
function fetchDirectFreight(f) {
  const p = PropertiesService.getScriptProperties();
  const apiToken = p.getProperty('DF_API_TOKEN');
  if (!apiToken) throw new Error('DF_API_TOKEN not set');

  const userToken = getDfUserToken_(apiToken, p);
  const base = 'https://api.directfreight.com';   // confirm host at apidocs.directfreight.com

  const body = {
    page_number: 1, item_count: 100, sort_parameter: 'age', sort_direction: 'asc',
  };
  if (f.originCity)  body.origin_city = f.originCity;
  if (f.originState) body.origin_state = f.originState;
  if (f.originRadius)body.origin_radius = f.originRadius;
  if (f.destCity)    body.destination_city = f.destCity;
  if (f.destState)   body.destination_state = f.destState;
  if (f.destRadius)  body.destination_radius = f.destRadius;
  if (f.minWeight)   body.min_weight = f.minWeight;
  if (f.maxWeight)   body.max_weight = f.maxWeight;
  if (f.minRate)     body.min_pay_rate = f.minRate;
  if (f.maxRate)     body.max_pay_rate = f.maxRate;
  if (f.maxMiles)    body.max_tripmiles = f.maxMiles;
  if (f.fullOnly)    body.full_load = true;

  const res = UrlFetchApp.fetch(base + '/boards/load', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-token': apiToken, 'end-user-token': userToken },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 400) throw new Error('DF ' + res.getResponseCode() + ': ' + res.getContentText().slice(0,200));
  const data = JSON.parse(res.getContentText());

  return (data.loads || data.results || []).map(function(r){
    return {
      id: 'df_' + (r.entry_id || r.id),
      source: 'directfreight',
      origin:      { city:r.origin_city, state:r.origin_state, lat:+r.origin_lat, lng:+r.origin_lng },
      destination: { city:r.destination_city, state:r.destination_state, lat:+r.destination_lat, lng:+r.destination_lng },
      pickupDate: r.pickup_date || r.available_date || '',
      deliveryDate: r.delivery_date || '',
      equipment: dfEquip_(r.trailer_type),
      weight: +r.weight || 0, length: +r.length || 0,
      miles: +r.trip_miles || +r.miles || 0,
      rate: +r.pay_rate || +r.rate || 0,
      fullPartial: r.full_load ? 'Full' : 'Partial',
      commodity: r.commodity || '',
      ageMins: +r.age_minutes || 0,
      broker: { name:r.company_name, phone:r.contact_phone, email:r.contact_email,
                mc:r.mc_number, creditScore:+r.credit_score||null, daysToPay:+r.days_to_pay||null },
      notes: r.comments || '',
    };
  });
}

// Direct Freight end-user session token (cached up to ~20h)
function getDfUserToken_(apiToken, p) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('DF_USER_TOKEN');
  if (hit) return hit;
  const res = UrlFetchApp.fetch('https://api.directfreight.com/auth', {
    method: 'post', contentType: 'application/json',
    headers: { 'api-token': apiToken },
    payload: JSON.stringify({ username: p.getProperty('DF_USER'), password: p.getProperty('DF_PASS') }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 400) throw new Error('DF auth failed: ' + res.getContentText().slice(0,160));
  const tok = JSON.parse(res.getContentText()).end_user_token || JSON.parse(res.getContentText()).token;
  cache.put('DF_USER_TOKEN', tok, 72000); // 20h
  return tok;
}

function dfEquip_(s) {
  s = (s || '').toLowerCase();
  if (s.indexOf('reefer')>-1) return 'R';
  if (s.indexOf('flat')>-1)   return 'F';
  if (s.indexOf('step')>-1)   return 'SD';
  if (s.indexOf('hot')>-1)    return 'HS';
  if (s.indexOf('power')>-1)  return 'PO';
  if (s.indexOf('cargo')>-1)  return 'CV';
  if (s.indexOf('box')>-1)    return 'BOX';
  if (s.indexOf('rgn')>-1 || s.indexOf('lowboy')>-1) return 'RGN';
  return 'V';
}

/* ---------------- 123Loadboard ----------------
 * Fill in once your partner onboarding gives you the endpoint + auth scheme.
 * Structure mirrors Direct Freight: build query -> fetch -> normalize.
 * ------------------------------------------------------------------------ */
function fetch123Loadboard(f) {
  const key = PropertiesService.getScriptProperties().getProperty('LB123_API_KEY');
  if (!key) return [];  // silently skip until the key exists

  // TODO(onboarding): replace host + path + auth header with the real contract.
  // const res = UrlFetchApp.fetch('https://api.123loadboard.com/loads/search?...', {
  //   headers: { 'Authorization': 'Bearer ' + key }, muteHttpExceptions: true });
  // return normalize123_(JSON.parse(res.getContentText()));
  return [];
}

/* ---------------- Craigslist (NE Ohio local gigs, NO login) ----------------
 * Each Craigslist category exposes an RSS feed at ?format=rss. We pull the
 * transportation (trp), gigs (ggg), and labor/hauling (lbs) feeds for the
 * Cleveland region, keep only transport-relevant titles, and normalize to
 * local:true loads. No token, no auth — pure server-side UrlFetch + XML parse.
 * -------------------------------------------------------------------------- */
function fetchCraigslist(f) {
  var KEYWORDS = ['box truck','cargo van','sprinter','delivery','courier','hauling',
                  'haul','mover','moving','freight','driver','route','hotshot',
                  'hot shot','pallet','trailer','dispatch'];
  var feeds = [
    'https://cleveland.craigslist.org/search/trp?format=rss',
    'https://cleveland.craigslist.org/search/ggg?format=rss',
    'https://cleveland.craigslist.org/search/lbs?format=rss',
  ];
  var out = [], seen = {};
  feeds.forEach(function(url) {
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      if (res.getResponseCode() >= 400) return;
      var items = parseRssItems_(res.getContentText());
      items.forEach(function(it) {
        var title = (it.title || '').trim();
        var low = title.toLowerCase();
        var hit = KEYWORDS.some(function(k){ return low.indexOf(k) > -1; });
        if (!hit || seen[it.link]) return;
        seen[it.link] = true;
        out.push({
          id: 'cl_' + Utilities.base64EncodeWebSafe(it.link).slice(0, 10),
          source: 'craigslist',
          origin:      { city: 'Cleveland', state: 'OH', lat: 41.4993, lng: -81.6944 },
          destination: { city: 'Local — NE Ohio', state: 'OH', lat: 41.4993, lng: -81.6944 },
          pickupDate: '', deliveryDate: '',
          equipment: clEquip_(low),
          weight: 0, length: 0, miles: 0, rate: 0,
          fullPartial: 'Local',
          commodity: title,
          ageMins: 0,
          broker: { name: 'Craigslist post', phone: '', email: '', mc: '', creditScore: null, daysToPay: null },
          notes: '', url: it.link, local: true, payNote: clPay_(title),
        });
      });
    } catch (e) { /* skip a failing feed */ }
  });
  return out;
}

function parseRssItems_(xml) {
  // Craigslist RSS is RDF; items are <item ...>…<title>…</title><link>…</link></item>
  var items = [];
  var re = /<item[\s\S]*?<\/item>/g, m;
  while ((m = re.exec(xml)) !== null) {
    var block = m[0];
    var t = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    var l = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    if (!l) { var about = block.match(/rdf:about="([^"]+)"/); if (about) l = about[1]; }
    items.push({ title: decodeXml_(t), link: (l || '').trim() });
  }
  return items;
}
function decodeXml_(s) {
  return s.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
          .replace(/&gt;/g,'>').replace(/&#x27;|&apos;/g,"'").replace(/&quot;/g,'"');
}
function clEquip_(t) {
  if (t.indexOf('cargo van')>-1||t.indexOf('sprinter')>-1) return 'CV';
  if (t.indexOf('box truck')>-1||t.indexOf('16ft')>-1||t.indexOf('26ft')>-1) return 'BOX';
  if (t.indexOf('hotshot')>-1||t.indexOf('hot shot')>-1||t.indexOf('trailer')>-1) return 'HS';
  return 'BOX';
}
function clPay_(t) {  // pull a $ figure or /hr out of the title if present
  var m = t.match(/\$\s?\d[\d,\.]*(\s?\/\s?(hr|hour|route|day|load))?/i);
  return m ? m[0].replace(/\s+/g,'') : '';
}

/* ---------------- SAM.gov federal opportunities (real public API) ----------
 * Docs: https://open.gsa.gov/api/get-opportunities-public-api/
 * GET https://api.sam.gov/opportunities/v2/search
 *   api_key (required, free from sam.gov Account Details),
 *   postedFrom/postedTo (MM/dd/yyyy, required, <=1yr), ncode (NAICS),
 *   state (place of performance), ptype (o/p/k/r/s/a), title (keyword),
 *   limit (<=1000), offset.
 * We query the freight NAICS set and merge. Set SAM_API_KEY in Script Properties.
 * -------------------------------------------------------------------------- */
function fetchSamGov(f) {
  var key = PropertiesService.getScriptProperties().getProperty('SAM_API_KEY');
  if (!key) throw new Error('SAM_API_KEY not set');

  // SAM's free (non-federal) key allows ~10 requests/DAY. So: cache hard (6h,
  // CacheService max) and query 3-digit NAICS PREFIXES (<=3 calls, not 10).
  var cache = CacheService.getScriptCache();
  var ckey = 'sam_' + (f.naicsGroup || 'all') + '_' + (f.state || '') + '_' + (f.keyword || '');
  var hit = cache.get(ckey);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var PREFIX = { trucking:'484', courier:'492', warehouse:'493' };
  var codes = (f.naicsGroup && PREFIX[f.naicsGroup]) ? [PREFIX[f.naicsGroup]] : ['484','492','493'];

  var to = new Date(), from = new Date(); from.setMonth(from.getMonth() - 3);
  var fmt = function(d){ return Utilities.formatDate(d, 'GMT', 'MM/dd/yyyy'); };
  var base = 'https://api.sam.gov/opportunities/v2/search';

  var requests = codes.map(function(nc) {
    var url = base + '?api_key=' + encodeURIComponent(key)
            + '&postedFrom=' + fmt(from) + '&postedTo=' + fmt(to)
            + '&ncode=' + nc + '&limit=200';
    if (f.state)   url += '&state=' + encodeURIComponent(f.state);
    if (f.keyword) url += '&title=' + encodeURIComponent(f.keyword);
    return { url: url, muteHttpExceptions: true };
  });

  var responses = UrlFetchApp.fetchAll(requests);   // concurrent
  var out = [], seen = {}, limited = false;
  responses.forEach(function(res) {
    var code = res.getResponseCode();
    if (code === 429) { limited = true; return; }       // rate limited
    if (code >= 400) return;
    var data; try { data = JSON.parse(res.getContentText()); } catch (e) { return; }
    (data.opportunitiesData || []).forEach(function(r) {
      if (seen[r.noticeId]) return; seen[r.noticeId] = true;
      var pop = (r.placeOfPerformance || {});
      var poc = (r.pointOfContact && r.pointOfContact[0]) || {};
      out.push({
        id: 'sam_' + r.noticeId,
        source: 'samgov',
        title: r.title,
        agency: r.fullParentPathName || r.departmentName || '',
        solicitationNumber: r.solicitationNumber || r.noticeId,
        naics: r.naicsCode || '',
        type: r.type || r.baseType || 'Notice',
        postedDate: (r.postedDate || '').slice(0,10),
        dueDate: (r.responseDeadLine || '').slice(0,10),
        pop: { city: (pop.city && pop.city.name) || '', state: (pop.state && (pop.state.code||pop.state.name)) || '' },
        setAside: r.typeOfSetAsideDescription || r.typeOfSetAside || 'None',
        value: r.award && r.award.amount ? Number(r.award.amount) : null,
        url: r.uiLink || '',
        contact: { name: poc.fullName || '', email: poc.email || '', phone: poc.phone || '' },
        description: r.title + ' — ' + (r.fullParentPathName || ''),
      });
    });
  });

  if (!out.length && limited) throw new Error('SAM rate limit reached (free key ~10/day) — cached results resume after reset');
  out = out.slice(0, 150);                              // keep under CacheService 100KB/key
  try { cache.put(ckey, JSON.stringify(out), 21600); } catch (e) {}  // 6h
  return out;
}

/* ---------------- Bid / contact broker (outward action) ---------------- */
function doPost(e) {
  const action = (e.parameter || {}).action;
  if (action === 'bid') {
    const body = JSON.parse(e.postData.contents || '{}');
    // TODO: route to board bid endpoint OR MailApp.sendEmail to the broker.
    // Kept explicit + logged; frontend already confirms with the user first.
    Logger.log('BID %s @ %s: %s', body.loadId, body.rate, body.message);
    return json({ ok: true, queued: true });
  }
  return json({ ok: false, error: 'unknown action' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
