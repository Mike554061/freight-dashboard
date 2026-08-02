/* =============================================================================
 * FleetView — Opportunity Pipeline: data model + scoring
 * -----------------------------------------------------------------------------
 * A freight BUSINESS-DEVELOPMENT pipeline (not a load board). Sources are
 * solicitations/RFPs/contracts where a shipper needs freight moved and we can
 * bid — federal (SAM.gov, live API), and room for state/institutional later.
 * Equipment-agnostic: cold or dry, if it needs moving we scope/score/pursue.
 * =========================================================================== */

const HOME_STATE = 'OH';
const NEIGHBOR_STATES = ['PA','MI','IN','KY','WV','NY'];

// Freight / transportation NAICS the pipeline cares about
const NAICS = {
  '484110': 'General Freight Trucking, Local',
  '484121': 'General Freight, Long-Distance, TL',
  '484122': 'General Freight, Long-Distance, LTL',
  '484210': 'Used Household & Office Goods Moving',
  '484220': 'Specialized Freight (exc. Used), Local',
  '484230': 'Specialized Freight, Long-Distance',
  '492110': 'Couriers & Express Delivery',
  '492210': 'Local Messengers & Local Delivery',
  '493110': 'General Warehousing & Storage',
  '493120': 'Refrigerated Warehousing & Storage',
};
// NAICS groups for the filter dropdown
const NAICS_GROUPS = {
  trucking:  { label: 'Trucking (484)',        test: c => /^484/.test(c) },
  courier:   { label: 'Courier / Delivery (492)', test: c => /^492/.test(c) },
  warehouse: { label: 'Warehousing (493)',     test: c => /^493/.test(c) },
};

// SAM.gov notice types (ptype)
const NOTICE_TYPE = {
  o: 'Solicitation', p: 'Presolicitation', k: 'Combined Synopsis/Solicitation',
  r: 'Sources Sought', s: 'Special Notice', a: 'Award Notice', g: 'Sale of Surplus',
};

/* ---------- Scoring: "is it worth it?" ---------- */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr), now = new Date('2026-08-02');
  return Math.round((d - now) / 86400000);
}

function scoreOpportunity(o) {
  let score = 50; const reasons = [];
  const days = daysUntil(o.dueDate);

  if (days === null)      { reasons.push('No deadline listed'); }
  else if (days < 0)      { score -= 45; reasons.push(`Deadline passed (${-days}d ago)`); }
  else if (days < 3)      { score -= 8;  reasons.push(`Very tight window (${days}d)`); }
  else if (days <= 21)    { score += 12; reasons.push(`Actionable window (${days}d)`); }
  else                    { score += 6;  reasons.push(`Ample lead time (${days}d)`); }

  if (/^4841|^4842/.test(o.naics)) { score += 20; reasons.push('Core trucking NAICS'); }
  else if (/^492|^493/.test(o.naics)) { score += 8; reasons.push('Adjacent (courier/warehouse)'); }

  if (!o.pop.state)                        { reasons.push('Location not listed — verify in solicitation'); }
  else if (o.pop.state === HOME_STATE)     { score += 22; reasons.push('Place of performance in Ohio'); }
  else if (NEIGHBOR_STATES.includes(o.pop.state)) { score += 11; reasons.push('Neighboring state'); }
  else                                     { score -= 12; reasons.push('Out of region (' + o.pop.state + ')'); }

  if (/small business/i.test(o.setAside))  { score += 15; reasons.push('Small-biz set-aside — you qualify'); }
  else if (/8\(a\)|hubzone|wosb|sdvosb|service-disabled/i.test(o.setAside)) { reasons.push('Set-aside needs a cert you may not hold'); }
  else if (o.setAside && o.setAside !== 'None') { reasons.push('Set-aside: ' + o.setAside); }

  if (o.type === 'Award Notice') { score -= 25; reasons.push('Already awarded (intel only)'); }
  if (o.type === 'Sources Sought' || o.type === 'Presolicitation') { reasons.push('Early stage — get on their radar now'); }

  if (o.value) reasons.push('Est. value $' + o.value.toLocaleString());

  score = Math.max(0, Math.min(100, score));
  const label = score >= 75 ? 'Strong' : score >= 55 ? 'Worth a look' : score >= 35 ? 'Marginal' : 'Skip';
  return { score, label, reasons };
}

