/* =============================================================================
 * FleetView — BD Command dashboard
 * -----------------------------------------------------------------------------
 * One screen that answers: what is in the funnel, what is drifting, what did
 * the Bid Scout find last night, which feeds are actually working, and what has
 * marketing touched. Everything reads through Pipeline so the numbers here and
 * on the Opportunities board can never disagree.
 * =========================================================================== */
'use strict';

const D = { raw: [], opps: [], live: false, note: '' };
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function toast(msg, cls) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (cls||'');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', 2600);
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- Load ---------------- */
async function load() {
  const btn = $('#btn-refresh'); btn.disabled = true; btn.textContent = '↻ Scanning…';

  // The pipeline is the union of what the scout surfaced and what the
  // Opportunities page is already tracking. Scout findings win on id collision
  // because they carry the analyst read ("why it fits").
  const scout = scoutFindingsAsOpps();
  const base  = (typeof buildSampleOpps === 'function') ? buildSampleOpps() : [];
  const byId = new Map();
  base.forEach(o => byId.set(o.id, o));
  scout.forEach(o => byId.set(o.id, o));

  const res = await refreshScout({});
  if (res.live) { res.opps.forEach(o => byId.set(o.id, o)); D.live = true; }
  D.note = res.note;

  D.raw  = [...byId.values()];
  D.opps = Pipeline.decorate(D.raw);

  const badge = $('#mode-badge');
  badge.className = 'mode-badge ' + (D.live ? 'live' : 'mock');
  badge.textContent = D.live ? '● Live · SAM.gov' : '● ' + (D.note || 'Recorded run');

  btn.disabled = false; btn.textContent = '↻ Rescan';
  render();
}

/* ---------------- Render ---------------- */
function render() { renderKpis(); renderFunnel(); renderAttention(); renderScout(); renderHealth(); renderMktg(); renderActivity(); }

function renderKpis() {
  const open   = D.opps.filter(Pipeline.isOpen);
  const fc     = Pipeline.forecast(D.opps);
  const wr     = Pipeline.winRate(D.opps);
  const soon   = open.filter(o => { const d = fvDaysUntil(o.dueDate); return d !== null && d >= 0 && d <= 7; });
  const stale  = open.filter(Pipeline.isStale);
  const noOwner= open.filter(o => !o.owner);

  const k = [
    { k:'Open pursuits', v:open.length, s:`${D.opps.length} tracked total`, cls:'brand' },
    { k:'In-pursuit value', v:fvMoney(fc.raw), s:`Dollar figure on ${fc.withValue}/${fc.counted} (${fc.coverage}%)`, cls:'' },
    { k:'Weighted forecast', v:fvMoney(fc.weighted), s:'Stage-probability weighted', cls:'', internal:true },
    { k:'Closing ≤ 7 days', v:soon.length, s: soon.length ? 'Deadline pressure now' : 'Nothing urgent', cls: soon.length ? 'warn':'' },
    { k:`Drifting ≥ ${Pipeline.STALE_DAYS}d`, v:stale.length, s:'No stage movement', cls: stale.length ? 'bad':'good' },
    { k:'Unowned', v:noOwner.length, s:'No name against the pursuit', cls: noOwner.length ? 'warn':'good' },
    { k:'Win rate', v: wr.pct === null ? '—' : wr.pct + '%', s: wr.closed ? `${wr.won} won of ${wr.closed} closed` : 'Nothing closed yet', cls:'', internal:true },
  ];
  $('#kpis').innerHTML = k.map(x =>
    `<div class="kpi ${x.cls} ${x.internal ? 'internal-only':''}">
       <div class="k">${esc(x.k)}</div><div class="v">${esc(x.v)}</div><div class="s">${esc(x.s)}</div>
     </div>`).join('');
}

function renderFunnel() {
  const st = Pipeline.byStage(D.opps);
  const max = Math.max(1, ...Pipeline.STATUSES.map(s => st[s].n));
  $('#funnel').innerHTML = Pipeline.STATUSES.map(s => {
    const b = st[s], pct = Math.round(b.n / max * 100);
    return `<div class="frow">
      <div class="fname"><span class="dot" style="background:${Pipeline.STATUS_COLOR[s]}"></span>${s}</div>
      <div class="fbar"><span style="width:${pct}%;background:${Pipeline.STATUS_COLOR[s]};opacity:.55"></span></div>
      <div class="fval"><b>${b.n}</b> · ${b.value ? fvMoney(b.value) : '—'}</div>
    </div>`;
  }).join('');
  const fc = Pipeline.forecast(D.opps);
  $('#funnel-hint').textContent = `${fc.counted} open · value known on ${fc.coverage}%`;
}

