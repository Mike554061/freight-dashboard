/* =============================================================================
 * FleetView — Bid Vault UI
 * -----------------------------------------------------------------------------
 * Paste a questionnaire, get drafts. Every draft is editable, every gap is
 * shown rather than smoothed over, and anything you fix can be saved back into
 * the library so the next bid starts further along.
 * =========================================================================== */
'use strict';

const V = { results: [], reveal: false };
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let toastT;
function toast(m, k='') { const el = $('#toast'); el.textContent = m; el.className = 'toast show ' + k;
  clearTimeout(toastT); toastT = setTimeout(() => el.className = 'toast', 2400); }

/* ---------------- Run ---------------- */
function run() {
  const text = $('#v-paste').value;
  if (!text.trim()) { toast('Paste the questionnaire first', 'bad'); return; }
  V.reveal = $('#v-reveal').checked;
  V.results = runVault(text, { revealSensitive: V.reveal });
  if (!V.results.length) { toast('No questions found — number them or end each with a colon', 'bad'); return; }
  logVaultUse($('#v-bid').value.trim(), V.results);
  renderResults(); renderKpis(); renderLog();
  $('#results-card').style.display = '';
  $('#results-card').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function renderResults() {
  const drafted = V.results.filter(r => r.kind !== 'none').length;
  const gaps = V.results.reduce((s,r) => s + r.gaps.length, 0);
  $('#v-summary').textContent = `${drafted}/${V.results.length} drafted · ${gaps} item${gaps===1?'':'s'} to verify`;

  $('#v-results').innerHTML = V.results.map(r => {
    const c = confidenceLabel(r.score);
    const alts = (r.matches && r.matches.length > 1)
      ? `<span class="alt">Use instead:</span>
         <select class="altsel" data-alt="${r.i}">
           ${r.matches.map(m => `<option value="${esc(m.answer.id)}" ${m.answer.id===r.answerId?'selected':''}>${esc(m.answer.title)} (${m.score})</option>`).join('')}
         </select>` : '';
    return `<div class="qa ${c.cls}">
      <div class="qtop">
        <span class="qnum">Q${r.i+1}</span>
        <span class="tag ${c.cls}">${esc(c.label)}${r.score?' · '+r.score:''}</span>
        ${r.kind==='field' ? `<span class="muted" style="font-size:11px">Form field → ${esc(r.field.label)}</span>` : ''}
        ${r.kind==='answer' ? `<span class="muted" style="font-size:11px">${esc(r.category)} · ${esc(r.answerTitle)}</span>` : ''}
        ${r.kind==='none' ? `<span class="muted" style="font-size:11px">Nothing in the library covers this</span>` : ''}
      </div>
      <div class="qtext">${esc(r.question)}</div>
      <textarea class="ans" data-ans="${r.i}" placeholder="${r.kind==='none'?'Write this answer, then save it to the library so it is reusable.':''}">${esc(r.text)}</textarea>
      ${r.gaps.length ? `<div class="gaps"><b>⚠ Verify before submitting</b><ul>${r.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
      <div class="qact">
        <button class="mini-btn" data-copy="${r.i}">Copy</button>
        <button class="mini-btn" data-save="${r.i}">Save to library</button>
        ${alts}
      </div>
    </div>`;
  }).join('');

  $$('#v-results [data-ans]').forEach(t => t.oninput = () => { V.results[+t.dataset.ans].text = t.value; });
  $$('#v-results [data-copy]').forEach(b => b.onclick = async () => {
    const r = V.results[+b.dataset.copy];
    try { await navigator.clipboard.writeText(r.text); toast('Answer copied', 'good'); }
    catch { toast('Copy blocked — select the text', 'bad'); }
  });
  $$('#v-results [data-save]').forEach(b => b.onclick = () => saveToLibrary(+b.dataset.save));
  $$('#v-results [data-alt]').forEach(sel => sel.onchange = () => {
    const r = V.results[+sel.dataset.alt];
    const m = r.matches.find(x => x.answer.id === sel.value);
    if (!m) return;
    const composed = composeAnswer(m.answer, { revealSensitive: V.reveal });
    Object.assign(r, { answerId:m.answer.id, answerTitle:m.answer.title, category:m.answer.category,
                       score:m.score, text:composed.text, gaps:composed.gaps });
    renderResults();
  });
}

/* Save an edited draft back into the library. A reused answer is only as good
 * as the last bid it survived — this is how the library actually improves. */
function saveToLibrary(idx) {
  const r = V.results[idx];
  if (!r.text.trim()) { toast('Nothing to save', 'bad'); return; }
  const suggested = r.answerTitle || r.question.slice(0, 60);
  const title = prompt('Title for this answer (reused as the library entry name)', suggested);
  if (title === null) return;
  const id = r.answerId || 'user_' + title.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,40);
  const existing = answerLibrary().find(a => a.id === id);
  const kwSeed = (existing ? existing.keywords : tokens(r.question)).join(', ');
  const kw = prompt('Keywords that should match this answer (comma separated)', kwSeed);
  if (kw === null) return;
  upsertAnswer({
    id, title: title.trim(),
    category: (existing && existing.category) || (r.kind==='field' ? 'Company' : 'Custom'),
    keywords: kw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
    body: r.text,
  });
  renderLibrary(); renderKpis();
  toast('Saved to the library — it will match next time', 'good');
}

/* ---------------- Vault panels ---------------- */
function renderProfile() {
  const p = profile();
  const rows = FIELD_MAP.filter(f => !f.sensitive).map(f => {
    const v = p[f.key];
    return `<div class="lrow" style="padding:7px 0">
      <div class="lmain"><div class="lsub" style="margin:0">${esc(f.label)}</div>
        <div style="font-size:12.5px;font-weight:600;${v?'':'color:var(--bad)'}">${esc(v || '⚠ not on file')}</div></div>
    </div>`;
  }).join('');
  $('#v-profile').innerHTML = rows +
    `<div class="muted" style="margin-top:9px;font-size:11.5px">Edited on the
      <a href="onboarding.html" style="color:var(--brand)">Onboarding</a> page — one profile feeds both.</div>`;
}

function renderPrivate() {
  const p = privateProfile();
  const sens = FIELD_MAP.filter(f => f.sensitive);
  $('#v-private').innerHTML =
    `<div class="warnbox">Stored in this browser only. Never written to the repo, never uploaded,
      and never pasted into a draft unless you tick the insert box for that run.</div>` +
    sens.map(f => `<div class="vault-f" style="margin-top:9px">
      <label>${esc(f.label)}</label>
      <input class="c-in" data-priv="${esc(f.key)}" value="${esc(p[f.key]||'')}"
             placeholder="${f.key==='ein'?'XX-XXXXXXX':'not set'}"></div>`).join('') +
    `<button class="btn primary" id="v-savepriv" style="width:100%;justify-content:center;margin-top:9px">Save to this device</button>`;
  $('#v-savepriv').onclick = () => {
    const patch = {};
    $$('#v-private [data-priv]').forEach(i => patch[i.dataset.priv] = i.value.trim());
    savePrivate(patch); renderProfile(); toast('Saved to this device', 'good');
  };
}

function renderLibrary() {
  const lib = answerLibrary();
  $('#v-libcount').textContent = `${lib.length} answers · ${userAnswers().length} yours`;
  $('#v-library').innerHTML = lib.map(a => `
    <div class="libitem">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="lt">${esc(a.title)}</span>
        ${isCustom(a.id) ? '<span class="tag strong">yours</span>' : ''}
      </div>
      <div class="lc">${esc(a.category)}</div>
      <div class="lk">${esc(a.keywords.slice(0,8).join(' · '))}</div>
      <div style="display:flex;gap:7px;margin-top:9px">
        <button class="mini-btn" data-edit="${esc(a.id)}">Edit</button>
        ${isCustom(a.id) ? `<button class="mini-btn" data-rm="${esc(a.id)}">Reset</button>` : ''}
      </div>
    </div>`).join('');

  $$('#v-library [data-edit]').forEach(b => b.onclick = () => editAnswer(b.dataset.edit));
  $$('#v-library [data-rm]').forEach(b => b.onclick = () => {
    if (!confirm('Reset this answer to the shipped version (or remove it if it was yours)?')) return;
    deleteUserAnswer(b.dataset.rm); renderLibrary(); renderKpis(); toast('Reset');
  });
}

function editAnswer(id) {
  const a = answerLibrary().find(x => x.id === id); if (!a) return;
  const body = prompt(`Body for "${a.title}".\n\nUse {{legalName}}, {{mc}}, {{dot}}, {{serviceArea}}, {{equipment}}, {{phone}}, {{contactName}} etc. to pull live vault values.`, a.body);
  if (body === null) return;
  const kw = prompt('Keywords (comma separated)', a.keywords.join(', '));
  if (kw === null) return;
  upsertAnswer({ id:a.id, title:a.title, category:a.category,
                 keywords: kw.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean), body });
  renderLibrary(); toast('Answer updated', 'good');
}

function addAnswer() {
  const title = prompt('Title for the new answer'); if (!title) return;
  const kw = prompt('Keywords that should match it (comma separated)', title.toLowerCase());
  if (kw === null) return;
  const body = prompt('Answer body. {{tokens}} pull live values from the vault.', '');
  if (body === null) return;
  upsertAnswer({ id:'user_' + title.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,40),
                 title, category:'Custom',
                 keywords: kw.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean), body });
  renderLibrary(); renderKpis(); toast('Added to the library', 'good');
}

function renderKpis() {
  const lib = answerLibrary();
  const log = vaultLog();
  const p = profile();
  const filled = FIELD_MAP.filter(f => !f.sensitive && p[f.key]).length;
  const total  = FIELD_MAP.filter(f => !f.sensitive).length;
  const lastGaps = V.results.length ? V.results.reduce((s,r)=>s+r.gaps.length,0) : (log[0] ? log[0].gaps : 0);
  const drafted = V.results.length ? V.results.filter(r=>r.kind!=='none').length : (log[0] ? log[0].drafted : 0);
  const asked   = V.results.length ? V.results.length : (log[0] ? log[0].questions : 0);

  const k = [
    { k:'Answers in library', v:lib.length, s:`${userAnswers().length} written by you`, cls:'brand' },
    { k:'Profile complete', v:`${filled}/${total}`, s:'Public vault fields on file', cls: filled===total?'good':'warn' },
    { k:'Last run drafted', v: asked ? `${drafted}/${asked}` : '—', s: asked ? 'Questions auto-answered' : 'Nothing run yet' },
    { k:'To verify', v:lastGaps || 0, s: lastGaps ? 'Gaps flagged, not guessed' : 'No open gaps', cls: lastGaps ? 'warn':'good' },
    { k:'Bids drafted', v:log.length, s:'Logged to the activity feed', internal:true },
  ];
  $('#vkpis').innerHTML = k.map(x =>
    `<div class="kpi ${x.cls||''} ${x.internal?'internal-only':''}">
      <div class="k">${esc(x.k)}</div><div class="v">${esc(x.v)}</div><div class="s">${esc(x.s)}</div></div>`).join('');
}

function renderLog() {
  const log = vaultLog();
  if (!log.length) { $('#v-log').innerHTML = `<div class="empty-sm">No bids drafted yet.</div>`; return; }
  $('#v-log').innerHTML = log.slice(0,20).map(e => `
    <div class="lrow" style="padding:8px 0">
      <div class="lmain"><div class="ltitle">${esc(e.bid)}</div>
        <div class="lsub">${e.drafted}/${e.questions} drafted · ${e.gaps} to verify</div></div>
      <div class="lright">${esc(fvAgo(e.t))}</div>
    </div>`).join('');
}

/* ---------------- Export ---------------- */
function exportText() {
  return V.results.map(r =>
    `Q${r.i+1}. ${r.question}\n\n${r.text}\n${r.gaps.length ? '\n[VERIFY: ' + r.gaps.join('; ') + ']\n' : ''}`
  ).join('\n' + '-'.repeat(60) + '\n\n');
}
function csvCell(s) { return '"' + String(s == null ? '' : s).replace(/"/g,'""') + '"'; }
function exportCsv() {
  return 'question,answer,confidence,verify\n' + V.results.map(r =>
    [csvCell(r.question), csvCell(r.text), csvCell(confidenceLabel(r.score).label), csvCell(r.gaps.join('; '))].join(',')
  ).join('\n');
}
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  $('#v-note').textContent = MATCH_NOTE;
  $('#v-run').onclick = run;
  $('#v-clear').onclick = () => {
    $('#v-paste').value = ''; V.results = [];
    $('#results-card').style.display = 'none'; renderKpis();
  };
  $('#v-addans').onclick = addAnswer;
  $('#v-file').onchange = e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { $('#v-paste').value = String(rd.result || ''); toast('Loaded ' + f.name, 'good'); };
    rd.readAsText(f);
  };
  $('#v-copyall').onclick = async () => {
    try { await navigator.clipboard.writeText(exportText()); toast('All answers copied', 'good'); }
    catch { toast('Copy blocked — use Download instead', 'bad'); }
  };
  $('#v-dltxt').onclick = () => download('bid-answers.txt', exportText(), 'text/plain');
  $('#v-dlcsv').onclick = () => download('bid-answers.csv', exportCsv(), 'text/csv');

  renderProfile(); renderPrivate(); renderLibrary(); renderKpis(); renderLog();
});
