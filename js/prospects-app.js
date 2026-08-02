/* =============================================================================
 * FleetView — Shipper Prospecting UI
 * =========================================================================== */
'use strict';

const P = { all:[], filtered:[], view:'table', sortKey:'fitScore', sortDir:'desc', enriched:false };
const P_STATUSES = ['New','Researching','Contacted','Meeting','Quoted','Won','Passed'];
const P_COLOR = { New:'#6b7684', Researching:'#4c8dff', Contacted:'#f2a541', Meeting:'#c471ed', Quoted:'#00b4a6', Won:'#3fb950', Passed:'#f85149' };
// TYPE_LABEL is defined in prospects-data.js (loaded first)

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];

const PP_KEY = 'fleetview_prospect_pipeline';
function loadPP(){ try { return JSON.parse(localStorage.getItem(PP_KEY)||'{}'); } catch { return {}; } }
function savePP(p){ localStorage.setItem(PP_KEY, JSON.stringify(p)); }
function ppOf(id){ return loadPP()[id] || { status:'New', notes:'' }; }
function setPP(id, patch){ const p=loadPP(); p[id]=Object.assign(ppOf(id),patch); savePP(p); P.all.forEach(x=>{ if(x.id===id) Object.assign(x, patch); }); }

function fitCls(s){ return s>=75?'good':s>=58?'mid':s>=42?'warn':'low'; }
function catBadge(c){ return c==='reefer'?'<span class="pill" style="background:rgba(76,141,255,.14);color:#4c8dff">Reefer</span>'
  : c==='dry'?'<span class="pill" style="background:rgba(155,167,180,.14);color:#9aa7b4">Dry</span>'
  : '<span class="pill" style="background:rgba(0,180,166,.14);color:#00b4a6">Reefer+Dry</span>'; }

function readFilters(){
  const v=id=>$('#'+id).value.trim(); const n=id=>{const x=parseFloat($('#'+id).value);return isNaN(x)?null:x;};
  return { keyword:v('f-keyword')||null, category:v('f-category')||null, type:v('f-type')||null, city:v('f-city')||null, minFit:n('f-min-fit') };
}
function clearFilters(){ $$('.filters input').forEach(i=>i.value=''); $$('.filters select').forEach(s=>s.value=''); run(); }

async function run(){
  const btn=$('#btn-refresh'); btn.disabled=true; btn.textContent='Loading…';
  try {
    const { prospects, enriched } = await fetchProspects(readFilters());
    const pipe=loadPP();
    P.all = prospects.map(p=>Object.assign(p, pipe[p.id]||{status:'New',notes:''}));
    P.enriched=enriched; sortNow(); renderMode(); render();
  } catch(e){ toast('Load failed: '+e.message,'bad'); console.error(e); }
  finally { btn.disabled=false; btn.textContent='↻ Refresh'; }
}
function sortNow(){ const k=P.sortKey,dir=P.sortDir==='asc'?1:-1;
  P.filtered=[...P.all].sort((a,b)=>{ let av=a[k],bv=b[k]; if(typeof av==='string'){av=av.toLowerCase();bv=(bv||'').toLowerCase();} if(av==null)av=-1e9; if(bv==null)bv=-1e9; return av>bv?dir:av<bv?-dir:0; }); }
function renderMode(){ const b=$('#mode-badge'); b.className='mode-badge '+(P.enriched?'live':'mock'); b.textContent=P.enriched?'● Enriched · Apollo':'● Researched targets'; }

function render(){
  $('#count-num').textContent=P.filtered.length;
  renderPipeStrip();
  if(P.view==='board'){ $('#content').className='content board'; renderBoard(); }
  else { $('#content').className='content'; renderTable(); }
}
function renderPipeStrip(){
  const c={}; P_STATUSES.forEach(s=>c[s]=0); P.all.forEach(p=>c[p.status]=(c[p.status]||0)+1);
  const active=P.all.filter(p=>['Researching','Contacted','Meeting','Quoted'].includes(p.status)).length;
  $('#pipe-strip').innerHTML = P_STATUSES.map(s=>`<div class="pipe-stat"><span class="dot" style="background:${P_COLOR[s]}"></span>${s} <b>${c[s]}</b></div>`).join('')
    + `<div class="pipe-stat val">Working: <b>${active}</b></div>`;
}

