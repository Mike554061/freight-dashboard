/* =============================================================================
 * FleetView — Marketing UI
 * -----------------------------------------------------------------------------
 * Collateral, plays, campaigns — and attribution read straight off the pipeline.
 * No campaign here reports a number that was not earned by a tagged pursuit.
 * =========================================================================== */
'use strict';

const M = { opps: [], raw: [] };
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(msg, cls) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (cls||'');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', 2600);
}

function loadOpps() {
  const byId = new Map();
  ((typeof buildSampleOpps === 'function') ? buildSampleOpps() : []).forEach(o => byId.set(o.id, o));
  scoutFindingsAsOpps().forEach(o => byId.set(o.id, o));
  M.raw = [...byId.values()];
  M.opps = Pipeline.decorate(M.raw);
}
function refresh() { M.opps = Pipeline.decorate(M.raw); render(); }

function render() { renderKpis(); renderCampaigns(); renderPlays(); renderCollateral(); renderCap(); renderUntagged(); }

function renderKpis() {
  const camps = loadCampaigns();
  const tagged = M.opps.filter(o => o.campaign);
  const open = tagged.filter(Pipeline.isOpen);
  const won = tagged.filter(o => o.status === 'Won');
  const touches = camps.reduce((s,c) => s + (c.touches||0), 0);
  const cov = M.opps.length ? Math.round(tagged.length / M.opps.length * 100) : 0;

  const k = [
    { k:'Active campaigns', v:camps.length, s: camps.length ? 'Running now' : 'None created', cls:'brand' },
    { k:'Touches logged', v:touches, s:'Counted as you log them' },
    { k:'Pursuits tagged', v:tagged.length, s:`${cov}% of the pipeline is attributed`, cls: cov < 50 ? 'warn' : 'good' },
    { k:'Sourced & open', v:open.length, s:fvMoney(open.reduce((s,o)=>s+(o.effValue||0),0)) + ' in play' },
    { k:'Sourced wins', v:won.length, s: won.length ? fvMoney(won.reduce((s,o)=>s+(o.effValue||0),0)) + ' won' : 'Nothing closed yet', cls: won.length ? 'good':'', internal:true },
  ];
  $('#mkpis').innerHTML = k.map(x =>
    `<div class="kpi ${x.cls||''} ${x.internal?'internal-only':''}">
       <div class="k">${esc(x.k)}</div><div class="v">${esc(x.v)}</div><div class="s">${esc(x.s)}</div></div>`).join('');
}

function renderCampaigns() {
  const camps = loadCampaigns();
  if (!camps.length) {
    $('#campaigns').innerHTML = `<div class="empty-sm">No campaigns yet.<br>Add one above, then tag pursuits to it from the list on the right.</div>`;
    return;
  }
  $('#campaigns').innerHTML = camps.map(c => {
    const a = campaignAttribution(c.id, M.opps);
    const play = PLAYS.find(p => p.key === c.play);
    return `<div class="lrow">
      <div class="lmain">
        <div class="ltitle">${esc(c.name)}</div>
        <div class="lsub">${esc(c.channel)}${play ? ' · ' + esc(play.name) : ''} · created ${esc(new Date(c.created).toLocaleDateString())}</div>
        <div class="lsub" style="margin-top:5px;color:var(--txt-2)">
          <b style="color:var(--txt)">${a.touched}</b> tagged ·
          <b style="color:var(--txt)">${a.open}</b> open ·
          <b style="color:var(--txt)">${a.won}</b> won ·
          <span class="internal-only">${fvMoney(a.openValue)} open value</span>
        </div>
      </div>
      <div class="lright" style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <div><button class="mini-btn" data-touch="${esc(c.id)}">+ touch</button></div>
        <div class="muted">${c.touches||0} logged</div>
        <button class="mini-btn" data-del="${esc(c.id)}" style="border-color:var(--line)">Remove</button>
      </div>
    </div>`;
  }).join('');

  $$('#campaigns [data-touch]').forEach(b => b.onclick = () => { bumpTouches(b.dataset.touch, 1); render(); });
  $$('#campaigns [data-del]').forEach(b => b.onclick = () => {
    if (!confirm('Remove this campaign? Pursuits stay in the pipeline, they just lose the tag.')) return;
    removeCampaign(b.dataset.del); render(); toast('Campaign removed');
  });
}

