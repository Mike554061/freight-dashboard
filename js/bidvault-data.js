/* =============================================================================
 * FleetView — Bid Vault: information vault, form matching, draft generation
 * -----------------------------------------------------------------------------
 * The proposal half of the Onboarding agent. onboarding.html turns a BUYER TYPE
 * into a vendor packet; this turns a QUESTIONNAIRE into drafted answers.
 *
 * Three parts:
 *   VAULT     — SN_PROFILE (public facts) + the device-only private profile
 *               (EIN etc., from onboarding-data.js) + an ANSWER LIBRARY of
 *               reusable narrative blocks, each written from things that are
 *               actually true about SupplyNow.
 *   MATCHER   — a TF-IDF retriever over the library. Lexical, not semantic: it
 *               scores a question against answer keywords/titles/bodies with
 *               inverse-document-frequency weighting so generic words
 *               ("company", "please describe") don't dominate the match.
 *               Honest about its ceiling — see MATCH_NOTE.
 *   COMPOSER  — fills {{tokens}} from the vault. A token with no value becomes
 *               a loud ⚠ [NEEDS: …] marker. It NEVER invents a number, a date,
 *               a certification or a dollar limit. A blank that reads as blank
 *               is recoverable; a plausible fabrication in a federal bid is not.
 *
 * Answers the user edits or adds are stored in localStorage and always beat the
 * shipped ones — this library is meant to grow off real submitted proposals.
 * =========================================================================== */
'use strict';

const VAULT_KEY   = 'fleetview_answer_library';   // user-added / edited answers
const VAULT_LOG   = 'fleetview_vault_log';        // which answers got used where

const MATCH_FLOOR = 34;   // below this a match is word coincidence, not relevance

const MATCH_NOTE =
  'Lexical TF-IDF match — it finds answers that share wording with the question. ' +
  'It will miss a paraphrase that reuses none of the same words. At a few hundred ' +
  'answers that is still rare; past that, an embedding index is the upgrade.';

/* ---------------------------------------------------------------------------
 * ANSWER LIBRARY
 * Every body below is built from facts already established elsewhere in
 * FleetView (profile, DVIR/ELD compliance work, the SNAP school route, the
 * live-tracking build). Anything not verifiable is a {{token}} gap, on purpose.
 * ------------------------------------------------------------------------- */