const COLS=[{k:'fitScore',l:'Fit'},{k:'company',l:'Company'},{k:'type',l:'Type'},{k:'category',l:'Freight'},{k:'city',l:'City'},{k:'contact',l:'Contact'},{k:'status',l:'Status'}];
function renderTable(){
  $('#thead').innerHTML='<tr>'+COLS.map(c=>{const a=P.sortKey===c.k;return `<th data-k="${c.k}" class="${c.k==='fitScore'?'internal-only':''}">${c.l} ${a?`<span class="arrow">${P.sortDir==='asc'?'▲':'▼'}</span>`:''}</th>`;}).join('')+'</tr>';
  $$('#thead th').forEach(th=>th.onclick=()=>{const k=th.dataset.k; if(P.sortKey===k)P.sortDir=P.sortDir==='asc'?'desc':'asc'; else{P.sortKey=k;P.sortDir=k==='fitScore'?'desc':'asc';} sortNow(); render();});
  const tb=$('#tbody');
  if(!P.filtered.length){ tb.innerHTML=`<tr><td colspan="${COLS.length}"><div class="empty">No prospects match.</div></td></tr>`; return; }
  tb.innerHTML=P.filtered.map(rowHtml).join('');
  $$('#tbody tr').forEach(tr=>tr.onclick=()=>openDrawer(tr.dataset.id));
}
function rowHtml(p){
  const contact = p.contact.email ? p.contact.name||p.contact.email : '<span class="muted">enrich</span>';
  return `<tr data-id="${p.id}">
    <td class="internal-only"><span class="score ${fitCls(p.fitScore)}">${p.fitScore}</span></td>
    <td><div class="lane">${p.company}${p.warm?' <span class="pill" style="background:rgba(63,185,80,.15);color:#3fb950">warm</span>':''}</div><div class="sub">${p.about.slice(0,54)}…</div></td>
    <td class="sub">${TYPE_LABEL[p.type]||p.type}</td>
    <td>${catBadge(p.category)}</td>
    <td class="sub">${p.city}, ${p.state}</td>
    <td class="sub">${contact}</td>
    <td><span class="status-pill" style="border-color:${P_COLOR[p.status]};color:${P_COLOR[p.status]}">${p.status}</span></td>
  </tr>`;
}
function renderBoard(){
  $('#content').innerHTML=`<div class="kanban">${P_STATUSES.map(s=>{
    const items=P.filtered.filter(p=>p.status===s);
    return `<div class="kcol"><div class="khead"><span class="dot" style="background:${P_COLOR[s]}"></span>${s} <span class="kcount">${items.length}</span></div>
      <div class="kbody">${items.map(cardHtml).join('')||'<div class="muted" style="padding:10px;font-size:12px">—</div>'}</div></div>`;
  }).join('')}</div>`;
  $$('.kcard').forEach(c=>c.onclick=()=>openDrawer(c.dataset.id));
}
function cardHtml(p){ return `<div class="kcard" data-id="${p.id}">
  <div class="kc-top"><span class="score ${fitCls(p.fitScore)}">${p.fitScore}</span>${catBadge(p.category)}</div>
  <div class="kc-title">${p.company}</div><div class="sub">${TYPE_LABEL[p.type]||p.type} · ${p.city}</div></div>`; }

function findP(id){ return P.all.find(p=>p.id===id); }
function bar(label, val){ const cls = val>=80?'good':val>=60?'mid':val>=45?'warn':'low';
  return `<div class="sub-bar"><span class="sb-l">${label}</span><span class="sb-track"><span class="sb-fill ${cls}" style="width:${val}%"></span></span><span class="sb-v">${val}</span></div>`; }
function chips(arr){ return `<div class="chips">${arr.map(x=>`<span class="chip">${x}</span>`).join('')}</div>`; }

