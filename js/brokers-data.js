/* =============================================================================
 * FleetView — Carrier↔Broker Outreach: data, freight calculator, packet
 * -----------------------------------------------------------------------------
 * The CARRIER side: SupplyNow reaching out to brokers to pull freight. Broker
 * profiles + status pipeline, per-broker quote & trip logs, an in-the-moment
 * freight calculator for instant quote replies, and a carrier-packet manifest
 * (linked to the real Drive docs + the generated one-pager).
 * =========================================================================== */

const SN = { name:'Supply Now Inc.', mc:'MC 1660872', dot:'DOT 3976910', phone:'216-548-7070',
             email:'dispatch@supplynow.org', rep:'Mike Cook', addr:'2800 Euclid Ave, Suite 310, Cleveland, OH 44115' };
const SIG = `${SN.rep}\nSupplyNow — Asset-Based Reefer & Dry Carrier\n${SN.phone} · ${SN.email}\n${SN.mc} · ${SN.dot}`;

const BROKER_CONFIG = { useMock:true, proxyUrl:'' };

/* ---------- Carrier packet manifest (real Drive docs + gaps) ---------- */
const PACKET = [
  { key:'coi', label:'Certificate of Insurance (MTC)', status:'have',
    doc:'SUPPLYNOW MTC COI', url:'https://drive.google.com/file/d/1B8X19GoPGAXJvdaTx3uIbh-BHD3lDzBw/view',
    note:'Motor Truck Cargo COI on file. Confirm auto-liability limits meet each broker (usually $100k cargo / $1M auto).' },
  { key:'insfolder', label:'Insurance folder', status:'have',
    doc:'Insurance (folder)', url:'https://drive.google.com/drive/folders/1Zn-JrhKdjFofL4V6oBAkw5zg53uKOr0y',
    note:'Central insurance docs; ask your agent (NICO) to email a broker-specific COI with them as certificate holder.' },
  { key:'onepager', label:'Carrier capabilities one-pager', status:'created',
    doc:'carrier-onepager.html', url:'carrier-onepager.html',
    note:'Fleet-spec + capabilities brochure — CREATED. Open → print to PDF for the packet.' },
  { key:'authority', label:'Operating Authority (MC certificate)', status:'need',
    doc:'', url:'https://safer.fmcsa.dot.gov/CompanySnapshot.aspx',
    note:'Broker setup often wants your FMCSA authority letter / MC certificate. Download from FMCSA (Aaron owns DOT/MC).' },
  { key:'w9', label:'W-9', status:'need',
    doc:'', url:'https://www.irs.gov/pub/irs-pdf/fw9.pdf',
    note:'Not found in Drive — locate your completed W-9 (has your EIN) or complete the blank IRS form. Do NOT let me fabricate the EIN.' },
  { key:'refs', label:'Shipper/broker references', status:'optional',
    doc:'', url:'',
    note:'Nice-to-have: 2–3 references (US Foods lane, Pizza Bagel Lady, SNAP). I can draft a reference sheet on request.' },
];

/* ---------- Real NE-Ohio + reefer-heavy brokers (researched) ---------- */
function buildBrokers() {
  const B = [
    { company:'Bridge & Harbor Global Supply Chain', type:'cold-chain', hq:'Cleveland, OH',
      about:'Cleveland cold-chain 3PL/brokerage — reefer containers + temp-monitored trailers (34–38°F), Great Lakes multimodal.',
      lanes:['Cleveland ↔ Great Lakes reefer','Intermodal drayage'], daysToPay:30, creditNote:'Verify credit',
      phone:'', email:'', url:'https://www.bridgeharborsupplychain.com/' },
    { company:'Direct Drive Logistics', type:'cold-chain', hq:'Cleveland, OH',
      about:'Cleveland FTL/LTL broker with temperature-controlled freight for perishables, pharma, cosmetics.',
      lanes:['Cleveland outbound reefer','Regional LTL'], daysToPay:30, creditNote:'Verify credit',
      phone:'', email:'', url:'https://www.directdrivelogistics.com/' },
    { company:'PartnerShip', type:'local', hq:'Beachwood, OH',
      about:'"THE Cleveland & NE Ohio freight broker" — local, personalized LTL/TL.',
      lanes:['NE Ohio LTL/TL','Regional'], daysToPay:30, creditNote:'Established — good credit',
      phone:'800-599-2902', email:'', url:'https://www.partnership.com/about-us/northeast-ohio-cleveland' },
    { company:'AMWARE Logistics', type:'local', hq:'Cleveland & Akron, OH',
      about:'25+ yr Cleveland/Akron brokerage; LTL and truckload.',
      lanes:['Cleveland/Akron LTL','Truckload'], daysToPay:30, creditNote:'Verify credit',
      phone:'', email:'', url:'https://amware.com/all-services/freight-brokerage-amware-cleveland-oh' },
    { company:'Kandel Transport', type:'cold-chain', hq:'Akron, OH',
      about:'Akron OTR carrier/brokerage — refrigerated, frozen, dry van; regional + long-haul.',
      lanes:['Akron reefer OTR','Frozen long-haul'], daysToPay:30, creditNote:'Verify credit',
      phone:'', email:'', url:'http://kandel.com/' },
    { company:'Total Quality Logistics (TQL)', type:'cold-chain', hq:'Cincinnati, OH',
      about:'Ohio-based national broker, very high reefer/spot volume; fast onboarding + QuickPay.',
      lanes:['National reefer spot','Midwest TL'], daysToPay:30, creditNote:'A+ credit · QuickPay avail',
      phone:'800-580-3101', email:'carrier@tql.com', url:'https://www.tql.com/' },
    { company:'Nationwide Transport Services', type:'general', hq:'Akron, OH',
      about:'Countrywide logistics with an Akron office; 150+ reps, FTL/LTL + specialized.',
      lanes:['Akron outbound','Specialized'], daysToPay:30, creditNote:'Verify credit',
      phone:'', email:'', url:'https://ntslogistics.com/services/freight-shipping/ohio/akron/' },
    { company:'Echo Global Logistics', type:'general', hq:'Chicago, IL (national)',
      about:'Tech-first national broker with instant quoting; large Midwest reefer + dry volume.',
      lanes:['Midwest reefer/dry','National LTL'], daysToPay:28, creditNote:'A credit',
      phone:'800-354-7993', email:'carriers@echo.com', url:'https://www.echo.com/' },
  ];
  return B.map((b,i)=>Object.assign(b,{ id:'bk_'+(60000+i), status:'New',
    creditScore: b.creditNote.startsWith('A')?95:null }));
}