/* ---------- Sample federal solicitations (realistic; live via proxy) ---------- */
function buildSampleOpps() {
  const S = [
    ['Refrigerated Food Distribution — VA NE Ohio Healthcare', 'Dept. of Veterans Affairs — Louis Stokes Cleveland VAMC', '36C25026R0142', '484220', 'o', '2026-07-20', '2026-08-18', 'Cleveland','OH', 'Total Small Business', 480000, 'reefer'],
    ['Regional LTL Freight Services — USDA Ohio', 'USDA — Agricultural Marketing Service', 'AG-3142-S-26-0031', '484122', 'o', '2026-07-25', '2026-08-25', 'Columbus','OH', 'Total Small Business', 260000, 'dry'],
    ['Truckload Transportation, Great Lakes Region', 'Defense Logistics Agency', 'SPE300-26-R-0088', '484121', 'p', '2026-07-28', '2026-09-05', 'Detroit','MI', 'None', 1200000, 'dry'],
    ['Household Goods Moving — Federal Relocation', 'General Services Administration', 'GS-07F-26-MOVE', '484210', 'k', '2026-07-30', '2026-08-14', 'Cleveland','OH', 'Small Business', 90000, 'dry'],
    ['Cold-Chain Pharmaceutical Courier', 'Dept. of Veterans Affairs — VISN 10', '36C25026Q0210', '492110', 'r', '2026-07-15', '2026-08-10', 'Cleveland','OH', 'SDVOSB Set-Aside', null, 'reefer'],
    ['School Nutrition Commodity Hauling', 'USDA — Food & Nutrition Service', 'FNS-26-OH-0077', '484220', 'o', '2026-07-29', '2026-08-22', 'Youngstown','OH', 'Total Small Business', 175000, 'reefer'],
    ['Specialized Freight — Corps of Engineers', 'US Army Corps of Engineers, Buffalo District', 'W912P4-26-R-0019', '484230', 'o', '2026-07-18', '2026-08-08', 'Buffalo','NY', 'None', 340000, 'dry'],
    ['Local Delivery Services — Federal Facilities', 'Social Security Administration', 'SSA-26-DEL-Ohio', '492210', 'p', '2026-08-01', '2026-09-01', 'Akron','OH', 'Total Small Business', 65000, 'dry'],
    ['Refrigerated Warehousing & Distribution', 'Dept. of Agriculture — Ohio', 'AG-OH-26-COLD-04', '493120', 'r', '2026-07-22', '2026-08-30', 'Cleveland','OH', 'Small Business', 220000, 'reefer'],
    ['TL Freight — Federal Prison System', 'Bureau of Prisons', 'BOP-26-TRANS-118', '484121', 'o', '2026-06-30', '2026-07-28', 'Chicago','IL', 'None', 410000, 'dry'],
    ['Emergency Supply Transportation (IDIQ)', 'FEMA Region 5', 'HSFE05-26-R-0007', '484230', 'o', '2026-07-27', '2026-08-27', 'Columbus','OH', 'Total Small Business', 750000, 'dry'],
    ['Medical Supply Courier — Wade Park', 'Dept. of Veterans Affairs', '36C25026Q0188', '492110', 'a', '2026-06-10', '2026-07-05', 'Cleveland','OH', 'Total Small Business', 120000, 'reefer'],
  ];
  return S.map((r, i) => {
    const [title, agency, sol, naics, ptype, posted, due, city, state, setAside, value, temp] = r;
    const o = {
      id: `sam_${90000 + i}`,
      source: 'samgov',
      title, agency, solicitationNumber: sol,
      naics, naicsLabel: NAICS[naics] || naics,
      type: NOTICE_TYPE[ptype] || 'Notice',
      postedDate: posted, dueDate: due,
      pop: { city, state },
      setAside: setAside || 'None',
      value: value || null,
      temp,  // 'reefer' | 'dry' (fit signal, not a filter gate)
      url: `https://sam.gov/opp/${sol.replace(/[^a-z0-9]/gi,'').toLowerCase()}/view`,
      contact: { name: 'Contracting Officer', email: 'co@' + agency.split(' ')[0].toLowerCase() + '.gov', phone: '' },
      description: `${title}. Issued by ${agency}. NAICS ${naics} (${NAICS[naics]||''}). Place of performance: ${city}, ${state}.`,
    };
    const sc = scoreOpportunity(o);
    return Object.assign(o, { worthScore: sc.score, worthLabel: sc.label, worthReasons: sc.reasons });
  });
}

