/* =============================================================================
 * FleetView — Dashboard UI controller
 * =========================================================================== */
'use strict';

const state = {
  loads: [],
  filtered: [],
  selectedId: null,
  view: 'table',                 // 'table' | 'map' | 'split'
  sortKey: 'ageMins',
  sortDir: 'asc',
  live: false,
  lastTs: null,
  map: null,
  markers: null,
};

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const fmt$  = n => n ? '$' + Math.round(n).toLocaleString() : '';
const fmtRpm = n => n ? '$' + n.toFixed(2) : '';
const stateName = (c) => `${c.city}, ${c.state}`;

const SRC_META = {
  directfreight: { short:'DF',  cls:'src-df', dot:'df', color:'#4c8dff' },
  '123loadboard':{ short:'123', cls:'src-lb', dot:'lb', color:'#c471ed' },
  craigslist:    { short:'CL',  cls:'src-cl', dot:'cl', color:'#3fb950' },
};
function srcMeta(s) { return SRC_META[s] || { short:'?', cls:'', dot:'', color:'#888' }; }

const SIG = 'Mike Cook\nSupplyNow — Asset-Based Reefer & Dry Carrier\n216-548-7070 · dispatch@supplynow.org\nMC 1660872 · DOT 3976910';

function ageLabel(m) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60), mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}
function rpmClass(r) { return r >= 2 ? 'good' : r >= 1.6 ? 'mid' : 'low'; }

/* ---------------- Filters ---------------- */
function readFilters() {
  const v = id => $('#'+id).value.trim();
  const n = id => { const x = parseFloat($('#'+id).value); return isNaN(x) ? null : x; };
  return {
    originCity:  v('f-origin-city') || null,
    originState: v('f-origin-state') || null,
    originRadius:n('f-origin-radius'),
    destCity:    v('f-dest-city') || null,
    destState:   v('f-dest-state') || null,
    destRadius:  n('f-dest-radius'),
    equipment:   v('f-equipment') || null,
    minWeight:   n('f-min-weight'),
    maxWeight:   n('f-max-weight'),
    minRate:     n('f-min-rate'),
    maxRate:     n('f-max-rate'),
    minRpm:      n('f-min-rpm'),
    maxMiles:    n('f-max-miles'),
    maxAgeMins:  n('f-max-age') != null ? n('f-max-age') * 60 : null,
    fullOnly:    $('#f-full-only').checked,
    hideCallForRate: $('#f-hide-call').checked,
  };
}
function clearFilters() {
  $$('.filters input').forEach(i => { if (i.type === 'checkbox') i.checked = false; else i.value=''; });
  $$('.filters select').forEach(s => s.value = '');
  runSearch();
}

/* ---------------- Data load ---------------- */
async function runSearch() {
  const btn = $('#btn-refresh'); btn.disabled = true; btn.textContent = 'Loading…';
  try {
    const filters = readFilters();
    const { loads, live, ts } = await fetchLoads(filters);
    state.loads = loads; state.live = live; state.lastTs = ts;
    applySort();
    renderMode();
    render();
  } catch (e) {
    toast('Load failed: ' + e.message, 'bad');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = '↻ Refresh';
  }
}

function applySort() {
  const k = state.sortKey, dir = state.sortDir === 'asc' ? 1 : -1;
  state.filtered = [...state.loads].sort((a,b) => {
    let av, bv;
    if (k === 'rpm') { av = rpm(a); bv = rpm(b); }
    else if (k === 'lane') { av = a.origin.state; bv = b.origin.state; }
    else { av = a[k]; bv = b[k]; }
    if (av == null) av = -Infinity; if (bv == null) bv = -Infinity;
    return av > bv ? dir : av < bv ? -dir : 0;
  });
}

/* ---------------- Render mode indicator ---------------- */
function renderMode() {
  const b = $('#mode-badge');
  b.className = 'mode-badge ' + (state.live ? 'live' : 'mock');
  b.textContent = state.live ? '● Live' : '● Sample data';
}