const ANSWER_LIBRARY = [
  {
    id:'company_overview', category:'Company', title:'Company overview / who we are',
    keywords:['company','overview','background','about','profile','introduction','history','describe your firm','organization','business'],
    body:
`{{legalName}} (dba {{dba}}) is an asset-based refrigerated and dry-freight motor carrier headquartered at {{physical}}, operating under {{mc}} / {{dot}}.

We run our own trucks and our own drivers — refrigerated and dry box trucks (16–26 ft) plus cargo and sprinter vans — across {{serviceArea}}. Our work is recurring, scheduled route delivery rather than one-off spot freight: multi-stop food service, school nutrition, and medical cold-chain courier lanes where a missed window has consequences.

Because we are asset-based, the cold leg is never brokered to a third party. The truck on the contract is our truck and the driver is our employee.

Primary contact: {{contactName}}, {{contactTitle}} — {{phone}}, {{dispatchEmail}}.`,
  },
  {
    id:'past_performance', category:'Past performance', title:'Past performance / relevant experience',
    keywords:['past performance','experience','references','similar contracts','relevant work','prior','track record','previously performed','demonstrate experience'],
    body:
`Representative recurring engagements:

• SNAP Gourmet Foods — recurring white-glove refrigerated delivery. Includes a four-campus school nutrition route serving Summit Academy locations across the Youngstown/Warren corridor: 387 students, ~157 miles round trip, delivered inside a 7:00–9:30 AM window every school day from our East 55th depot.

• Centerline Logistics Corp — multi-modal capacity partner.

• Pizza Bagel Lady — producer transportation, first-mile and mid-mile.

Contact details for each reference are available on request.`,
    gaps:['Add the specific contract this bid resembles most, with dates and dollar value, before submitting.'],
  },
  {
    id:'capability_equipment', category:'Capability', title:'Equipment, fleet and capacity',
    keywords:['equipment','fleet','vehicles','trucks','capacity','assets','refrigerated','reefer','temperature controlled','cold chain','trailer','capability'],
    body:
`Fleet: {{equipment}}.

Refrigerated units carry continuous temperature control for both chilled and frozen product, with temperature monitored in transit rather than checked only at delivery. Vehicles are equipped for live GPS tracking and electronic proof of delivery, so a buyer can see where a load is and confirm what was signed for without calling dispatch.

Service area: {{serviceArea}}. NAICS codes: {{naics}}.

Current fleet count and per-vehicle capacity: ⚠ [NEEDS: confirmed unit count and cube/pallet capacity as of bid date]`,
  },
  {
    id:'cold_chain', category:'Capability', title:'Cold-chain / temperature integrity approach',
    keywords:['cold chain','temperature','refrigerated','frozen','perishable','thermal','temperature excursion','food safety','vaccine','pharmaceutical','specimen','blood'],
    body:
`Temperature integrity is managed at three points rather than assumed:

1. Pre-cool — the unit is brought to set point before product is loaded, not after.
2. In transit — temperature is monitored continuously and visible to dispatch, so an excursion is caught while the truck is still moving and can be intercepted.
3. At delivery — the receiving signature is captured electronically against the stop, giving a timestamped record of when custody transferred.

Excursion handling: any reading outside the agreed range is escalated to dispatch immediately and the affected product is quarantined rather than delivered, with the buyer notified before the delivery window closes.

Specific set-point ranges, calibration intervals and validation documentation: ⚠ [NEEDS: confirm against this solicitation's stated temperature requirements — do not answer generically]`,
  },
  {
    id:'safety_compliance', category:'Compliance', title:'Safety programme and DOT compliance',
    keywords:['safety','compliance','dot','fmcsa','csa','accident','driver qualification','hours of service','eld','inspection','maintenance','osha','safety rating'],
    body:
`{{legalName}} operates under {{dot}} and complies with the applicable Federal Motor Carrier Safety Regulations.

• Hours of service — drivers run on electronic logging devices per 49 CFR Part 395.
• Vehicle inspection — drivers complete written pre-trip and post-trip inspection reports (DVIR) each day, with defects reported and corrected before the vehicle returns to service.
• Driver qualification — CDL/licensing, MVR and qualification files are maintained for each driver.
• Maintenance — vehicles are serviced on a scheduled preventive-maintenance interval with repair records retained per asset.

Current FMCSA safety rating, CSA BASIC percentiles and DOT recordable accident history: ⚠ [NEEDS: pull current values from the FMCSA SAFER snapshot on the day of submission — never quote these from memory]`,
  },
  {
    id:'insurance', category:'Compliance', title:'Insurance coverage',
    keywords:['insurance','coverage','liability','cargo','certificate','coi','additional insured','limits','workers compensation','umbrella','indemnity'],
    body:
`{{legalName}} carries Auto Liability and Motor Truck Cargo coverage through {{insCarrier}}. A certificate of insurance is provided on request and the buyer can be named as certificate holder, with additional-insured endorsement where the contract requires it.

Coverage limits, policy numbers and effective dates: ⚠ [NEEDS: transcribe exactly from the current COI — limits must match the certificate, not an estimate]

If this solicitation requires limits above our current policy, we will confirm bindable increased limits with our agent before submission rather than represent coverage we do not hold.`,
  },
  {
    id:'small_business', category:'Company', title:'Business size and socio-economic status',
    keywords:['small business','size','set aside','socioeconomic','8a','hubzone','wosb','sdvosb','veteran','minority','disadvantaged','certification','naics size standard'],
    body:
`{{legalName}} is a small business under the SBA size standards for {{naics}}, and is eligible to compete for total small-business set-asides.

We do not currently hold 8(a), HUBZone, WOSB or SDVOSB certification. Where a solicitation is set aside for a certification we do not hold, we say so rather than bid it.

SAM registration status, UEI and CAGE: {{?uei}} {{?cage}}`,
    gaps:['UEI and CAGE come from the device-only vault — confirm SAM registration is active before submitting a federal bid.'],
  },
  {
    id:'key_personnel', category:'Company', title:'Key personnel and management',
    keywords:['key personnel','management','staff','team','who will manage','project manager','point of contact','organizational','resume','qualifications'],
    body:
`Primary point of contact and contract manager: {{contactName}}, {{contactTitle}} — {{phone}}, {{dispatchEmail}}. Mike manages dispatch, routing and day-to-day service delivery, and is the single escalation point for this contract.

Business owner and holder of operating authority: {{ownerName}}.

Dedicated driver assignment for this contract: ⚠ [NEEDS: name the assigned driver(s) if the solicitation asks for named personnel]`,
  },
  {
    id:'service_delivery', category:'Operations', title:'Service delivery / how the work gets done',
    keywords:['approach','methodology','how will you','service delivery','plan','execution','operations','schedule','routing','delivery window','process'],
    body:
`Routes are built the day before delivery and locked against a published schedule, so the buyer knows the sequence and the window rather than a same-day estimate.

Each stop carries its own delivery instructions and a required window. Drivers work from a routed manifest on the vehicle and capture proof of delivery electronically at each stop. Dispatch monitors progress live and intervenes on a running-late stop before the window is missed, not after.

Standing changes — added stops, holiday closures, schedule shifts — are taken through a single dispatch contact and reflected on the next day's route board.`,
  },
  {
    id:'contingency', category:'Operations', title:'Contingency, backup and continuity of service',
    keywords:['contingency','backup','continuity','breakdown','emergency','disruption','failure','weather','redundancy','disaster','plan b','substitute vehicle'],
    body:
`Vehicle breakdown: the affected load is transferred to another unit in our fleet and the route continues. Because we run our own equipment, a substitute vehicle does not require a broker search.

Driver absence: routes are documented at the stop level rather than held in a driver's head, so another qualified driver can run the route the same day.

Weather and road closure: dispatch re-sequences affected stops and notifies the buyer's contact before the window, with a revised ETA rather than a silent late delivery.

Escalation: {{contactName}} at {{phone}} is reachable directly, not through a queue.`,
  },
  {
    id:'quality_control', category:'Operations', title:'Quality control and performance measurement',
    keywords:['quality','quality control','qc','performance','metrics','kpi','measure','monitoring','on time','accuracy','service level','corrective action'],
    body:
`Performance is measured on the record the route itself produces:

• On-time delivery — captured against the required window at each stop, not self-reported.
• Delivery confirmation — electronic proof of delivery per stop, retrievable by date and location.
• Temperature compliance — monitored in transit on refrigerated loads.
• Exception rate — short, damaged, or refused deliveries logged against the stop.

Corrective action: a missed window or exception is reviewed against the route record with the assigned driver, and the fix is applied to the route build rather than handled as a verbal warning.

Reporting cadence and format for this contract: ⚠ [NEEDS: match to the reporting requirement stated in the solicitation]`,
  },
  {
    id:'pricing_approach', category:'Pricing', title:'Pricing basis and rate structure',
    keywords:['pricing','price','rate','cost','fee','invoice','billing','payment terms','fuel surcharge','escalation','proposal price'],
    body:
`Recurring route work is priced on a routed-hour and per-stop basis rather than a spot per-mile quote, which is what makes a scheduled contract predictable for both sides.

Each route is costed from its actual components — driver hours, fuel at current cost per gallon against the vehicle's measured mpg, per-mile vehicle cost, and overhead per run — and the contract rate is set on top of that floor. That means the price holds up under scrutiny and does not need to be renegotiated once the route runs.

Fuel: quoted rates assume a stated diesel baseline with a surcharge mechanism for movement above it.

Contract-specific pricing: ⚠ [NEEDS: run this solicitation's stops and mileage through the route cost model before entering a number]`,
  },
  {
    id:'subcontracting', category:'Compliance', title:'Subcontracting and use of third parties',
    keywords:['subcontract','subcontractor','third party','teaming','partner','broker','outsource','joint venture'],
    body:
`Transportation under this contract is performed with {{legalName}} equipment and {{legalName}} drivers. We do not broker the refrigerated leg to a third party.

Where a solicitation's geography or volume exceeds our direct coverage, we say so and propose a named partner rather than quietly subcontracting after award.

Planned subcontracting for this solicitation: ⚠ [NEEDS: state "none" or name the partner and scope — do not leave implied]`,
  },
  {
    id:'references_contacts', category:'Past performance', title:'Client references with contact details',
    keywords:['reference','referee','client contact','contactable','testimonial','verify performance'],
    body:
`{{references_list}}

Reference contact names, titles, phone numbers and emails: ⚠ [NEEDS: confirm each reference is willing to be contacted and supply current details before listing them]`,
  },
];

