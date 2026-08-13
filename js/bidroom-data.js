/* =============================================================================
 * FleetView — Bid Strategist ("Bid Room"): USASpending market read + bid model
 * -----------------------------------------------------------------------------
 * The edge. Pulls REAL federal award history from USASpending.gov (free, CORS-
 * open — no proxy) for a NAICS, reads the market (who wins, how much, trend,
 * distribution), then recommends a margin-protected bid positioned against the
 * historical win distribution. On-demand; respects the global view toggle
 * (margin/cost is .internal-only).
 * =========================================================================== */

const USASPENDING = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

// NAICS the bid engine cares about — freight + medical cold-chain / healthcare logistics
const BID_NAICS = {
  '484230':'Specialized Freight, Long-Distance',
  '484220':'Specialized Freight (exc. Used), Local',
  '484121':'General Freight, Long-Distance, TL',
  '484110':'General Freight Trucking, Local',
  '492110':'Couriers & Express Delivery',
  '493120':'Refrigerated Warehousing & Storage',
  '423450':'Medical / Hospital Equipment Wholesalers',
  '424210':'Drugs & Druggists Sundries Wholesalers',
  '621991':'Blood & Organ Banks (cold-chain)',
  '541380':'Testing Laboratories',
};

const SN_COST = { laborRate:21.50, mpg:10, fuelPerGal:3.80, vehPerMi:0.16, overheadPerRun:100 };

async function fetchAwards(naics, years, keyword) {
  const end = '2026-08-01';
  const start = `${2026 - (years || 4)}-08-01`;
  const body = {
    filters: {
      award_type_codes: ['A','B','C','D'],          // definitive + IDV contracts
      naics_codes: [naics],
      time_period: [{ start_date: start, end_date: end }],
    },
    fields: ['Award ID','Recipient Name','Award Amount','Awarding Agency','Awarding Sub Agency','Start Date','Description'],
    sort: 'Award Amount', order: 'desc', limit: 100,
  };
  if (keyword) body.filters.keywords = [keyword];
  const res = await fetch(USASPENDING, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if (!res.ok) throw new Error('USASpending ' + res.status);
  const data = await res.json();
  return (data.results || []).map(r => ({
    id: r['Award ID'] || r.generated_internal_id,
    recipient: r['Recipient Name'] || '—',
    amount: +r['Award Amount'] || 0,
    agency: r['Awarding Agency'] || '',
    subAgency: r['Awarding Sub Agency'] || '',
    date: r['Start Date'] || '',
    desc: r['Description'] || '',
  })).filter(a => a.amount > 0);
}

function median(arr){ if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function percentileOf(sortedAsc, v){ if(!sortedAsc.length) return 0; let c=0; for(const x of sortedAsc){ if(x<=v) c++; } return Math.round(c/sortedAsc.length*100); }

function analyzeAwards(awards) {
  const amounts = awards.map(a=>a.amount);
  const sorted = [...amounts].sort((a,b)=>a-b);
  const total = amounts.reduce((s,x)=>s+x,0);
  // by fiscal year
  const byYear = {};
  awards.forEach(a=>{ const y=(a.date||'').slice(0,4); if(y){ byYear[y]=(byYear[y]||0)+a.amount; } });
  // competitor concentration
  const byRecip = {};
  awards.forEach(a=>{ const k=a.recipient; if(!byRecip[k]) byRecip[k]={recipient:k,total:0,count:0}; byRecip[k].total+=a.amount; byRecip[k].count++; });
  const topRecipients = Object.values(byRecip).sort((a,b)=>b.total-a.total).slice(0,10)
    .map(r=>({ ...r, share: total? r.total/total*100 : 0 }));
  const top3share = topRecipients.slice(0,3).reduce((s,r)=>s+r.share,0);
  return {
    count: awards.length, total, avg: awards.length? total/awards.length : 0,
    median: median(amounts), min: sorted[0]||0, max: sorted[sorted.length-1]||0,
    sortedAsc: sorted, byYear, topRecipients, top3share,
    concentration: top3share>=70?'concentrated':top3share>=40?'moderate':'fragmented',
  };
}

/* Recommend a margin-protected bid, positioned vs the historical win distribution */
function recommendBid({ targetValue, cost, minMargin, analysis }) {
  const tv = +targetValue || analysis.median || 0;
  const c = +cost || 0;
  const mm = (minMargin != null ? +minMargin : 20) / 100;
  const floor = c > 0 ? Math.round(c / (1 - mm)) : 0;             // lowest bid that holds your margin
  // competitive anchor: 55th percentile of wins (win without leaving money on table)
  const sorted = analysis.sortedAsc;
  const anchor = sorted.length ? sorted[Math.min(sorted.length-1, Math.floor(sorted.length*0.55))] : tv;
  const recommended = Math.max(floor, Math.round(anchor));
  const marginAt = recommended>0 && c>0 ? (recommended - c) / recommended * 100 : null;
  const pct = percentileOf(sorted, recommended);
  const belowFloorMarket = floor > 0 && anchor < floor;          // market pays below your floor
  return { targetValue:tv, cost:c, floor, anchor:Math.round(anchor), recommended, marginAt, percentile:pct, belowFloorMarket };
}

function fmtBig(n){ if(!n) return '$0'; if(n>=1e6) return '$'+(n/1e6).toFixed(1)+'M'; if(n>=1e3) return '$'+(n/1e3).toFixed(0)+'K'; return '$'+Math.round(n); }