/* ---------------- Table render ---------------- */
const COLS = [
  { k:'ageMins',   label:'Age' },
  { k:'source',    label:'Board' },
  { k:'lane',      label:'Lane' },
  { k:'equipment', label:'Equip' },
  { k:'miles',     label:'Miles' },
  { k:'weight',    label:'Weight' },
  { k:'rate',      label:'Rate' },
  { k:'rpm',       label:'RPM' },
  { k:'pickupDate',label:'Pickup' },
  { k:'_act',      label:'' },
];

function render() {
  $('#count-num').textContent = state.filtered.length;
  const delayNotes = Object.values(CONFIG.sources).filter(s=>s.enabled && s.delayNote).map(s=>s.delayNote);
  $('#delay-note').textContent = delayNotes.length ? '· ' + delayNotes.join(' · ') : '';

  // header
  $('#thead').innerHTML = '<tr>' + COLS.map(c => {
    if (c.k === '_act') return '<th></th>';
    const active = state.sortKey === c.k || (c.k==='source' && state.sortKey==='source');
    const arrow = active ? `<span class="arrow">${state.sortDir==='asc'?'▲':'▼'}</span>` : '';
    return `<th data-k="${c.k}">${c.label} ${arrow}</th>`;
  }).join('') + '</tr>';
  $$('#thead th[data-k]').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if (state.sortKey === k) state.sortDir = state.sortDir==='asc'?'desc':'asc';
    else { state.sortKey = k; state.sortDir = 'asc'; }
    applySort(); render();
  });

  // body
  const tb = $('#tbody');
  if (!state.filtered.length) {
    tb.innerHTML = `<tr><td colspan="${COLS.length}"><div class="empty">No loads match these filters.<br><span class="muted">Loosen a filter or toggle another board on.</span></div></td></tr>`;
  } else {
    tb.innerHTML = state.filtered.map(rowHtml).join('');
    $$('#tbody tr').forEach(tr => {
      tr.onclick = (e) => { if (e.target.closest('.mini-btn')) return; openDrawer(tr.dataset.id); };
    });
    $$('#tbody .js-quote').forEach(b => b.onclick = (e)=>{ e.stopPropagation(); openQuote(b.dataset.id); });
  }
  renderMap();
  syncSelection();
}

function rowHtml(l) {
  const r = rpm(l);
  const sm = srcMeta(l.source);
  const rateCell = l.rate ? `<span class="rate">${fmt$(l.rate)}</span>`
                 : l.local ? `<span class="callrate">${l.payNote || 'see post'}</span>`
                 : `<span class="callrate">Call</span>`;
  const rpmCell  = r ? `<span class="rpm ${rpmClass(r)}">${fmtRpm(r)}</span>` : '<span class="callrate">—</span>';
  const laneCell = l.local
    ? `<div class="lane">${l.origin.city}, ${l.origin.state} <span class="sub">· local</span></div>
       <div class="sub">${l.commodity||'—'}</div>`
    : `<div class="lane">${l.origin.city}, ${l.origin.state}<span class="arrow">→</span>${l.destination.city}, ${l.destination.state}</div>
       <div class="sub">${l.fullPartial} · ${l.commodity||'—'}</div>`;
  return `<tr data-id="${l.id}">
    <td class="age ${l.ageMins<45?'fresh':''}">${ageLabel(l.ageMins)}</td>
    <td><span class="pill ${sm.cls}">${sm.short}</span></td>
    <td>${laneCell}</td>
    <td><span class="pill eq">${l.equipment}</span></td>
    <td>${l.miles ? l.miles.toLocaleString() : '—'}</td>
    <td>${l.weight ? (l.weight/1000).toFixed(0)+'k' : '—'}</td>
    <td>${rateCell}</td>
    <td>${rpmCell}</td>
    <td class="sub">${l.local ? 'local' : (l.pickupDate?.slice(5) || '—')}</td>
    <td><button class="mini-btn js-quote" data-id="${l.id}">${l.local?'Bid':'Quote'}</button></td>
  </tr>`;
}

