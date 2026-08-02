/* =============================================================================
 * FleetView — Opportunity Pipeline UI
 * =========================================================================== */
'use strict';

const O = {
  all: [], filtered: [], selectedId: null,
  view: 'table',                 // 'table' | 'board'
  sortKey: 'worthScore', sortDir: 'desc',
  live: false,
};
const STATUSES = ['New','Scoping','Pursuing','Bid','Won','Passed'];
const STATUS_COLOR = { New:'#6b7684', Scoping:'#4c8dff', Pursuing:'#f2a541', Bid:'#c471ed', Won:'#3fb950', Passed:'#f85149' };

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const money = n => n ? '$' + n.toLocaleString() : '—';

/* ---- pipeline record (localStorage: {id: {status, notes}}) ---- */
const PIPE_KEY = 'fleetview_opps_pipeline';
function loadPipe() { try { return JSON.parse(localStorage.getItem(PIPE_KEY)||'{}'); } catch { return {}; } }
function savePipe(p) { localStorage.setItem(PIPE_KEY, JSON.stringify(p)); }
function pipeOf(id) { return loadPipe()[id] || { status:'New', notes:'' }; }
function setPipe(id, patch) {
  const p = loadPipe(); p[id] = Object.assign(pipeOf(id), patch); savePipe(p);
  O.all.forEach(o => { if (o.id===id) Object.assign(o, { status:p[id].status, notes:p[id].notes }); });
}

function dueLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return { txt:'—', cls:'' };
  if (d < 0) return { txt:`${-d}d ago`, cls:'low' };
  if (d <= 7) return { txt:`${d}d left`, cls:'mid' };
  return { txt:`${d}d left`, cls:'good' };
}
function scoreCls(s) { return s>=75?'good':s>=55?'mid':s>=35?'warn':'low'; }

/* ---------------- Filters ---------------- */
function readFilters() {
  const v = id => $('#'+id).value.trim();
  const n = id => { const x=parseFloat($('#'+id).value); return isNaN(x)?null:x; };
  return {
    keyword:   v('f-keyword') || null,
    naicsGroup:v('f-naics') || null,
    state:     v('f-state') || null,
    type:      v('f-type') || null,
    minValue:  n('f-min-value'),
    dueWithin: n('f-due-within'),
    minScore:  n('f-min-score'),
    hidePassed:$('#f-hide-passed').checked,
  };
}
function clearFilters() {
  $$('.filters input').forEach(i => { if (i.type==='checkbox') i.checked=false; else i.value=''; });
  $$('.filters select').forEach(s => s.value='');
  run();
}

/* ---------------- Load ---------------- */
async function run() {
  const btn = $('#btn-refresh'); btn.disabled=true; btn.textContent='Loading…';
  try {
    const { opps, live, note } = await fetchOpportunities(readFilters());
    const pipe = loadPipe();
    O.all = opps.map(o => Object.assign(o, pipe[o.id] || { status:'New', notes:'' }));
    O.live = live; O.note = note;
    sortNow(); renderMode(); render();
    if (note) toast(note, live ? 'good' : '');
  } catch (e) { toast('Load failed: '+e.message,'bad'); console.error(e); }
  finally { btn.disabled=false; btn.textContent='↻ Refresh'; }
}
function sortNow() {
  const k=O.sortKey, dir=O.sortDir==='asc'?1:-1;
  O.filtered = [...O.all].sort((a,b)=>{
    let av=a[k], bv=b[k];
    if (k==='dueDate'){ av=daysUntil(a.dueDate)??1e9; bv=daysUntil(b.dueDate)??1e9; }
    if (av==null) av=-1e9; if (bv==null) bv=-1e9;
    return av>bv?dir:av<bv?-dir:0;
  });
}
function renderMode() {
  const b=$('#mode-badge');
  b.className='mode-badge '+(O.live?'live':'mock');
  b.textContent=O.live?'● Live · SAM.gov':'● Sample data';
}

/* ---------------- Render ---------------- */
function render() {
  $('#count-num').textContent = O.filtered.length;
  renderPipeStrip();
  if (O.view==='board') { $('#content').className='content board'; renderBoard(); }
  else { $('#content').className='content'; renderTable(); }
}