let drawerAngle = 'overflow';
function openDrawer(id, angle){
  const p=findP(id); if(!p) return;
  drawerAngle = angle || 'overflow';
  const it = p.intel;
  const angles = outreachAngles(p);
  const seq = outreachSequence(p, drawerAngle);
  const intro = seq[0];
  const c = p.contact || {};
  const linkedin=`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(p.company+' transportation logistics manager')}`;
  const apolloSearch=`https://app.apollo.io/#/companies?qOrganizationName=${encodeURIComponent(p.company)}`;
  const contactBlock = `
    <div class="lbl-min">Save the decision-maker (look up free in Apollo web / Hunter / LinkedIn → paste here)</div>
    <input id="c-name" class="c-in" placeholder="Name" value="${c.name||''}">
    <input id="c-title" class="c-in" placeholder="Title" value="${c.title||''}">
    <input id="c-email" class="c-in" placeholder="Email" value="${c.email||''}">
    <input id="c-phone" class="c-in" placeholder="Phone" value="${c.phone||''}">
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn primary" id="save-contact" style="flex:1;justify-content:center">Save contact</button>
      <a class="btn ghost" href="${apolloSearch}" target="_blank" rel="noopener" title="Apollo free web search">Apollo ↗</a>
      <a class="btn ghost" href="${linkedin}" target="_blank" rel="noopener" title="LinkedIn people search">LinkedIn ↗</a>
    </div>`;

  $('#drawer-body').innerHTML=`
    <div class="dl-lane">${p.company}${p.warm?' <span class="pill" style="background:rgba(63,185,80,.15);color:#3fb950">warm</span>':''}</div>
    <div class="dl-dates">${TYPE_LABEL[p.type]||p.type} · ${p.city}, ${p.state} · ${catBadge(p.category)}</div>
    <div class="score-box internal-only ${fitCls(p.fitScore)}"><div class="score-big">${p.fitScore}<span>/100</span></div><div class="score-label">${p.fitLabel} fit</div></div>

    <div class="sec-title internal-only">Fit breakdown</div>
    <div class="bars internal-only">
      ${bar('Commodity', p.subScores.commodity)}
      ${bar('Need', p.subScores.need)}
      ${bar('Proximity', p.subScores.proximity)}
      ${bar('Winnability', p.subScores.winnability)}
    </div>

    <div class="sec-title internal-only">Account intelligence</div>
    <div class="broker-card internal-only">
      <div class="kv2"><span>Own fleet</span><b>${it.ownFleet}</b></div>
      <div class="kv2"><span>Best angle</span><b>${it.approach}</b></div>
      <div class="kv2"><span>Deal size</span><b>${it.dealPotential}</b></div>
      <div class="kv2"><span>Who to reach</span><b>${it.decisionMaker}</b></div>
      <div style="margin-top:10px"><div class="lbl-min">Likely lanes</div>${chips(it.likelyLanes)}</div>
      <div style="margin-top:8px"><div class="lbl-min">Why-now triggers</div>${chips(it.triggers)}</div>
      <div style="margin-top:8px"><div class="lbl-min">Their pain points</div>${chips(it.painPoints)}</div>
    </div>
    <div class="sec-title">About</div><div style="font-size:13px">${p.about}</div>
    ${p.url?`<a class="btn ghost" href="${p.url}" target="_blank" rel="noopener" style="width:100%;justify-content:center;margin-top:8px">Company site / source ↗</a>`:''}

    <div class="sec-title">Contact</div><div class="broker-card">${contactBlock}</div>

    <div class="sec-title">Outreach — pick an angle</div>
    <div class="status-row">${angles.map(a=>`<button class="stbtn ${a.key===drawerAngle?'on':''}" data-angle="${a.key}" style="--c:#00b4a6">${a.label}</button>`).join('')}</div>
    <div class="broker-card" style="margin-top:8px">
      <div class="lbl-min">Subject</div><div class="mono-box">${intro.subject}</div>
      <div class="lbl-min" style="margin-top:8px">Email</div>
      <textarea id="mail-body" class="notes-area" style="min-height:210px">${intro.body}</textarea>
      <button class="btn" id="copy-mail" style="width:100%;justify-content:center;margin-top:8px">Copy intro email</button>
    </div>

    <div class="sec-title">Full 5-touch cadence</div>
    <div class="seq">${seq.map((t,i)=>`
      <div class="seq-item">
        <div class="seq-head" data-i="${i}"><span class="seq-day">Day ${t.day}</span> <span class="seq-ch">${t.channel}</span> — ${t.label} <span class="seq-caret">▸</span></div>
        <div class="seq-body" id="seq-${i}">
          ${t.subject?`<div class="lbl-min">Subject</div><div class="mono-box">${t.subject}</div><div class="lbl-min" style="margin-top:6px">Message</div>`:''}
          <pre class="seq-pre">${t.body.replace(/</g,'&lt;')}</pre>
          <button class="btn mini-copy" data-i="${i}">Copy</button>
        </div>
      </div>`).join('')}</div>

    <div class="sec-title">Objection handling</div>
    <div class="seq">${objections(p).map((o,i)=>`
      <div class="seq-item">
        <div class="seq-head" data-obj="${i}">${o.q} <span class="seq-caret">▸</span></div>
        <div class="seq-body" id="obj-${i}"><div style="font-size:13px">${o.a}</div></div>
      </div>`).join('')}</div>

    <div class="sec-title">Pipeline</div>
    <div class="status-row">${P_STATUSES.map(s=>`<button class="stbtn ${p.status===s?'on':''}" data-s="${s}" style="--c:${P_COLOR[s]}">${s}</button>`).join('')}</div>
    <div class="sec-title">Notes</div>
    <textarea id="p-notes" class="notes-area" placeholder="Who you reached, response, next step…">${p.notes||''}</textarea>`;

  $$('#drawer .stbtn[data-s]').forEach(b=>b.onclick=()=>{ setPP(id,{status:b.dataset.s}); openDrawer(id, drawerAngle); render(); toast('Moved to '+b.dataset.s,'good'); });
  $$('#drawer .stbtn[data-angle]').forEach(b=>b.onclick=()=>openDrawer(id, b.dataset.angle));
  $('#p-notes').onchange=e=>{ setPP(id,{notes:e.target.value}); toast('Note saved','good'); };
  $('#save-contact').onclick=()=>{
    const contact={ name:$('#c-name').value.trim(), title:$('#c-title').value.trim()||'Logistics / Transportation Manager', email:$('#c-email').value.trim(), phone:$('#c-phone').value.trim() };
    setPP(id,{contact}); openDrawer(id, drawerAngle); render(); toast('Contact saved — outreach personalized','good');
  };
  $('#copy-mail').onclick=()=>{ navigator.clipboard?.writeText(intro.subject+'\n\n'+$('#mail-body').value); toast('Intro email copied','good'); };
  $$('#drawer .seq-head[data-i]').forEach(h=>h.onclick=()=>{ const b=$('#seq-'+h.dataset.i); b.classList.toggle('open'); h.querySelector('.seq-caret').textContent = b.classList.contains('open')?'▾':'▸'; });
  $$('#drawer .seq-head[data-obj]').forEach(h=>h.onclick=()=>{ const b=$('#obj-'+h.dataset.obj); b.classList.toggle('open'); h.querySelector('.seq-caret').textContent = b.classList.contains('open')?'▾':'▸'; });
  $$('#drawer .mini-copy').forEach(b=>b.onclick=()=>{ const t=seq[b.dataset.i]; navigator.clipboard?.writeText((t.subject?t.subject+'\n\n':'')+t.body); toast(t.label+' copied','good'); });
  $('#drawer').classList.add('open');
}
function closeDrawer(){ $('#drawer').classList.remove('open'); }

let toastT; function toast(m,k=''){ const t=$('#toast'); t.textContent=m; t.className='toast show '+k; clearTimeout(toastT); toastT=setTimeout(()=>t.className='toast '+k,2400); }

function boot(){
  $('#btn-search').onclick=run; $('#btn-refresh').onclick=run; $('#btn-clear').onclick=clearFilters; $('#drawer-close').onclick=closeDrawer;
  $$('.view-toggle button').forEach(b=>b.onclick=()=>{ P.view=b.dataset.view; $$('.view-toggle button').forEach(x=>x.classList.toggle('on',x===b)); render(); });
  $('#sort-select').onchange=e=>{ const [k,d]=e.target.value.split(':'); P.sortKey=k;P.sortDir=d; sortNow(); render(); };
  $$('.filters input').forEach(i=>i.addEventListener('keydown',e=>{ if(e.key==='Enter') run(); }));
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });
  run();
}
document.addEventListener('DOMContentLoaded', boot);