/* ---------------------------------------------------------------------------
 * FORM FIELD MAP — direct attribute fills (the "smart form matching" half)
 * Synonyms are what buyers actually label these fields on real setup forms.
 * ------------------------------------------------------------------------- */
const FIELD_MAP = [
  { key:'legalName', label:'Legal business name', syn:['legal name','legal business name','company name','business name','entity name','firm name','contractor name','vendor name','offeror'] },
  { key:'dba',       label:'DBA / trade name',    syn:['dba','doing business as','trade name','operating name'] },
  { key:'entity',    label:'Entity type',         syn:['entity type','business structure','type of organization','organization type','incorporation'] },
  { key:'mc',        label:'MC number',           syn:['mc number','mc#','motor carrier number','icc mc'] },
  { key:'dot',       label:'USDOT number',        syn:['dot number','usdot','us dot','dot#','carrier number'] },
  { key:'physical',  label:'Physical address',    syn:['physical address','street address','business address','principal place of business','location','headquarters'] },
  { key:'remit',     label:'Remittance address',  syn:['remit','remittance','mailing address','payment address','billing address'] },
  { key:'phone',     label:'Phone',               syn:['phone','telephone','contact number','business phone','office phone'] },
  { key:'dispatchEmail', label:'Dispatch email',  syn:['dispatch email','operations email','contact email','email address','e-mail'] },
  { key:'apEmail',   label:'AP / billing email',  syn:['ap email','accounts payable','billing email','invoice email','remittance email'] },
  { key:'contactName', label:'Primary contact',   syn:['primary contact','point of contact','poc','contact name','authorized representative','contact person'] },
  { key:'contactTitle', label:'Contact title',    syn:['title','contact title','position','job title'] },
  { key:'ownerName', label:'Owner',               syn:['owner','principal','president','officer','business owner'] },
  { key:'equipment', label:'Equipment',           syn:['equipment','fleet','vehicle type','trailer type','assets'] },
  { key:'serviceArea', label:'Service area',      syn:['service area','coverage area','geographic','states served','territory','region'] },
  { key:'naics',     label:'NAICS codes',         syn:['naics','industry code','sic','commodity code'] },
  { key:'insCargo',  label:'Cargo insurance',     syn:['cargo insurance','motor truck cargo','cargo coverage'] },
  { key:'insAuto',   label:'Auto liability',      syn:['auto liability','automobile liability','vehicle insurance'] },
  { key:'insCarrier',label:'Insurance carrier',   syn:['insurance carrier','insurer','underwriter','insurance company'] },
  // Sensitive: resolved ONLY from the device-only private vault, and never
  // auto-pasted into a draft — the UI requires an explicit reveal per field.
  { key:'ein',  label:'EIN / Tax ID', sensitive:true, syn:['ein','tax id','taxpayer identification','federal tax id','tin','w-9'] },
  { key:'uei',  label:'SAM UEI',      sensitive:true, syn:['uei','unique entity id','sam uei','duns'] },
  { key:'cage', label:'CAGE code',    sensitive:true, syn:['cage','cage code','commercial and government entity'] },
];