/* =====================  FREIGHT CALCULATOR  =====================
 * In-the-moment rate for broker replies. SupplyNow model:
 *   dry target $1.69/mi (from Freight Calculator), reefer premium.
 * =============================================================== */
const RPM_DEFAULT = { V:1.69, BOX:1.90, R:2.35, F:2.10, HS:2.60, CV:1.80 };
const CALC_DEFAULTS = { fuelPerGal:3.80, mpg:10 };  // from SNAP quote defaults

function calcRate(o) {
  const miles = +o.miles || 0;
  const dh = +o.deadhead || 0;
  const rpm = +o.rpm || RPM_DEFAULT[o.equip] || 1.69;
  const linehaul = miles * rpm;
  const fuelPerGal = +o.fuelPerGal || CALC_DEFAULTS.fuelPerGal;
  const mpg = +o.mpg || CALC_DEFAULTS.mpg;
  const fuel = o.fuelSurcharge ? Math.round(((miles + dh) / mpg) * fuelPerGal) : 0;
  const accessorials = +o.accessorials || 0;
  const dhCost = dh * (rpm * 0.5);            // recover half-rate on deadhead
  const total = Math.round(linehaul + fuel + accessorials + dhCost);
  const allInRpm = miles ? total / miles : 0;

  // INTERNAL cost model (SupplyNow Dispatch & Trip sheet)
  const costFuel = Math.round(((miles + dh) / mpg) * fuelPerGal);       // fuel is always a cost
  const laborRate = +o.laborRate || 21.50;                              // Mon–Fri labor
  const laborHrs  = (o.laborHrs !== undefined && o.laborHrs !== '' && o.laborHrs !== null)
                    ? +o.laborHrs : Math.round(((miles / 45) + 1) * 10) / 10;  // drive @45mph + 1h handling
  const labor     = Math.round(laborHrs * laborRate);
  const vehPerMi  = +o.vehPerMi || 0.16;
  const vehicle   = Math.round((miles + dh) * vehPerMi);
  const overhead  = (o.overhead !== undefined && o.overhead !== '' && o.overhead !== null) ? +o.overhead : 100;
  const cost      = costFuel + labor + vehicle + overhead;
  const profit    = total - cost;
  const marginPct = total ? (profit / total) * 100 : 0;

  return { miles, dh, rpm, linehaul:Math.round(linehaul), fuel, accessorials, dhCost:Math.round(dhCost),
           total, allInRpm, costFuel, laborHrs, labor, vehicle, overhead, cost, profit, marginPct };
}

function quoteText(o, r, lane) {
  return `SupplyNow (${SN.mc}) can cover ${lane||'this lane'} `
    + `(${o.equipLabel||o.equip}, ${r.miles} mi) for $${r.total.toLocaleString()} all-in`
    + `${r.fuel?` (incl. fuel)`:''}. Asset-based, live GPS + temp tracking. `
    + `Rate good 24 hrs.\n\n${SIG}`;
}

/* ---------- Broker outreach ---------- */
function brokerSetupEmail(b) {
  return { subject:`Carrier setup — ${SN.name} (${SN.mc}) — reefer + dry, Cleveland`,
    body:`Hi${b.contact&&b.contact.name?' '+b.contact.name.split(' ')[0]:''},\n\n${SN.rep} with ${SN.name} (${SN.mc} / ${SN.dot}), an asset-based reefer + dry carrier out of Cleveland. We'd like to get set up with ${b.company} and start covering your NE-Ohio and Great Lakes freight — live GPS + temperature on every load.\n\nAttached / available:\n • Certificate of Insurance (Motor Truck Cargo + auto liability)\n • Carrier capabilities one-pager (fleet specs)\n • Operating authority (MC ${SN.mc.replace('MC ','')}) + W-9 on request\n\nSend your carrier packet / setup link and I'll turn it right around. What lanes are you covering out of NE Ohio this week?\n\n${SIG}` };
}

/* ---------- fetch ---------- */
async function fetchBrokers(filters) {
  await new Promise(r=>setTimeout(r,150));
  return { brokers: applyBrokerFilters(buildBrokers(), filters) };
}
function applyBrokerFilters(list, f) {
  return list.filter(b=>{
    if (f.keyword){ const h=(b.company+' '+b.about+' '+b.hq).toLowerCase(); if(!h.includes(f.keyword.toLowerCase())) return false; }
    if (f.type && f.type!=='any' && b.type!==f.type) return false;
    return true;
  });
}