function syncSelection() {
  $$('#tbody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.id === state.selectedId));
}

/* ---------------- Map ---------------- */
function initMap() {
  if (state.map) return;                       // once only
  state.map = L.map('map', { zoomControl:true, attributionControl:false }).setView([40.5,-82], 6);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19 }).addTo(state.map);
  state.markers = L.layerGroup().addTo(state.map);
}
function renderMap() {
  if (!state.map) return;
  state.markers.clearLayers();
  const bounds = [];
  state.filtered.forEach(l => {
    if (!l.origin.lat || !l.origin.lng) return;
    const color = srcMeta(l.source).color;
    const r = rpm(l);
    const m = L.circleMarker([l.origin.lat, l.origin.lng], {
      radius:7, color:'#0d1117', weight:2, fillColor:color, fillOpacity:.9,
    }).bindPopup(`<div class="load-pop"><b>${l.origin.city} → ${l.destination.city}, ${l.destination.state}</b><br>
      ${l.equipment} · ${l.miles} mi · <span class="r">${l.rate?fmt$(l.rate):'Call'} ${r?'('+fmtRpm(r)+'/mi)':''}</span></div>`);
    m.on('click', () => openDrawer(l.id));
    state.markers.addLayer(m);
    // draw lane line to destination
    if (l.destination.lat) {
      state.markers.addLayer(L.polyline([[l.origin.lat,l.origin.lng],[l.destination.lat,l.destination.lng]],
        { color, weight:1, opacity:.22 }));
    }
    bounds.push([l.origin.lat, l.origin.lng]);
  });
  if (bounds.length && state.view !== 'table') {
    try { state.map.fitBounds(bounds, { padding:[40,40], maxZoom:7 }); } catch(e){}
  }
}