/* ---------------------------------------------------------------------------
 * VAULT ACCESS
 * ------------------------------------------------------------------------- */
function userAnswers() { try { return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]'); } catch { return []; } }
function saveUserAnswers(a) { localStorage.setItem(VAULT_KEY, JSON.stringify(a)); }

/* Shipped answers plus the user's own. A user answer with a shipped id REPLACES
 * it — edits stick without forking the file. */
function answerLibrary() {
  const mine = userAnswers();
  const mineIds = new Set(mine.map(a => a.id));
  return ANSWER_LIBRARY.filter(a => !mineIds.has(a.id)).concat(mine);
}
function upsertAnswer(a) {
  const mine = userAnswers().filter(x => x.id !== a.id);
  mine.push(Object.assign({ custom:true, saved:Date.now() }, a));
  saveUserAnswers(mine);
}
function deleteUserAnswer(id) { saveUserAnswers(userAnswers().filter(x => x.id !== id)); }
function isCustom(id) { return userAnswers().some(a => a.id === id); }

/* ---------------------------------------------------------------------------
 * TF-IDF MATCHER
 * ------------------------------------------------------------------------- */
const STOP = new Set(('a an the and or of to in for on with your you we our us is are be been will shall must may can please describe provide explain list detail what how many any all if as at by from that this these those it its their there has have had do does not no than then'.split(/\s+/)));

function tokens(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length > 2 && !STOP.has(t))
    .map(t => t.replace(/(ies)$/,'y').replace(/(ing|ed|es|s)$/,''))
    .filter(Boolean);
}