function renderAttention() {
  const open = D.opps.filter(Pipeline.isOpen);
  const flagged = [];
  open.forEach(o => {
    const d = fvDaysUntil(o.dueDate);
    const flags = [];
    if (d !== null && d < 0) flags.push({ t:`Deadline passed ${-d}d ago`, c:'bad' });
    else if (d !== null && d <= 3) flags.push({ t:`Closes in ${d}d`, c:'bad' });
    else if (d !== null && d <= 7) flags.push({ t:`Closes in ${d}d`, c:'warn' });
    if (!o.owner) flags.push({ t:'No owner', c:'warn' });
    if (o.nextActionDue && fvDaysUntil(o.nextActionDue) < 0) flags.push({ t:'Next action overdue', c:'bad' });
    if (!o.nextAction && o.status !== 'New') flags.push({ t:'No next action', c:'warn' });
    if (Pipeline.isStale(o)) flags.push({ t:`No movement ${Pipeline.daysSinceMove(o) == null ? 'ever' : Pipeline.daysSinceMove(o)+'d'}`, c:'bad' });
    if (flags.length) flagged.push({ o, flags, urgency: (d === null ? 99 : d) - flags.length * 2 });
  });
  flagged.sort((a,b) => a.urgency - b.urgency);

  if (!flagged.length) {
    $('#attention').innerHTML = `<div class="empty-sm">Nothing flagged.<br>Every open pursuit has an owner, a next action, and recent movement.</div>`;
    return;
  }
  $('#attention').innerHTML = flagged.slice(0, 12).map(({o, flags}) => `
    <div class="lrow">
      <div class="lmain">
        <div class="ltitle">${esc(o.title)}</div>
        <div class="lsub">${esc(o.agency || '')} · ${esc(o.status)}${o.owner ? ' · ' + esc(o.owner) : ''}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          ${flags.map(f => `<span class="tag ${f.c==='bad'?'verify':'watch'}" style="${f.c==='bad'?'background:rgba(248,81,73,.16);color:var(--bad)':''}">${esc(f.t)}</span>`).join('')}
        </div>
        ${o.nextAction ? `<div class="lsub" style="margin-top:6px">Next: ${esc(o.nextAction)}${o.nextActionDue ? ' · due ' + esc(o.nextActionDue) : ''}</div>` : ''}
      </div>
      <div class="lright">
        <button class="mini-btn" data-assign="${esc(o.id)}">Assign</button>
      </div>
    </div>`).join('');

  $$('#attention [data-assign]').forEach(b => b.onclick = () => assign(b.dataset.assign));
}

function assign(id) {
  const o = D.opps.find(x => x.id === id); if (!o) return;
  const owner = prompt(`Owner for "${o.title}"`, o.owner || 'Mike');
  if (owner === null) return;
  const action = prompt('Next action', o.nextAction || '');
  if (action === null) return;
  const due = prompt('Next action due (YYYY-MM-DD)', o.nextActionDue || '');
  if (due === null) return;
  Pipeline.set(id, { owner: owner.trim(), nextAction: action.trim(), nextActionDue: (due||'').trim() }, { title:o.title });
  D.opps = Pipeline.decorate(D.raw);
  render(); toast('Assigned — logged to activity', 'good');
}

