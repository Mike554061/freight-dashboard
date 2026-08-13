/* =============================================================================
 * FleetView — Bid Room UI
 * =========================================================================== */
'use strict';
const BR = { awards:[], analysis:null, naics:'484230', years:4, keyword:'' };
const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>n?'$'+Math.round(n).toLocaleString():'—';

function readInputs(){
  BR.naics=$('#f-naics').value; BR.years=+$('#f-years').value||4; BR.keyword=$('#f-keyword').value.trim();
}
async function runSearch(){
  readInputs();
  const btn=$('#btn-search'); btn.disabled=true; btn.textContent='Pulling USASpending…';
  $('#results').innerHTML='<div class="empty">Querying federal award history…</div>';
  try{
    BR.awards = await fetchAwards(BR.naics, BR.years, BR.keyword||null);
    if(!BR.awards.length){ $('#results').innerHTML='<div class="empty">No awards found for this NAICS/keyword/window.<br><span class="muted">Try a broader NAICS or more years.</span></div>'; BR.analysis=null; return; }
    BR.analysis = analyzeAwards(BR.awards);
    renderMarket(); renderBidCalc();
  } catch(e){ $('#results').innerHTML=`<div class="empty">USASpending error: ${e.message}<br><span class="muted">Public API — try again in a moment.</span></div>`; }
  finally{ btn.disabled=false; btn.textContent='Analyze market'; }
}

function renderMarket(){
  const a=BR.analysis;
  const years=Object.keys(a.byYear).sort();
  const maxY=Math.max(...years.map(y=>a.byYear[y]),1);
  const bars=years.map(y=>`<div class="ybar"><div class="yb-fill" style="height:${Math.max(4,a.byYear[y]/maxY*100)}%" title="${fmtBig(a.byYear[y])}"></div><div class="yb-lab">${y}</div></div>`).join('');
  const naicsLabel=BID_NAICS[BR.naics]||BR.naics;
  $('#results').innerHTML=`
    <div class="sec-head">${naicsLabel} <span class="muted">· NAICS ${BR.naics} · last ${BR.years} yrs · top ${a.count} awards</span></div>
    <div class="kpis">
      <div class="kpi"><div class="kv-n">${a.count}</div><div class="kv-l">Awards</div></div>
      <div class="kpi"><div class="kv-n">${fmtBig(a.total)}</div><div class="kv-l">Total awarded</div></div>
      <div class="kpi"><div class="kv-n">${fmtBig(a.median)}</div><div class="kv-l">Median award</div></div>
      <div class="kpi"><div class="kv-n">${fmtBig(a.avg)}</div><div class="kv-l">Avg award</div></div>
      <div class="kpi"><div class="kv-n" style="color:${a.concentration==='concentrated'?'#f85149':a.concentration==='moderate'?'#f2a541':'#3fb950'}">${a.top3share.toFixed(0)}%</div><div class="kv-l">Top-3 share (${a.concentration})</div></div>
    </div>

    <div class="two-col">
      <div>
        <div class="sec-title">Award trend (by start year)</div>
        <div class="ybars">${bars||'<span class="muted">—</span>'}</div>
      </div>
      <div>
        <div class="sec-title">Who wins (your competition)</div>
        <div class="comp-list">${a.topRecipients.map(r=>`
          <div class="comp"><div class="comp-n">${r.recipient}</div>
            <div class="comp-bar"><span style="width:${r.share}%"></span></div>
            <div class="comp-v">${fmtBig(r.total)} · ${r.count}× · ${r.share.toFixed(0)}%</div></div>`).join('')}</div>
      </div>
    </div>

    <div class="sec-title">Recent awards</div>
    <div class="award-list">${BR.awards.slice(0,12).map(w=>`
      <div class="aw"><div><b>${w.recipient}</b> <span class="muted">${w.subAgency||w.agency}</span><div class="muted" style="font-size:11.5px">${(w.desc||'').slice(0,90)}</div></div><b class="mono">${fmtBig(w.amount)}</b></div>`).join('')}</div>`;
}

function renderBidCalc(){
  const a=BR.analysis; if(!a) return;
  const tv = $('#b-target').value || Math.round(a.median);
  const cost = $('#b-cost').value || '';
  const mm = $('#b-margin').value || 20;
  const rec = recommendBid({ targetValue:tv, cost:cost, minMargin:mm, analysis:a });
  const mCls = rec.marginAt==null?'':rec.marginAt>=25?'good':rec.marginAt>=15?'mid':'low';
  let verdict, vcls;
  if(rec.belowFloorMarket){ verdict='⚠︎ Market pays BELOW your margin floor here — bid only if you can cut cost, or pass.'; vcls='no'; }
  else if(rec.marginAt!=null && rec.marginAt>=20){ verdict=`✓ Competitive at the ${rec.percentile}th percentile of wins, and holds ${rec.marginAt.toFixed(0)}% margin.`; vcls='go'; }
  else { verdict=`◐ Winnable but thin — ${rec.marginAt!=null?rec.marginAt.toFixed(0)+'% margin':'set your cost'} at this bid.`; vcls='watch'; }
  $('#bid-out').innerHTML=`
    <div class="analysis">
      <div class="arow"><span>Market anchor (55th pct of wins)</span><b>${money(rec.anchor)}</b></div>
      <div class="arow internal-only"><span>Your margin floor (cost ÷ ${100-mm}%)</span><b>${rec.floor?money(rec.floor):'set cost'}</b></div>
      <div class="arow"><span>Recommended bid</span><b style="color:var(--brand)">${money(rec.recommended)}</b></div>
      <div class="arow internal-only"><span>Margin at recommended</span><b class="rpm ${mCls}">${rec.marginAt!=null?rec.marginAt.toFixed(1)+'%':'—'}</b></div>
      <div class="arow"><span>Position vs win history</span><b>${rec.percentile}th percentile</b></div>
    </div>
    <div class="verdict ${vcls} internal-only">${verdict}</div>`;
}

function boot(){
  // populate NAICS dropdown
  $('#f-naics').innerHTML = Object.entries(BID_NAICS).map(([c,l])=>`<option value="${c}">${c} — ${l}</option>`).join('');
  $('#btn-search').onclick=runSearch;
  $('#f-keyword').addEventListener('keydown',e=>{if(e.key==='Enter')runSearch();});
  $$('#bid-inputs input').forEach(el=>el.addEventListener('input',()=>{ if(BR.analysis) renderBidCalc(); }));
  runSearch();
}
document.addEventListener('DOMContentLoaded', boot);