/* Inverse document frequency across the library, so "refrigerated" outweighs
 * "service". Recomputed per match run — the library is small. */
function buildIdf(lib) {
  const df = {}, N = lib.length;
  lib.forEach(a => {
    const seen = new Set(tokens(a.title + ' ' + a.keywords.join(' ') + ' ' + a.body));
    seen.forEach(t => df[t] = (df[t] || 0) + 1);
  });
  const idf = {};
  Object.keys(df).forEach(t => idf[t] = Math.log(1 + N / df[t]));
  return idf;
}

function matchAnswer(question, lib, idf) {
  const q = tokens(question);
  if (!q.length) return [];
  const qSet = new Set(q);
  const scored = lib.map(a => {
    const kw    = new Set(tokens(a.keywords.join(' ')));
    const title = new Set(tokens(a.title));
    const body  = new Set(tokens(a.body));
    let s = 0, hits = [];
    qSet.forEach(t => {
      const w = idf[t] || 1;
      if (kw.has(t))    { s += 3.0 * w; hits.push(t); }
      else if (title.has(t)) { s += 2.0 * w; hits.push(t); }
      else if (body.has(t))  { s += 0.6 * w; }
    });
    // Phrase bonus: a multi-word keyword appearing verbatim is a strong signal.
    const ql = ' ' + String(question).toLowerCase() + ' ';
    a.keywords.forEach(k => { if (k.includes(' ') && ql.includes(' ' + k + ' ')) s += 4; });
    return { answer:a, raw:s, hits:[...new Set(hits)] };
  }).filter(m => m.raw > 0);

  if (!scored.length) return [];
  // Rank on the RAW score. The displayed 0-100 is a saturating transform of it
  // (raw/(raw+K)), never a clipped one — clipping made every decent match tie at
  // the ceiling, and the sort then silently fell back to library order.
  const K = Math.sqrt(qSet.size) * 6;
  scored.sort((a, b) => b.raw - a.raw);
  scored.forEach(m => m.score = Math.round(100 * m.raw / (m.raw + K)));
  return scored;
}