/* ---------------- View toggle ---------------- */
function setView(v) {
  state.view = v;
  $$('.view-toggle button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  const c = $('#content');
  c.className = 'content' + (v==='map'?' mapmode':v==='split'?' split':'');
  if (v !== 'table') {
    // Lazily build the map the FIRST time its view is shown, so Leaflet
    // initializes at the container's real size and loads tiles for the whole
    // visible area (creating it while display:none only ever fetches a stale
    // corner). On later switches, just invalidate + redraw.
    requestAnimationFrame(() => {
      initMap();
      state.map.invalidateSize(true);
      renderMap();
      setTimeout(() => state.map.invalidateSize(true), 200);
    });
  }
}

/* ---------------- Detail drawer ---------------- */
function findLoad(id) { return state.loads.find(l => l.id === id); }

function openDrawer(id) {
  const l = findLoad(id); if (!l) return;
  state.selectedId = id; syncSelection();
  const r = rpm(l);
  const dp = l.broker.daysToPay ? `${l.broker.daysToPay} days` : '—';
  const credit = l.broker.creditScore;
  const creditHtml = credit ? `<span class="credit ${credit>=90?'hi':'mid'}">${credit}%</span>` : '<span class="muted">n/a</span>';
  const sm = srcMeta(l.source);
  const laneHtml = l.local
    ? `<div class="dl-lane">${stateName(l.origin)} <span class="muted">· local gig</span></div>`
    : `<div class="dl-lane">${stateName(l.origin)} <span style="color:var(--txt-3)">→</span> ${stateName(l.destination)}</div>`;
  const postLink = l.url
    ? `<a class="btn ghost" href="${l.url}" target="_blank" rel="noopener" style="width:100%;justify-content:center;margin-top:10px">View original post ↗</a>` : '';

  const kvHtml = l.local
    ? `<div class="kv">
        <div class="cell"><div class="k">Posted Pay</div><div class="v">${l.payNote || 'See post'}</div></div>
        <div class="cell"><div class="k">Equipment</div><div class="v">${EQUIPMENT[l.equipment]||l.equipment}</div></div>
        <div class="cell"><div class="k">Type</div><div class="v">Local · NE Ohio</div></div>
        <div class="cell"><div class="k">Posted</div><div class="v">${ageLabel(l.ageMins)} ago</div></div>
      </div>`
    : `<div class="kv">
        <div class="cell"><div class="k">Offered Rate</div><div class="v">${l.rate?fmt$(l.rate):'Call for rate'}</div></div>
        <div class="cell"><div class="k">Rate / Mile</div><div class="v rpm ${r?rpmClass(r):''}">${r?fmtRpm(r):'—'}</div></div>
        <div class="cell"><div class="k">Trip Miles</div><div class="v">${l.miles.toLocaleString()}</div></div>
        <div class="cell"><div class="k">Equipment</div><div class="v">${EQUIPMENT[l.equipment]||l.equipment}</div></div>
        <div class="cell"><div class="k">Weight</div><div class="v">${l.weight?l.weight.toLocaleString()+' lb':'—'}</div></div>
        <div class="cell"><div class="k">Load Type</div><div class="v">${l.fullPartial}</div></div>
      </div>`;

  const brokerHtml = l.local
    ? `<div class="sec-title">Source</div>
       <div class="broker-card"><div class="name">Craigslist — NE Ohio</div>
         <div class="line muted">Contact is via the original post (Craigslist relay). Open it to respond.</div>
         ${postLink}</div>`
    : `<div class="sec-title">Broker</div>
       <div class="broker-card">
         <div class="name">${l.broker.name||'—'}</div>
         <div class="line"><b>Phone</b> ${l.broker.phone||'—'}</div>
         <div class="line"><b>Email</b> ${l.broker.email||'—'}</div>
         <div class="line"><b>MC</b> ${l.broker.mc||'—'}</div>
         <div class="line"><b>Credit</b> ${creditHtml} &nbsp; <b>Pays</b> ${dp}</div>
       </div>`;

  $('#drawer-body').innerHTML = `
    ${laneHtml}
    <div class="dl-dates">${l.local ? 'Posted '+ageLabel(l.ageMins)+' ago' : `Pickup ${l.pickupDate||'—'} · Delivery ${l.deliveryDate||'—'} · posted ${ageLabel(l.ageMins)} ago`}
      <span class="pill ${sm.cls}" style="margin-left:6px">${CONFIG.sources[l.source]?.label||l.source}</span></div>
    ${kvHtml}
    <div class="sec-title">${l.local ? 'Gig' : 'Commodity'}</div>
    <div>${l.commodity||'—'}${!l.local && l.notes?` <span class="muted">· ${l.notes}</span>`:''}</div>
    ${brokerHtml}`;
  $('#drawer-quote').dataset.id = id;
  $('#drawer-bid').dataset.id = id;
  $('#drawer').classList.add('open');
}
function closeDrawer() { $('#drawer').classList.remove('open'); }

/* ---------------- Quote + Bid ---------------- */
let quoteCtx = null;

function openQuote(id) {
  const l = findLoad(id); if (!l) return;
  quoteCtx = l.local
    ? { load:l, local:true, flatRate: l.rate || 0 }
    : { load:l, bidRpm: Math.max(SUPPLYNOW_TARGET_RPM, rpm(l)||SUPPLYNOW_TARGET_RPM) };
  renderQuote();
  $('#overlay').classList.add('open');
}
function closeQuote(){ $('#overlay').classList.remove('open'); }

function renderQuote() {
  if (quoteCtx.local) return renderLocalQuote();
  return renderLaneQuote();
}

function renderLocalQuote() {
  const l = quoteCtx.load;
  const q = `SN-${new Date().getFullYear()}-${l.id.replace(/\D/g,'').slice(-4)}`;
  const flat = quoteCtx.flatRate || 0;
  $('#quote-body').innerHTML = `
    <div class="quote-lane">${l.commodity}</div>
    <div class="muted">${l.origin.city}, ${l.origin.state} · Local NE Ohio gig · ${EQUIPMENT[l.equipment]||l.equipment}</div>

    <div class="analysis">
      <div class="arow"><span>Posted pay</span><b>${l.payNote || 'see post'}</b></div>
      <div class="arow"><span>Your flat quote</span><b>${flat?fmt$(flat):'— set below —'}</b></div>
    </div>

    <div class="slider-row">
      <span class="muted">Flat rate&nbsp;$</span>
      <input id="flat-input" type="number" value="${flat||''}" placeholder="e.g. 250"
        style="flex:1;padding:8px 10px;border-radius:7px;background:var(--bg);color:var(--txt);border:1px solid var(--line-2);font-family:var(--mono)">
    </div>

    <div class="sec-title">Quote / response</div>
    <div class="quote-out">
      <div class="qh"><b>SupplyNow</b><span style="margin-left:auto;color:#888;font-size:12px">Quote ${q}</span></div>
      <table>
        <tr><td>Job</td><td style="text-align:right">${l.commodity}</td></tr>
        <tr><td>Area</td><td style="text-align:right">${l.origin.city}, ${l.origin.state}</td></tr>
        <tr><td>Equipment</td><td style="text-align:right">${EQUIPMENT[l.equipment]||l.equipment}</td></tr>
        <tr><td style="padding-top:8px" class="total">Flat rate</td><td style="text-align:right;padding-top:8px" class="total">${flat?fmt$(flat):'—'}</td></tr>
      </table>
      <div style="color:#888;font-size:11px;margin-top:8px">Supply Now Inc. · MC 1660872 / DOT 3976910 · dispatch@supplynow.org</div>
    </div>

    <div class="bidbox">
      <b>Respond to post</b>
      <textarea id="bid-msg">Hi — this is Mike with SupplyNow (Supply Now Inc., MC 1660872). Saw your post: "${l.commodity}". We run refrigerated + dry box trucks out of Cleveland and can cover this${flat?` for ${fmt$(flat)}`:''}. When do you need it?\n\n${SIG}</textarea>
      <div class="warnline">⚠︎ This opens/queues a reply to the original poster — you confirm before it sends.</div>
      ${l.url?`<a class="btn ghost" href="${l.url}" target="_blank" rel="noopener" style="width:100%;justify-content:center;margin-top:8px">Open original Craigslist post ↗</a>`:''}
    </div>`;
  const fi = $('#flat-input');
  fi.oninput = () => { quoteCtx.flatRate = parseFloat(fi.value)||0; renderLocalQuote(); };
  $('#quote-copy').onclick = () => { navigator.clipboard?.writeText($('#bid-msg').value); toast('Response copied','good'); };
  $('#quote-send').onclick = () => confirmBid(l, quoteCtx.flatRate, $('#bid-msg').value);
}

function renderLaneQuote() {
  const l = quoteCtx.load;
  const offered = l.rate;
  const offeredRpm = rpm(l);
  const targetRate = Math.round(l.miles * SUPPLYNOW_TARGET_RPM);
  const bidRate = Math.round(l.miles * quoteCtx.bidRpm);

  // Verdict vs SupplyNow floor
  let verdict, vcls, vicon;
  if (!offered) { verdict = 'No rate posted — bid at your target or call the broker.'; vcls='watch'; vicon='◐'; }
  else if (offeredRpm >= SUPPLYNOW_TARGET_RPM * 1.12) { verdict = `Strong lane — offered ${fmtRpm(offeredRpm)}/mi beats your ${fmtRpm(SUPPLYNOW_TARGET_RPM)} floor.`; vcls='go'; vicon='✓'; }
  else if (offeredRpm >= SUPPLYNOW_TARGET_RPM) { verdict = `Above floor — margin is thin at ${fmtRpm(offeredRpm)}/mi.`; vcls='watch'; vicon='◐'; }
  else { verdict = `Below your ${fmtRpm(SUPPLYNOW_TARGET_RPM)}/mi floor — counter up to ${fmt$(targetRate)}.`; vcls='no'; vicon='✕'; }

  const q = `SN-${new Date().getFullYear()}-${l.id.replace(/\D/g,'').slice(-4)}`;
  $('#quote-body').innerHTML = `
    <div class="quote-lane">${stateName(l.origin)} → ${stateName(l.destination)}</div>
    <div class="muted">${l.equipment} · ${l.miles.toLocaleString()} mi · ${l.fullPartial} · ${l.commodity||'—'}</div>

    <div class="analysis">
      <div class="arow"><span>Offered rate (board)</span><b>${offered?fmt$(offered)+'  ('+fmtRpm(offeredRpm)+'/mi)':'Call for rate'}</b></div>
      <div class="arow"><span>SupplyNow target ($${SUPPLYNOW_TARGET_RPM}/mi)</span><b>${fmt$(targetRate)}</b></div>
      <div class="arow"><span>Your bid</span><b>${fmt$(bidRate)}  (${fmtRpm(quoteCtx.bidRpm)}/mi)</b></div>
      ${offered?`<div class="arow"><span>Delta vs offered</span><b style="color:${bidRate>offered?'var(--bad)':'var(--good)'}">${bidRate>offered?'+':''}${fmt$(bidRate-offered)}</b></div>`:''}
    </div>

    <div class="verdict ${vcls}"><span style="font-size:16px">${vicon}</span><span>${verdict}</span></div>

    <div class="slider-row">
      <span class="muted">Adjust bid</span>
      <input id="bid-slider" type="range" min="1.2" max="3.5" step="0.01" value="${quoteCtx.bidRpm}">
      <span class="val">${fmtRpm(quoteCtx.bidRpm)}/mi</span>
    </div>

    <div class="sec-title">Quote to broker</div>
    <div class="quote-out">
      <div class="qh"><b>SupplyNow</b><span style="margin-left:auto;color:#888;font-size:12px">Quote ${q}</span></div>
      <table>
        <tr><td>Lane</td><td style="text-align:right">${l.origin.city}, ${l.origin.state} → ${l.destination.city}, ${l.destination.state}</td></tr>
        <tr><td>Equipment</td><td style="text-align:right">${EQUIPMENT[l.equipment]||l.equipment}</td></tr>
        <tr><td>Distance</td><td style="text-align:right">${l.miles.toLocaleString()} mi</td></tr>
        <tr><td>Pickup</td><td style="text-align:right">${l.pickupDate||'TBD'}</td></tr>
        <tr><td style="padding-top:8px" class="total">All-in rate</td><td style="text-align:right;padding-top:8px" class="total">${fmt$(bidRate)}</td></tr>
      </table>
      <div style="color:#888;font-size:11px;margin-top:8px">All-in, no accessorials unless noted. Valid 24 hrs. SupplyNow · dispatch@supplynow.org</div>
    </div>

    <div class="bidbox">
      <b>Send bid / contact broker</b> — ${l.broker.name||'broker'}
      <textarea id="bid-msg">Hi ${(l.broker.name||'').split(' ')[0]||'there'} — SupplyNow can cover ${l.origin.city}, ${l.origin.state} → ${l.destination.city}, ${l.destination.state} (${l.equipment}, ${l.miles} mi) for ${fmt$(bidRate)} all-in, pickup ${l.pickupDate||'TBD'}. MC on file. Good to book?\n\n${SIG}</textarea>
      <div class="warnline">⚠︎ Sending contacts the broker on your behalf — you'll confirm before it goes out.</div>
    </div>`;

  const slider = $('#bid-slider');
  slider.oninput = () => { quoteCtx.bidRpm = parseFloat(slider.value); renderQuote(); };
  $('#quote-copy').onclick = () => { navigator.clipboard?.writeText($('#bid-msg').value); toast('Quote message copied','good'); };
  $('#quote-send').onclick = () => confirmBid(l, bidRate, $('#bid-msg').value);
}

function confirmBid(l, rate, msg) {
  // Outward action → explicit confirm. In live mode this POSTs through the proxy
  // to the board's bid/contact endpoint (or drafts an email). Never silent.
  const ok = window.confirm(
    `Send this bid to ${l.broker.name}?\n\n`+
    `Lane: ${l.origin.city}, ${l.origin.state} → ${l.destination.city}, ${l.destination.state}\n`+
    `Rate: ${fmt$(rate)}\n\n"${msg}"\n\n`+
    (CONFIG.useMock ? '(Sample mode: this is simulated — nothing is actually sent.)'
                    : 'This will contact the broker for real.')
  );
  if (!ok) return;
  if (CONFIG.useMock) {
    toast('✓ Bid queued (sample mode — not sent)', 'good');
  } else {
    // TODO live: POST {loadId, rate, message} to CONFIG.proxyUrl?action=bid
    toast('✓ Bid sent to '+l.broker.name, 'good');
  }
  closeQuote();
}

/* ---------------- Saved searches (localStorage) ---------------- */
const SS_KEY = 'fleetview_saved_searches';
function loadSaved() { try { return JSON.parse(localStorage.getItem(SS_KEY)||'[]'); } catch { return []; } }
function renderSaved() {
  const list = loadSaved();
  $('#saved-list').innerHTML = list.length ? list.map((s,i) =>
    `<div class="saved-item"><span class="lbl" data-i="${i}">🔎 ${s.name}</span><button class="del" data-i="${i}">×</button></div>`
  ).join('') : '<div class="muted" style="font-size:12px">No saved searches yet.</div>';
  $$('#saved-list .lbl').forEach(el => el.onclick = () => { applySaved(loadSaved()[el.dataset.i]); });
  $$('#saved-list .del').forEach(el => el.onclick = () => {
    const l = loadSaved(); l.splice(el.dataset.i,1); localStorage.setItem(SS_KEY, JSON.stringify(l)); renderSaved();
  });
}
function saveCurrent() {
  const f = readFilters();
  const parts = [];
  if (f.originState) parts.push('from '+f.originState);
  if (f.destState) parts.push('to '+f.destState);
  if (f.equipment) parts.push(f.equipment);
  const name = prompt('Name this search / alert:', parts.join(' ') || 'My search');
  if (!name) return;
  const l = loadSaved(); l.push({ name, filters:f }); localStorage.setItem(SS_KEY, JSON.stringify(l));
  renderSaved(); toast('Saved search added','good');
}
function applySaved(s) {
  if (!s) return;
  const f = s.filters;
  $('#f-origin-city').value = f.originCity||''; $('#f-origin-state').value = f.originState||'';
  $('#f-origin-radius').value = f.originRadius||''; $('#f-dest-city').value = f.destCity||'';
  $('#f-dest-state').value = f.destState||''; $('#f-dest-radius').value = f.destRadius||'';
  $('#f-equipment').value = f.equipment||''; $('#f-min-weight').value = f.minWeight||'';
  $('#f-max-weight').value = f.maxWeight||''; $('#f-min-rate').value = f.minRate||'';
  $('#f-max-rate').value = f.maxRate||''; $('#f-min-rpm').value = f.minRpm||'';
  $('#f-max-miles').value = f.maxMiles||''; $('#f-max-age').value = f.maxAgeMins?f.maxAgeMins/60:'';
  $('#f-full-only').checked = !!f.fullOnly; $('#f-hide-call').checked = !!f.hideCallForRate;
  runSearch();
}

/* ---------------- Source toggles ---------------- */
function renderSourceToggles() {
  $('#src-toggles').innerHTML = Object.entries(CONFIG.sources).map(([k,s]) =>
    `<button class="src-chip" data-src="${k}" data-on="${s.enabled}">
      <span class="dot ${srcMeta(k).dot}"></span>${s.label}</button>`
  ).join('');
  $$('#src-toggles .src-chip').forEach(c => c.onclick = () => {
    const k = c.dataset.src;
    CONFIG.sources[k].enabled = !CONFIG.sources[k].enabled;
    c.dataset.on = CONFIG.sources[k].enabled;
    runSearch();
  });
}

/* ---------------- Toast ---------------- */
let toastT;
function toast(msg, kind='') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toastT); toastT = setTimeout(()=> t.className='toast '+kind, 2600);
}

