/* =============================================================================
 * FleetView — Carrier↔Broker Outreach UI
 * =========================================================================== */
'use strict';
const BK = { all:[], filtered:[], sortKey:'company', sortDir:'asc' };
const BK_STATUS = ['New','Packet Sent','Setup','Quoting','Booked','Active','Dormant'];
const BK_COLOR = { New:'#6b7684','Packet Sent':'#4c8dff',Setup:'#f2a541',Quoting:'#c471ed',Booked:'#00b4a6',Active:'#3fb950',Dormant:'#f85149' };
const TYPE_BADGE = { 'cold-chain':'#4c8dff', local:'#00b4a6', general:'#9aa7b4' };
const EQUIP_LABEL = { V:'Dry Van', BOX:'Box Truck', R:'Reefer', F:'Flatbed', HS:'Hotshot', CV:'Cargo Van' };

const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>n?'$'+Math.round(n).toLocaleString():'—';

/* per-broker record: {status, notes, contact, quotes:[], trips:[]} */
const BK_KEY='fleetview_broker_book';
function loadBook(){ try{return JSON.parse(localStorage.getItem(BK_KEY)||'{}');}catch{return{};} }
function saveBook(b){ localStorage.setItem(BK_KEY,JSON.stringify(b)); }
function recOf(id){ return loadBook()[id]||{status:'New',notes:'',contact:{},quotes:[],trips:[]}; }
function setRec(id,patch){ const b=loadBook(); b[id]=Object.assign(recOf(id),patch); saveBook(b); BK.all.forEach(x=>{if(x.id===id)Object.assign(x,patch);}); }

function readFilters(){ return { keyword:$('#f-keyword').value.trim()||null, type:$('#f-type').value||null }; }
function clearFilters(){ $('#f-keyword').value=''; $('#f-type').value=''; run(); }

async function run(){
  const btn=$('#btn-refresh'); btn.disabled=true; btn.textContent='Loading…';
  try{
    const { brokers } = await fetchBrokers(readFilters());
    const book=loadBook();
    BK.all = brokers.map(b=>Object.assign(b, book[b.id]||{status:'New',notes:'',contact:{},quotes:[],trips:[]}));
    sort(); render();
  } catch(e){ toast('Load failed: '+e.message,'bad'); }
  finally{ btn.disabled=false; btn.textContent='↻ Refresh'; }
}
function sort(){ const k=BK.sortKey,d=BK.sortDir==='asc'?1:-1;
  BK.filtered=[...BK.all].sort((a,b)=>{let av=(a[k]||'').toString().toLowerCase(),bv=(b[k]||'').toString().toLowerCase();return av>bv?d:av<bv?-d:0;}); }

function render(){
  $('#count-num').textContent=BK.filtered.length;
  renderStrip();
  const tb=$('#tbody');
  tb.innerHTML=BK.filtered.map(rowHtml).join('');
  $$('#tbody tr').forEach(tr=>tr.onclick=()=>openDrawer(tr.dataset.id));
}
function renderStrip(){
  const c={}; BK_STATUS.forEach(s=>c[s]=0); BK.all.forEach(b=>c[b.status]=(c[b.status]||0)+1);
  const active=BK.all.filter(b=>['Booked','Active'].includes(b.status)).length;
  $('#pipe-strip').innerHTML = BK_STATUS.map(s=>`<div class="pipe-stat"><span class="dot" style="background:${BK_COLOR[s]}"></span>${s} <b>${c[s]}</b></div>`).join('')+`<div class="pipe-stat val">Booked+Active: <b>${active}</b></div>`;
}
function rowHtml(b){
  const rec=recOf(b.id); const q=(rec.quotes||[]).length, t=(rec.trips||[]).length;
  const contact = (b.contact&&b.contact.email)?(b.contact.name||b.contact.email):(b.email||'<span class="muted">add</span>');
  return `<tr data-id="${b.id}">
    <td><div class="lane">${b.company}</div><div class="sub">${b.hq}</div></td>
    <td><span class="pill" style="background:${TYPE_BADGE[b.type]}22;color:${TYPE_BADGE[b.type]}">${b.type}</span></td>
    <td class="sub internal-only">${b.daysToPay?b.daysToPay+'d':'—'}<div class="sub">${b.creditNote||''}</div></td>
    <td class="sub">${contact}</td>
    <td class="sub internal-only">${q} quote${q!==1?'s':''} · ${t} trip${t!==1?'s':''}</td>
    <td><span class="status-pill" style="border-color:${BK_COLOR[b.status]};color:${BK_COLOR[b.status]}">${b.status}</span></td>
  </tr>`;
}