function matchField(question) {
  const ql = String(question).toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  if (ql.length > 70) return null;                 // a sentence is a question, not a form field
  let best = null;
  FIELD_MAP.forEach(f => {
    f.syn.forEach(s => {
      if (ql === s) { if (!best || best.score < 100) best = { field:f, score:100 }; return; }
      if (ql.includes(s)) {
        const sc = Math.round(s.length / ql.length * 95);
        if (!best || sc > best.score) best = { field:f, score:sc };
      }
    });
  });
  return best && best.score >= 45 ? best : null;
}

/* ---------------------------------------------------------------------------
 * QUESTION PARSING — pasted questionnaire text -> discrete prompts
 * ------------------------------------------------------------------------- */
function parseQuestions(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let buf = '';
  const flush = () => {
    const t = buf.trim().replace(/\s+/g, ' ');
    // Numbering / bullets stripped; drop anything too short to be a real prompt.
    const clean = t.replace(/^\s*(\d+[\.\)]|[a-z][\.\)]|[-•*·])\s*/i, '').trim();
    if (clean.length >= 3) out.push(clean);
    buf = '';
  };
  lines.forEach(raw => {
    const line = raw.trim();
    if (!line) { if (buf) flush(); return; }
    const starts = /^(\d+[\.\)]|[a-z][\.\)]|[-•*·])\s+/i.test(line);
    const isField = /:\s*$|_{3,}\s*$/.test(line);      // "Legal Name:" / "Name ____"
    if (starts || isField) { if (buf) flush(); buf = line.replace(/:\s*$|_{3,}\s*$/, ''); flush(); return; }
    buf += (buf ? ' ' : '') + line;
    if (/[?]$/.test(line)) flush();
  });
  if (buf) flush();
  return out;
}

/* ---------------------------------------------------------------------------
 * COMPOSER — fill {{tokens}} from the vault; unresolved becomes a loud gap
 * ------------------------------------------------------------------------- */
function composeAnswer(answer, opts) {
  const p = (typeof profile === 'function') ? profile() : {};
  const revealSensitive = !!(opts && opts.revealSensitive);
  const gaps = [];
  const generated = new Set();   // labels this pass produced, to avoid double-listing

  const addGap = (label, suffix) => { generated.add(label); gaps.push(label + suffix); };

  let out = String(answer.body);

  // {{references_list}} — rendered from the profile, not hardcoded.
  out = out.replace(/\{\{references_list\}\}/g, () =>
    (p.references || []).map(r => '\u2022 ' + r).join('\n') || '\u26a0 [NEEDS: references]');

  // {{?field}} — optional/sensitive: only filled on explicit reveal.
  out = out.replace(/\{\{\?(\w+)\}\}/g, (m, k) => {
    const f = FIELD_MAP.find(x => x.key === k);
    const lab = f ? f.label : k;
    const v = p[k];
    if (f && f.sensitive && v && !revealSensitive) {
      addGap(lab, ' withheld (tick the insert box to fill it)');
      return '\u26a0 [' + lab + ' \u2014 withheld]';
    }
    if (v) return v;
    addGap(lab, ' not on file');
    return '\u26a0 [NEEDS: ' + lab + ']';
  });

  // {{field}} — normal fill.
  out = out.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const v = p[k];
    if (v) return v;
    const f = FIELD_MAP.find(x => x.key === k);
    const lab = f ? f.label : k;
    addGap(lab, ' not on file');
    return '\u26a0 [NEEDS: ' + lab + ']';
  });

  // Inline markers hand-written into a body are gaps too — they are the things
  // a human must verify against THIS solicitation. Skip the ones this pass just
  // generated, or every missing field would be listed twice.
  (out.match(/\u26a0 \[NEEDS:[^\]]+\]/g) || []).forEach(g => {
    const t = g.replace(/\u26a0 \[NEEDS:\s*/, '').replace(/\]$/, '').trim();
    if (!generated.has(t) && !gaps.includes(t)) gaps.push(t);
  });
  (answer.gaps || []).forEach(g => { if (!gaps.includes(g)) gaps.push(g); });

  return { text: out.trim(), gaps: [...new Set(gaps)] };
}