function renderPipeStrip() {
  const counts = {}; STATUSES.forEach(s=>counts[s]=0);
  O.all.forEach(o => counts[o.status] = (counts[o.status]||0)+1);
  const pursuingVal = O.all.filter(o=>['Scoping','Pursuing','Bid'].includes(o.status)).reduce((s,o)=>s+(o.value||0),0);
  $('#pipe-strip').innerHTML = STATUSES.map(s =>
    `<div class="pipe-stat"><span class="dot" style="background:${STATUS_COLOR[s]}"></span>${s} <b>${counts[s]}</b></div>`
  ).join('') + `<div class="pipe-stat val">In pursuit: <b>${money(pursuingVal)}</b></div>`;
}

const COLS = [
  {k:'worthScore',label:'Score'},{k:'dueDate',label:'Due'},{k:'title',label:'Opportunity'},
  {k:'naics',label:'NAICS'},{k:'type',label:'Type'},{k:'pop',label:'Location'},
  {k:'value',label:'Est. Value'},{k:'status',label:'Status'},
];
function renderTable() {
  $('#thead').innerHTML = '<tr>' + COLS.map(c=>{
    const active=O.sortKey===c.k; const arr=active?`<span class="arrow">${O.sortDir==='asc'?'▲':'▼'}</span>`:'';
    return `<th data-k="${c.k}" class="${c.k==='worthScore'?'internal-only':''}">${c.label} ${arr}</th>`;
  }).join('') + '</tr>';
  $$('#thead th').forEach(th=>th.onclick=()=>{
    const k=th.dataset.k;
    if (O.sortKey===k) O.sortDir=O.sortDir==='asc'?'desc':'asc'; else {O.sortKey=k;O.sortDir=k==='worthScore'||k==='value'?'desc':'asc';}
    sortNow(); render();
  });
  const tb=$('#tbody');
  if (!O.filtered.length){ tb.innerHTML=`<tr><td colspan="${COLS.length}"><div class="empty">No opportunities match.<br><span class="muted">Loosen a filter or widen the due window.</span></div></td></tr>`; return; }
  tb.innerHTML = O.filtered.map(rowHtml).join('');
  $$('#tbody tr').forEach(tr=>tr.onclick=()=>openDrawer(tr.dataset.id));
}
function rowHtml(o) {
  const due=dueLabel(o.dueDate);
  return `<tr data-id="${o.id}">
    <td class="internal-only"><span class="score ${scoreCls(o.worthScore)}">${o.worthScore}</span></td>
    <td class="age ${due.cls}">${due.txt}</td>
    <td><div class="lane">${o.title}</div><div class="sub">${o.agency}</div></td>
    <td><span class="pill eq" title="${o.naicsLabel}">${o.naics}</span></td>
    <td class="sub">${o.type}</td>
    <td class="sub">${o.pop.city}, ${o.pop.state}</td>
    <td class="rate">${money(o.value)}</td>
    <td><span class="status-pill" style="border-color:${STATUS_COLOR[o.status]};color:${STATUS_COLOR[o.status]}">${o.status}</span></td>
  </tr>`;
}

/* ---------------- Board (kanban) ---------------- */
function renderBoard() {
  $('#content').innerHTML = `<div class="kanban">${STATUSES.map(s=>{
    const items=O.filtered.filter(o=>o.status===s);
    return `<div class="kcol"><div class="khead"><span class="dot" style="background:${STATUS_COLOR[s]}"></span>${s} <span class="kcount">${items.length}</span></div>
      <div class="kbody">${items.map(cardHtml).join('')||'<div class="muted" style="padding:10px;font-size:12px">—</div>'}</div></div>`;
  }).join('')}</div>`;
  $$('.kcard').forEach(c=>c.onclick=()=>openDrawer(c.dataset.id));
}
function cardHtml(o) {
  const due=dueLabel(o.dueDate);
  return `<div class="kcard" data-id="${o.id}">
    <div class="kc-top"><span class="score ${scoreCls(o.worthScore)}">${o.worthScore}</span><span class="age ${due.cls}">${due.txt}</span></div>
    <div class="kc-title">${o.title}</div>
    <div class="sub">${o.pop.city}, ${o.pop.state} · ${money(o.value)}</div>
  </div>`;
}