/* ---------------- Broker profile drawer ---------------- */
function findB(id){ return BK.all.find(b=>b.id===id); }
function openDrawer(id){
  const b=findB(id); if(!b) return;
  const rec=recOf(id); const c=b.contact||rec.contact||{};
  const mail=brokerSetupEmail(Object.assign({},b,{contact:c}));
  const quotes=rec.quotes||[], trips=rec.trips||[];
  $('#drawer-body').innerHTML=`
    <div class="dl-lane">${b.company}</div>
    <div class="dl-dates">${b.hq} · <span class="pill" style="background:${TYPE_BADGE[b.type]}22;color:${TYPE_BADGE[b.type]}">${b.type}</span><span class="internal-only"> · pays ~${b.daysToPay||'?'}d</span></div>
    <div style="font-size:13px;margin-top:10px">${b.about}</div>
    ${b.url?`<a class="btn ghost" href="${b.url}" target="_blank" rel="noopener" style="width:100%;justify-content:center;margin-top:8px">Broker site ↗</a>`:''}
    <div class="sec-title">Lanes they run</div><div class="chips">${(b.lanes||[]).map(l=>`<span class="chip">${l}</span>`).join('')}</div>

    <div class="sec-title">Contact</div>
    <input id="c-name" class="c-in" placeholder="Rep name" value="${c.name||''}">
    <input id="c-email" class="c-in" placeholder="Email" value="${c.email||b.email||''}">
    <input id="c-phone" class="c-in" placeholder="Phone" value="${c.phone||b.phone||''}">
    <button class="btn primary" id="save-contact" style="width:100%;justify-content:center">Save contact</button>

    <div class="sec-title">Carrier-setup email</div>
    <div class="broker-card">
      <div class="lbl-min">Subject</div><div class="mono-box">${mail.subject}</div>
      <textarea id="mail-body" class="notes-area" style="min-height:170px;margin-top:8px">${mail.body}</textarea>
      <button class="btn" id="copy-mail" style="width:100%;justify-content:center;margin-top:8px">Copy setup email</button>
    </div>

    <div class="sec-title internal-only">Quote log <button class="btn mini-add" id="add-quote">+ quote</button></div>
    <div class="log internal-only" id="quote-log">${quotes.length?quotes.map(logQuoteRow).join(''):'<div class="muted" style="font-size:12px">No quotes logged.</div>'}</div>

    <div class="sec-title internal-only">Trip log <button class="btn mini-add" id="add-trip">+ trip</button></div>
    <div class="log internal-only" id="trip-log">${trips.length?trips.map(logTripRow).join(''):'<div class="muted" style="font-size:12px">No trips logged.</div>'}</div>

    <div class="sec-title internal-only">Pipeline</div>
    <div class="status-row internal-only">${BK_STATUS.map(s=>`<button class="stbtn ${b.status===s?'on':''}" data-s="${s}" style="--c:${BK_COLOR[s]}">${s}</button>`).join('')}</div>
    <div class="sec-title internal-only">Notes</div>
    <textarea id="b-notes" class="notes-area internal-only" placeholder="Setup status, rep, lane notes…">${rec.notes||''}</textarea>`;

  $$('#drawer .stbtn').forEach(x=>x.onclick=()=>{ setRec(id,{status:x.dataset.s}); openDrawer(id); render(); toast('→ '+x.dataset.s,'good'); });
  $('#b-notes').onchange=e=>{ setRec(id,{notes:e.target.value}); toast('Note saved','good'); };
  $('#save-contact').onclick=()=>{ const contact={name:$('#c-name').value.trim(),email:$('#c-email').value.trim(),phone:$('#c-phone').value.trim()}; setRec(id,{contact}); openDrawer(id); render(); toast('Contact saved','good'); };
  $('#copy-mail').onclick=()=>{ navigator.clipboard?.writeText(mail.subject+'\n\n'+$('#mail-body').value); toast('Setup email copied','good'); };
  $('#add-quote').onclick=(e)=>{ e.stopPropagation(); addQuote(id); };
  $('#add-trip').onclick=(e)=>{ e.stopPropagation(); addTrip(id); };
  $('#drawer').classList.add('open');
}
function closeDrawer(){ $('#drawer').classList.remove('open'); }
function logQuoteRow(q){ return `<div class="log-row"><span>${q.date} · ${q.lane}</span><b>${money(q.rate)}</b></div>`; }
function logTripRow(t){ return `<div class="log-row"><span>${t.date} · ${t.lane}</span><b>${money(t.rate)} <span class="sub">${t.status||''}</span></b></div>`; }
function today(){ return new Date('2026-08-02').toISOString().slice(0,10); }
function addQuote(id){ const lane=prompt('Lane (e.g. Cleveland → Detroit)?'); if(!lane)return; const rate=parseFloat(prompt('Quoted rate $?')||'0');
  const rec=recOf(id); const quotes=(rec.quotes||[]).concat([{date:today(),lane,rate}]); setRec(id,{quotes}); openDrawer(id); render(); toast('Quote logged','good'); }
function addTrip(id){ const lane=prompt('Lane run?'); if(!lane)return; const rate=parseFloat(prompt('Rate $?')||'0'); const status=prompt('Status (Delivered/Booked/Invoiced)?','Delivered')||'';
  const rec=recOf(id); const trips=(rec.trips||[]).concat([{date:today(),lane,rate,status}]); setRec(id,{trips}); openDrawer(id); render(); toast('Trip logged','good'); }