/* ---------------- Boot ---------------- */
function boot() {
  renderSourceToggles();
  renderSaved();
  setView('table');            // map is lazy-initialized on first Map/Split view

  $('#btn-search').onclick = runSearch;
  $('#btn-refresh').onclick = runSearch;
  $('#btn-clear').onclick = clearFilters;
  $('#btn-save').onclick = saveCurrent;
  $('#drawer-close').onclick = closeDrawer;
  $('#overlay-close').onclick = closeQuote;
  $('#overlay').onclick = (e) => { if (e.target.id === 'overlay') closeQuote(); };
  $('#drawer-quote').onclick = () => openQuote($('#drawer-quote').dataset.id);
  $('#drawer-bid').onclick = () => openQuote($('#drawer-bid').dataset.id);
  $('#btn-filters').onclick = () => $('#filters').classList.toggle('open');
  $$('.view-toggle button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#sort-select').onchange = (e) => {
    const [k,d] = e.target.value.split(':'); state.sortKey=k; state.sortDir=d; applySort(); render();
  };
  // Enter in any filter field = search
  $$('.filters input').forEach(i => i.addEventListener('keydown', e => { if (e.key==='Enter') runSearch(); }));
  document.addEventListener('keydown', e => { if (e.key==='Escape'){ closeQuote(); closeDrawer(); } });

  runSearch();
}
document.addEventListener('DOMContentLoaded', boot);