function renderPlays() {
  $('#plays').innerHTML = PLAYS.map(p => {
    const asset = COLLATERAL.find(c => c.key === p.asset);
    return `<div class="play">
      <div class="ptop">
        <span class="pname">${esc(p.name)}</span>
        <span class="tag watch">${esc(p.channel)}</span>
        <span class="status-pill" style="color:${Pipeline.STATUS_COLOR[p.stage]};border-color:${Pipeline.STATUS_COLOR[p.stage]}">${esc(p.stage)}</span>
      </div>
      <div class="pline"><b>Trigger:</b> ${esc(p.trigger)}</div>
      <div class="pline"><b>Send:</b> ${esc(asset ? asset.name : p.asset)}</div>
      <div class="pwhy">${esc(p.why)}</div>
    </div>`;
  }).join('');
}

function renderCollateral() {
  $('#collateral').innerHTML = COLLATERAL.map(c => `
    <div class="mtile">
      <div class="mname">${esc(c.name)}</div>
      <div class="mmeta">${esc(c.type)}</div>
      <div class="muse">${esc(c.use)}</div>
      <div class="mact">
        ${c.href ? `<a class="mini-btn" href="${esc(c.href)}" target="_blank" rel="noopener">Open ↗</a>`
                 : `<span class="tag verify">generated below</span>`}
      </div>
    </div>`).join('');
}

function renderCap() {
  const txt = capabilityStatementText();
  $('#capstmt').textContent = txt;
  $('#cap-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(txt); toast('Capability statement copied', 'good'); }
    catch { toast('Copy blocked — select the text manually', 'bad'); }
  };
  $('#cap-dl').onclick = () => {
    const blob = new Blob([txt], { type:'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'supplynow-capability-statement.txt';
    a.click(); URL.revokeObjectURL(a.href);
  };
}

function renderUntagged() {
  const camps = loadCampaigns();
  const untagged = M.opps.filter(o => Pipeline.isOpen(o) && !o.campaign);
  if (!untagged.length) {
    $('#untagged').innerHTML = `<div class="empty-sm">Every open pursuit is attributed to a campaign.</div>`;
    return;
  }
  if (!camps.length) {
    $('#untagged').innerHTML = `<div class="empty-sm">${untagged.length} open pursuits have no campaign.<br>Create a campaign first, then tag them here.</div>`;
    return;
  }
  $('#untagged').innerHTML = untagged.slice(0, 15).map(o => `
    <div class="lrow">
      <div class="lmain">
        <div class="ltitle">${esc(o.title)}</div>
        <div class="lsub">${esc(o.agency||'')} · ${esc(o.status)}</div>
      </div>
      <div class="lright">
        <select class="sort-select" data-tag="${esc(o.id)}">
          <option value="">Tag…</option>
          ${camps.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
    </div>`).join('');

  $$('#untagged [data-tag]').forEach(sel => sel.onchange = () => {
    if (!sel.value) return;
    const id = sel.dataset.tag;
    const o = M.opps.find(x => x.id === id);
    const c = loadCampaigns().find(x => x.id === sel.value);
    Pipeline.set(id, { campaign: sel.value }, { title: o ? o.title : id });
    Pipeline.log({ id, title: o ? o.title : id, kind:'campaign', text:`Tagged to ${c ? c.name : sel.value}` });
    refresh(); toast('Tagged to ' + (c ? c.name : 'campaign'), 'good');
  });
}

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadOpps();
  $('#c-play').innerHTML = '<option value="">— none —</option>' +
    PLAYS.map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('');
  $('#c-add').onclick = () => {
    const name = $('#c-name').value.trim();
    if (!name) { toast('Name the campaign first', 'bad'); return; }
    addCampaign({ name, channel: $('#c-channel').value, play: $('#c-play').value });
    $('#c-name').value = '';
    render(); toast('Campaign added', 'good');
  };
  render();
});