function confidenceLabel(score) {
  if (score >= 55) return { label:'High', cls:'strong' };
  if (score >= 30) return { label:'Review', cls:'verify' };
  if (score > 0)   return { label:'Weak', cls:'watch' };
  return { label:'No match', cls:'intel' };
}

/* ---------------------------------------------------------------------------
 * RUN — the whole pipeline for a pasted questionnaire
 * ------------------------------------------------------------------------- */
function runVault(text, opts) {
  const lib = answerLibrary();
  const idf = buildIdf(lib);
  const p = (typeof profile === 'function') ? profile() : {};
  return parseQuestions(text).map((q, i) => {
    const fieldHit = matchField(q);
    if (fieldHit) {
      const f = fieldHit.field;
      const val = p[f.key];
      const sensitive = !!f.sensitive;
      // Withheld only makes sense when there IS something to withhold —
      // otherwise say it is missing, so a blank never reads as "held back".
      const withheld = sensitive && !!val && !(opts && opts.revealSensitive);
      return {
        i, question:q, kind:'field', field:f,
        score: fieldHit.score,
        text: withheld ? `⚠ [${f.label} — withheld, reveal to insert]`
                       : (val || `⚠ [NEEDS: ${f.label}]`),
        gaps: withheld ? [`${f.label} withheld (tick the insert box to fill it)`]
                       : (val ? [] : [`${f.label} not on file — add it in the private vault`]),
        sensitive,
      };
    }
    const matches = matchAnswer(q, lib, idf);
    if (!matches.length) {
      return { i, question:q, kind:'none', score:0, text:'', gaps:['No library answer matched — write this one, then save it back to the vault.'], matches:[] };
    }
    const best = matches[0];
    // Below the floor the "match" is a coincidence of common words. Say so and
    // let the user write it, rather than handing them a confident wrong answer.
    if (best.score < MATCH_FLOOR) {
      return { i, question:q, kind:'none', score:best.score, text:'',
               gaps:[`Closest library answer ("${best.answer.title}") scored only ${best.score} — too weak to reuse. Write this one, then save it to the vault.`],
               matches:matches.slice(0,4) };
    }
    const composed = composeAnswer(best.answer, opts);
    return {
      i, question:q, kind:'answer', score:best.score, answerId:best.answer.id,
      answerTitle:best.answer.title, category:best.answer.category,
      text:composed.text, gaps:composed.gaps,
      matches:matches.slice(0,4), hits:best.hits,
    };
  });
}

/* Usage log — which answers went into which bid, so the library earns its keep
 * visibly rather than on faith. */
function logVaultUse(bidName, results) {
  let log; try { log = JSON.parse(localStorage.getItem(VAULT_LOG) || '[]'); } catch { log = []; }
  log.unshift({
    t: Date.now(), bid: bidName || 'Untitled',
    questions: results.length,
    drafted: results.filter(r => r.kind !== 'none').length,
    gaps: results.reduce((s,r) => s + r.gaps.length, 0),
  });
  localStorage.setItem(VAULT_LOG, JSON.stringify(log.slice(0, 100)));
  if (typeof Pipeline !== 'undefined') {
    Pipeline.log({ id:'bidvault', title:bidName || 'Untitled bid', kind:'vault',
                   text:`Drafted ${results.filter(r=>r.kind!=='none').length}/${results.length} answers` });
  }
}
function vaultLog() { try { return JSON.parse(localStorage.getItem(VAULT_LOG) || '[]'); } catch { return []; } }