/* ---------------- Detail drawer ---------------- */
function findOpp(id){ return O.all.find(o=>o.id===id); }
function openDrawer(id) {
  const o=findOpp(id); if(!o) return;
  O.selectedId=id;
  const due=dueLabel(o.dueDate);
  $('#drawer-body').innerHTML = `
    <div class="dl-lane">${o.title}</div>
    <div class="dl-dates">${o.agency}</div>
    <div class="score-box internal-only ${scoreCls(o.worthScore)}">
      <div class="score-big">${o.worthScore}<span>/100</span></div>
      <div class="score-label">${o.worthLabel}</div>
    </div>
    <div class="sec-title internal-only">Why this score</div>
    <ul class="reasons internal-only">${o.worthReasons.map(r=>`<li>${r}</li>`).join('')}</ul>
    <div class="kv">
      <div class="cell"><div class="k">Due</div><div class="v ${due.cls==='low'?'rpm low':''}">${o.dueDate||'—'} <span class="sub">(${due.txt})</span></div></div>
      <div class="cell"><div class="k">Est. Value</div><div class="v">${money(o.value)}</div></div>
      <div class="cell"><div class="k">Type</div><div class="v">${o.type}</div></div>
      <div class="cell"><div class="k">Set-Aside</div><div class="v" style="font-size:13px">${o.setAside}</div></div>
      <div class="cell"><div class="k">NAICS</div><div class="v" style="font-size:13px">${o.naics}<div class="sub">${o.naicsLabel}</div></div></div>
      <div class="cell"><div class="k">Location</div><div class="v">${o.pop.city}, ${o.pop.state}</div></div>
    </div>
    <div class="sec-title">Solicitation</div>
    <div class="broker-card"><div class="line"><b>Sol #</b> ${o.solicitationNumber}</div>
      <div class="line"><b>Contact</b> ${o.contact.name||'—'} ${o.contact.email?'· '+o.contact.email:''}</div>
      <div>${o.description||''}</div>
      ${o.url?`<a class="btn ghost" href="${o.url}" target="_blank" rel="noopener" style="width:100%;justify-content:center;margin-top:10px">View on SAM.gov ↗</a>`:''}
    </div>
    <div class="sec-title">Pipeline</div>
    <div class="status-row">${STATUSES.map(s=>`<button class="stbtn ${o.status===s?'on':''}" data-s="${s}" style="--c:${STATUS_COLOR[s]}">${s}</button>`).join('')}</div>
    <div class="sec-title">Notes</div>
    <textarea id="opp-notes" class="notes-area" placeholder="Scope, contacts made, bid rate, go/no-go rationale…">${o.notes||''}</textarea>`;

  $$('#drawer .stbtn').forEach(b=>b.onclick=()=>{ setPipe(id,{status:b.dataset.s}); openDrawer(id); render(); toast('Moved to '+b.dataset.s,'good'); });
  $('#opp-notes').onchange = e => { setPipe(id,{notes:e.target.value}); toast('Note saved','good'); };
  $('#drawer').classList.add('open');
}
function closeDrawer(){ $('#drawer').classList.remove('open'); }

/* ---------------- misc ---------------- */
let toastT;
function toast(msg,kind=''){ const t=$('#toast'); t.textContent=msg; t.className='toast show '+kind; clearTimeout(toastT); toastT=setTimeout(()=>t.className='toast '+kind,2400); }

function boot() {
  $('#btn-search').onclick=run; $('#btn-refresh').onclick=run; $('#btn-clear').onclick=clearFilters;
  $('#drawer-close').onclick=closeDrawer;
  $$('.view-toggle button').forEach(b=>b.onclick=()=>{ O.view=b.dataset.view; $$('.view-toggle button').forEach(x=>x.classList.toggle('on',x===b)); render(); });
  $('#sort-select').onchange=e=>{ const [k,d]=e.target.value.split(':'); O.sortKey=k;O.sortDir=d; sortNow(); render(); };
  $$('.filters input').forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter') run(); }));
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });
  run();
}
document.addEventListener('DOMContentLoaded', boot);