function renderScout() {
  const run = latestScoutRun();
  if (!run) { $('#scout').innerHTML = '<div class="empty-sm">No scout run recorded.</div>'; return; }
  $('#scout-hint').textContent = `Last run ${run.date}`;

  const inPipe = new Set(D.opps.filter(o => o.status && o.status !== 'New').map(o => o.id));
  const cards = run.findings.map(f => {
    const d = fvDaysUntil(f.dueDate);
    const dueTxt = d === null ? 'no deadline' : d < 0 ? `closed ${-d}d ago` : `${d}d left`;
    return `<div class="finding ${esc(f.flag)}">
      <div class="ftop">
        <span class="tag ${esc(f.flag)}">${esc(f.flag)}</span>
        <span class="muted" style="font-size:11px">${esc(f.sourceLabel)} · ${esc(f.type)}</span>
      </div>
      <div class="ftitle">${esc(f.title)}</div>
      <div class="fagency">${esc(f.agency)}</div>
      <div class="ffit">${esc(f.fit)}</div>
      ${f.caveat ? `<div class="fcaveat"><span>⚠</span><span>${esc(f.caveat)}</span></div>` : ''}
      <div class="facts">
        <span>NAICS <b>${esc(f.naics)}</b></span>
        <span>Due <b>${esc((f.dueDate||'').slice(0,10))}</b> (${esc(dueTxt)})</span>
        ${f.pop && f.pop.state ? `<span>POP <b>${esc(f.pop.state)}</b></span>` : ''}
        <span>Sol# <b>${esc(f.solicitationNumber)}</b></span>
      </div>
      <div class="factions">
        <a class="mini-btn" href="${esc(f.url)}" target="_blank" rel="noopener">Open on SAM ↗</a>
        <button class="mini-btn" data-pursue="${esc(f.id)}">${inPipe.has(f.id) ? 'In pipeline ✓' : '+ Pursue'}</button>
      </div>
    </div>`;
  }).join('');

  const screened = run.screened && run.screened.length ? `
    <div class="sec-title" style="margin-top:16px">Screened out (${run.screened.length})</div>
    ${run.screened.map(s => `<div class="lrow"><div class="lmain">
        <div class="ltitle" style="font-weight:500;color:var(--txt-2)">${esc(s.title)}</div>
        <div class="lsub">${esc(s.why)}</div></div></div>`).join('')}` : '';

  $('#scout').innerHTML = `<div class="lsub" style="margin-bottom:11px;color:var(--txt-2)">${esc(run.summary)}</div>` + cards + screened;
  $$('#scout [data-pursue]').forEach(b => b.onclick = () => pursue(b.dataset.pursue));
}

function pursue(id) {
  const o = D.opps.find(x => x.id === id); if (!o) return;
  Pipeline.set(id, { status:'Scoping' }, { title:o.title });
  D.opps = Pipeline.decorate(D.raw);
  render(); toast('Moved to Scoping', 'good');
}

function renderHealth() {
  $('#health').innerHTML = SOURCE_HEALTH.map(s => `
    <div class="hrow">
      <span class="hdot" style="background:${HEALTH_COLOR[s.status]}"></span>
      <div>
        <div class="hname">${esc(s.label)} <span class="muted" style="font-weight:500">· ${esc(s.tier)}</span></div>
        <div class="hdetail">${esc(s.detail)}</div>
      </div>
      <div style="text-align:right">
        <div class="hstat" style="color:${HEALTH_COLOR[s.status]}">${esc(s.status)}</div>
        ${s.found != null ? `<div class="muted" style="font-size:11px;margin-top:3px">${s.found} found</div>` : ''}
      </div>
    </div>`).join('');
}

function renderMktg() {
  const camps = loadCampaigns();
  if (!camps.length) {
    $('#mktg').innerHTML = `<div class="empty-sm">No campaigns running.<br>
      Marketing attribution fills in from pursuits tagged to a campaign —
      nothing is estimated.<br>
      <a class="mini-btn" style="margin-top:12px;display:inline-block" href="marketing.html">Open Marketing →</a></div>`;
    return;
  }
  $('#mktg').innerHTML = camps.map(c => {
    const a = campaignAttribution(c.id, D.opps);
    return `<div class="lrow">
      <div class="lmain">
        <div class="ltitle">${esc(c.name)}</div>
        <div class="lsub">${esc(c.channel || '—')} · ${c.touches || 0} touches logged</div>
      </div>
      <div class="lright">
        <div><b style="color:var(--txt)">${a.open}</b> open</div>
        <div class="muted">${a.won} won · ${fvMoney(a.openValue)}</div>
      </div>
    </div>`;
  }).join('') + `<a class="mini-btn" style="margin-top:12px;display:inline-block" href="marketing.html">Open Marketing →</a>`;
}

function renderActivity() {
  const log = Pipeline.logAll();
  if (!log.length) {
    $('#activity').innerHTML = `<div class="empty-sm">No activity recorded yet.<br>Stage moves, owner changes and next actions land here automatically.</div>`;
    return;
  }
  $('#activity').innerHTML = log.slice(0, 60).map(e => `
    <div class="arow">
      <span class="akind">${esc(e.kind)}</span>
      <span><b>${esc(e.title)}</b> — ${esc(e.text)}</span>
      <span class="atime">${esc(fvAgo(e.t))}</span>
    </div>`).join('');
}

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  $('#btn-refresh').onclick = load;
  load();
});