/* ---------- Fetch entry point (mock now; live via proxy later) ---------- */
async function fetchOpportunities(filters) {
  if (OPPS_CONFIG.useMock) {
    await new Promise(r => setTimeout(r, 250));
    return { opps: applyOppFilters(buildSampleOpps(), filters), live: false, note: 'Sample data' };
  }
  try {
    const url = `${OPPS_CONFIG.proxyUrl}?action=opps&filters=${encodeURIComponent(JSON.stringify(filters))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Proxy ${res.status}`);
    const data = await res.json();
    const raw = data.opps || [];
    if (!raw.length) {
      // Empty live pull (SAM free key ~10/day may be spent, or 0 matches) —
      // keep the tool usable on sample data with a clear note.
      return { opps: applyOppFilters(buildSampleOpps(), filters), live: false,
               note: data.error ? 'SAM: ' + data.error
                                : 'No live results yet (SAM free key ≈10 pulls/day) — showing sample' };
    }
    const scored = raw.map(o => {
      if (/^https?:\/\//i.test(o.description || '')) o.description = `${o.title} — ${o.agency}`;
      o.naicsLabel = NAICS[o.naics] || o.naicsLabel || o.naics;
      const sc = scoreOpportunity(o);
      return Object.assign(o, { worthScore: sc.score, worthLabel: sc.label, worthReasons: sc.reasons });
    });
    return { opps: applyOppFilters(scored, filters), live: true, note: raw.length + ' live from SAM.gov' };
  } catch (e) {
    return { opps: applyOppFilters(buildSampleOpps(), filters), live: false, note: 'Live fetch failed — sample shown' };
  }
}

const OPPS_CONFIG = {
  // Public build runs on sample data. To go live LOCALLY: set useMock=false and
  // paste your Apps Script /exec URL below (keep it out of the public repo).
  useMock: true,
  proxyUrl: '',
};

function applyOppFilters(opps, f) {
  return opps.filter(o => {
    if (f.keyword) {
      const hay = (o.title + ' ' + o.agency + ' ' + o.description).toLowerCase();
      if (!hay.includes(f.keyword.toLowerCase())) return false;
    }
    if (f.naicsGroup && NAICS_GROUPS[f.naicsGroup] && !NAICS_GROUPS[f.naicsGroup].test(o.naics)) return false;
    if (f.state && o.pop.state && o.pop.state !== f.state) return false;
    if (f.type && o.type !== f.type) return false;
    if (f.minValue && (o.value || 0) < f.minValue) return false;
    if (f.dueWithin != null) { const d = daysUntil(o.dueDate); if (d === null || d < 0 || d > f.dueWithin) return false; }
    if (f.hidePassed) { const d = daysUntil(o.dueDate); if (d !== null && d < 0) return false; }
    if (f.minScore && o.worthScore < f.minScore) return false;
    return true;
  });
}