/* ---------------- Freight calculator (slide-out) ---------------- */
function calcInputs(){
  return { miles:$('#k-miles').value, equip:$('#k-equip').value, equipLabel:EQUIP_LABEL[$('#k-equip').value],
    rpm:$('#k-rpm').value, deadhead:$('#k-dh').value, accessorials:$('#k-acc').value,
    fuelSurcharge:$('#k-fuel').checked, fuelPerGal:$('#k-fpg').value, mpg:$('#k-mpg').value,
    laborHrs:$('#k-lhrs').value, laborRate:$('#k-lrate').value, vehPerMi:$('#k-veh').value, overhead:$('#k-oh').value };
}
function runCalc(){
  const o=calcInputs(); const r=calcRate(o);
  $('#k-out').innerHTML=`
    <div class="k-row"><span>Line-haul (${r.miles}mi × $${r.rpm})</span><b>${money(r.linehaul)}</b></div>
    ${r.dh?`<div class="k-row"><span>Deadhead ${r.dh}mi</span><b>${money(r.dhCost)}</b></div>`:''}
    ${r.fuel?`<div class="k-row"><span>Fuel surcharge</span><b>${money(r.fuel)}</b></div>`:''}
    ${r.accessorials?`<div class="k-row"><span>Accessorials</span><b>${money(r.accessorials)}</b></div>`:''}
    <div class="k-row total"><span>All-in (quote)</span><b>${money(r.total)}</b></div>
    <div class="k-row"><span>Effective $/mi</span><b>$${r.allInRpm.toFixed(2)}</b></div>`;
  const mCls = r.marginPct>=35?'good':r.marginPct>=20?'mid':'low';
  $('#k-cost').innerHTML=`
    <div class="k-row"><span>Fuel (${r.laborHrs}h routed)</span><b>${money(r.costFuel)}</b></div>
    <div class="k-row"><span>Labor</span><b>${money(r.labor)}</b></div>
    <div class="k-row"><span>Vehicle</span><b>${money(r.vehicle)}</b></div>
    <div class="k-row"><span>Overhead</span><b>${money(r.overhead)}</b></div>
    <div class="k-row total" style="color:#f2a541"><span>Cost</span><b>${money(r.cost)}</b></div>
    <div class="k-row total" style="color:${r.profit>=0?'#3fb950':'#f85149'}"><span>Profit</span><b>${money(r.profit)} · ${r.marginPct.toFixed(1)}%</b></div>`;
  const lane=$('#k-lane').value.trim();
  $('#k-quote').value=quoteText(o,r,lane);
}
function toggleCalc(open){ $('#calc-panel').classList.toggle('open', open); if(open) runCalc(); }

let toastT; function toast(m,k=''){ const t=$('#toast'); t.textContent=m; t.className='toast show '+k; clearTimeout(toastT); toastT=setTimeout(()=>t.className='toast '+k,2200); }

/* ---------------- Packet panel ---------------- */
function renderPacket(){
  $('#packet-list').innerHTML = PACKET.map(p=>{
    const badge={have:'#3fb950',created:'#00b4a6',need:'#f2a541',optional:'#6b7684'}[p.status];
    const lbl={have:'On file',created:'Created',need:'Get it',optional:'Optional'}[p.status];
    return `<div class="pk-item">
      <span class="pk-dot" style="background:${badge}"></span>
      <div class="pk-main"><div class="pk-title">${p.label} <span class="pk-badge" style="color:${badge}">${lbl}</span></div>
        <div class="pk-note">${p.note}</div>
        ${p.url?`<a href="${p.url}" target="_blank" rel="noopener" class="pk-link">${p.doc||'Open'} ↗</a>`:''}</div>
    </div>`;
  }).join('');
}

function boot(){
  $('#btn-refresh').onclick=run; $('#btn-search').onclick=run; $('#btn-clear').onclick=clearFilters;
  $('#drawer-close').onclick=closeDrawer;
  $('#f-keyword').addEventListener('keydown',e=>{if(e.key==='Enter')run();});
  $('#calc-open').onclick=()=>toggleCalc(true); $('#calc-close').onclick=()=>toggleCalc(false);
  $('#packet-open').onclick=()=>$('#packet-panel').classList.add('open'); $('#packet-close').onclick=()=>$('#packet-panel').classList.remove('open');
  $$('#calc-panel input, #calc-panel select').forEach(el=>el.addEventListener('input',runCalc));
  $('#k-copy').onclick=()=>{ navigator.clipboard?.writeText($('#k-quote').value); toast('Quote reply copied','good'); };
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeDrawer(); toggleCalc(false); $('#packet-panel').classList.remove('open'); } });
  renderPacket();
  run();
}
document.addEventListener('DOMContentLoaded', boot);
