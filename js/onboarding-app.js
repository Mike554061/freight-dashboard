/* =============================================================================
 * FleetView — Vendor Onboarding UI
 * =========================================================================== */
'use strict';
const OB = { type:'broker', buyer:'' };
const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];

function render(){
  const t = BUYER_TYPES[OB.type];
  const rows = packetRows(OB.type);
  const mail = coverEmail(OB.type, OB.buyer);
  const gaps = t.needs.filter(n => !n[1].startsWith('have') && n[1] !== 'buyer');

  $('#ob-body').innerHTML = `
    <div class="ob-head">
      <div>
        <div class="sec-head">${t.label}</div>
        <div class="muted">${t.intro}</div>
      </div>
      <button class="btn primary" onclick="window.print()">Print / Save packet PDF</button>
    </div>

    <div class="ob-grid">
      <div class="ob-doc">
        <div class="doc-brand"><span class="mark">▣</span> <b>Supply Now Inc.</b> — Vendor Onboarding Packet
          <span class="muted" style="margin-left:auto">${t.label}</span></div>
        <table class="ob-table">${rows.map(r=>`<tr><td class="k">${r[0]}</td><td class="v ${/PROVIDE/.test(r[1])?'gap':''}">${r[1]}</td></tr>`).join('')}</table>
        <div class="ob-refs"><b>References</b><ul>${SN_PROFILE.references.map(x=>`<li>${x}</li>`).join('')}</ul></div>
        <div class="ob-attach"><b>Attachments:</b>
          <a href="${SN_PROFILE.coiDoc}" target="_blank" rel="noopener">COI (Motor Truck Cargo) ↗</a> ·
          <a href="${SN_PROFILE.onePager}" target="_blank" rel="noopener">Capabilities one-pager ↗</a></div>
      </div>

      <div class="ob-side">
        <div class="sec-title">Required-docs checklist</div>
        <div class="ck-list">${t.needs.map(n=>`
          <div class="ck"><span class="ck-dot" style="background:${docColor(n[1])}"></span>
            <span class="ck-lab">${n[0]}</span>
            <span class="ck-badge" style="color:${docColor(n[1])}">${DOC_LABEL[n[1]]}</span></div>`).join('')}</div>

        ${gaps.length?`<div class="ob-gaps internal-only"><b>⚠ To complete (you provide):</b>
          <ul>${gaps.map(g=>`<li>${g[0]} — <span class="muted">${DOC_LABEL[g[1]]}</span></li>`).join('')}</ul>
          <div class="muted" style="font-size:11.5px">I won't fabricate your EIN / UEI / bank — drop them into the profile once and every packet fills automatically.</div></div>`:''}

        <div class="sec-title">Cover email</div>
        <div class="ob-cover">
          <div class="lbl-min">Buyer name (optional)</div>
          <input id="ob-buyer" class="c-in" placeholder="e.g. TQL / VA VISN 10 / Cleveland Clinic" value="${OB.buyer}">
          <div class="lbl-min" style="margin-top:6px">Subject</div><div class="mono-box">${mail.subject}</div>
          <textarea id="ob-mailbody" class="notes-area" style="min-height:200px;margin-top:6px">${mail.body}</textarea>
          <button class="btn" id="ob-copy" style="width:100%;justify-content:center;margin-top:8px">Copy cover email</button>
        </div>
      </div>
    </div>`;

  $('#ob-buyer').oninput = e => { OB.buyer = e.target.value; };
  $('#ob-copy').onclick = () => { navigator.clipboard?.writeText(mail.subject+'\n\n'+$('#ob-mailbody').value); toast('Cover email copied','good'); };
}

let toastT; function toast(m,k=''){ const el=$('#toast'); el.textContent=m; el.className='toast show '+k; clearTimeout(toastT); toastT=setTimeout(()=>el.className='toast '+k,2200); }

function renderMyInfo(){
  const p = privateProfile();
  const f = (id,label,val,ph='')=>`<div class="mi-f"><label>${label}</label><input id="${id}" class="c-in" value="${val||''}" placeholder="${ph}"></div>`;
  $('#ob-myinfo').innerHTML = `
    ${f('mi-ein','EIN (Tax ID)',p.ein,'XX-XXXXXXX')}
    <div class="mi-sub">Banking (ACH)</div>
    ${f('mi-bank','Bank name',p.bankName)}
    ${f('mi-routing','Routing (ABA)',p.routing)}
    ${f('mi-acct','Account #',p.account)}
    ${f('mi-type','Account type',p.acctType,'Business Checking')}
    <div class="mi-sub">Federal / factoring</div>
    ${f('mi-uei','SAM UEI',p.uei)}
    ${f('mi-cage','CAGE code',p.cage)}
    ${f('mi-fact','Factoring co. (blank = direct pay)',p.factoring)}
    <button class="btn primary" id="mi-save" style="width:100%;justify-content:center;margin-top:6px">Save (this device)</button>
    <div class="muted" style="font-size:10.5px;margin-top:6px">Stored only in this browser — never uploaded or committed to the public site.</div>`;
  $('#mi-save').onclick=()=>{
    savePrivate({ ein:$('#mi-ein').value.trim(), bankName:$('#mi-bank').value.trim(), routing:$('#mi-routing').value.trim(),
      account:$('#mi-acct').value.trim(), acctType:$('#mi-type').value.trim(), uei:$('#mi-uei').value.trim(),
      cage:$('#mi-cage').value.trim(), factoring:$('#mi-fact').value.trim() });
    render(); toast('Saved to this device — packets updated','good');
  };
}

function boot(){
  renderMyInfo();
  $('#ob-types').innerHTML = Object.entries(BUYER_TYPES).map(([k,t])=>
    `<button class="ob-type ${k===OB.type?'on':''}" data-k="${k}">${t.label}</button>`).join('');
  $$('#ob-types .ob-type').forEach(b=>b.onclick=()=>{ OB.type=b.dataset.k; $$('#ob-types .ob-type').forEach(x=>x.classList.toggle('on',x===b)); render(); });
  render();
}
document.addEventListener('DOMContentLoaded', boot);
