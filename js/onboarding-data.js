/* =============================================================================
 * FleetView — Vendor Onboarding agent: SupplyNow master profile + packet gen
 * -----------------------------------------------------------------------------
 * Turn any buyer (broker, federal, hospital/GPO, state, direct shipper) into a
 * completed, tailored vendor-onboarding packet + required-docs checklist +
 * cover email, drawn from one canonical SupplyNow profile. Real data only;
 * fields I can't know (EIN, SAM UEI, CAGE, bank) are flagged GAPS — never faked.
 * =========================================================================== */

const SN_PROFILE = {
  legalName:'Supply Now Inc.',
  dba:'SupplyNow',
  entity:'Corporation — Ohio',
  mc:'MC 1660872',
  dot:'USDOT 3976910',
  physical:'2800 Euclid Ave, Suite 310, Cleveland, OH 44115',
  remit:'Attn: Mike Cook, 2174 Eldred Ave, Lakewood, OH 44107',
  phone:'216-548-7070',
  dispatchEmail:'dispatch@supplynow.org',
  apEmail:'mike@supplynow.org',
  contactName:'Mike Cook',
  contactTitle:'Owner',
  equipment:'Refrigerated (reefer) + dry box trucks (16–26′), cargo/sprinter vans',
  serviceArea:'NE Ohio + Great Lakes (OH, PA, MI, IN, NY)',
  naics:'484220, 484230, 484110, 492110',
  insCarrier:'NICO (your agent) — COI on request',
  insCargo:'Motor Truck Cargo',
  insAuto:'Auto Liability',
  coiDoc:'https://drive.google.com/file/d/1B8X19GoPGAXJvdaTx3uIbh-BHD3lDzBw/view',
  onePager:'carrier-onepager.html',
  references:[
    'US Foods — Detroit redistribution lane (recurring reefer)',
    'Pizza Bagel Lady (Terry Thomsen) — recurring cold-chain',
    'Summit Academy SNAP — 4-campus daily delivery',
  ],
  // GAPS — filled from the PRIVATE (device-only) profile below; never hardcoded here.
  ein:'', uei:'', cage:'', factoring:'',
};

/* Private, device-only fields (EIN, bank, UEI, CAGE, factoring) live in
 * localStorage — NEVER committed to the public repo. Entered once in the UI. */
const PRIV_KEY = 'fleetview_sn_private';
function privateProfile(){ try { return JSON.parse(localStorage.getItem(PRIV_KEY)||'{}'); } catch { return {}; } }
function savePrivate(o){ localStorage.setItem(PRIV_KEY, JSON.stringify(Object.assign(privateProfile(), o))); }
function profile(){ return Object.assign({}, SN_PROFILE, privateProfile()); }
function bankLine(p){ return p.bankName ? `${p.bankName} · Routing ${p.routing||'—'} · Acct ${p.account||'—'} (${p.acctType||'Business Checking'})` : ''; }

/* Buyer types: what each requires, which map to SN fields, and the gaps */
const BUYER_TYPES = {
  broker: { label:'Broker carrier packet',
    intro:'Carrier setup with a freight broker (e.g., TQL, Echo, a NE-Ohio broker).',
    needs:[
      ['Legal name + MC/DOT','have'],['W-9','gap-ein'],
      ['COI — Auto Liability + Cargo, broker as Certificate Holder','have-coi'],
      ['Signed broker–carrier agreement','buyer'],
      ['Remittance / factoring info (NOA if factored)','gap-bank'],
      ['Equipment list','have'],['Primary contact','have'],
    ] },
  federal: { label:'Federal (SAM.gov) vendor',
    intro:'Register to bid federal contracts (VA, USDA, DLA, etc.).',
    needs:[
      ['SAM.gov registration + UEI','gap-uei'],['CAGE code','gap-cage'],
      ['NAICS codes','have'],['Small-business size self-cert','have'],
      ['Reps & Certifications (SAM)','buyer'],['Banking / ACH (in SAM)','gap-bank'],['POC','have'],
    ] },
  hospital: { label:'Hospital / GPO vendor',
    intro:'Vendor credentialing for a hospital system or GPO (Cleveland Clinic, UH, MetroHealth).',
    needs:[
      ['W-9','gap-ein'],['COI — higher limits + Additional Insured endorsement','have-coi'],
      ['Vendor credentialing form','buyer'],['References','have'],
      ['Capabilities statement','have-1p'],['Auto + Cargo insurance certificate','have-coi'],
    ] },
  state: { label:'State of Ohio vendor',
    intro:'Register as an Ohio state supplier (OAKS) to bid state/agency contracts.',
    needs:[
      ['Ohio Supplier (OAKS) registration','gap-oaks'],['W-9','gap-ein'],
      ['Insurance certificate','have-coi'],['EEO / affirmative-action statement','buyer'],
      ['Business classification','have'],
    ] },
  shipper: { label:'Direct shipper setup',
    intro:'New-carrier setup with a direct shipper / manufacturer / distributor.',
    needs:[
      ['Legal name + MC/DOT','have'],['COI','have-coi'],['W-9','gap-ein'],
      ['Capabilities one-pager','have-1p'],['References','have'],
    ] },
};

/* Completed packet field rows (label → value) drawn from the profile */
function packetRows(typeKey) {
  const p = profile();
  const bank = bankLine(p);
  const base = [
    ['Legal business name', p.legalName],
    ['DBA', p.dba],
    ['Entity type', p.entity],
    ['MC number', p.mc],
    ['USDOT number', p.dot],
    ['Physical address', p.physical],
    ['Remittance / mailing', p.remit],
    ['Phone', p.phone],
    ['Dispatch email', p.dispatchEmail],
    ['AP / billing email', p.apEmail],
    ['Primary contact', `${p.contactName}, ${p.contactTitle}`],
    ['Equipment', p.equipment],
    ['Service area', p.serviceArea],
    ['NAICS codes', p.naics],
    ['Insurance — cargo', `${p.insCargo} (${p.insCarrier})`],
    ['Insurance — auto', p.insAuto],
    ['EIN (Tax ID)', p.ein || '⚠ PROVIDE — enter in My Info'],
  ];
  if (typeKey === 'federal') base.push(
    ['SAM UEI', p.uei || '⚠ PROVIDE — register at SAM.gov'],
    ['CAGE code', p.cage || '⚠ PROVIDE — assigned during SAM reg'],
    ['Business size', 'Small Business'],
    ['ACH / banking', bank || '⚠ PROVIDE — enter in My Info']);
  if (typeKey === 'broker') base.push(
    ['Factoring / remittance', p.factoring || (bank ? 'Direct pay — ' + bank : '⚠ PROVIDE — direct-pay or factor + NOA')]);
  if ((typeKey === 'hospital' || typeKey === 'shipper') && bank) base.push(['ACH / remittance', bank]);
  if (typeKey === 'state') base.push(
    ['OAKS supplier ID', '⚠ PROVIDE — register at supplier.ohio.gov']);
  return base;
}

function coverEmail(typeKey, buyerName) {
  const t = BUYER_TYPES[typeKey]; const who = buyerName || 'your team';
  const subject = `Carrier onboarding — Supply Now Inc. (${SN_PROFILE.mc})`;
  const body =
`Hello,

Attached is our carrier onboarding packet for ${who}. Supply Now Inc. (${SN_PROFILE.mc} / ${SN_PROFILE.dot}) is an asset-based refrigerated + dry carrier out of Cleveland, ready to run your ${typeKey==='hospital'?'medical cold-chain':typeKey==='federal'||typeKey==='state'?'contract':'recurring'} freight.

Included: company profile, MC/DOT, insurance (Motor Truck Cargo + Auto Liability — COI on request), equipment, and references. Point me to your setup form or portal and I'll complete it same day.

Mike Cook
SupplyNow — Asset-Based Reefer & Dry Carrier
${SN_PROFILE.phone} · ${SN_PROFILE.dispatchEmail}
${SN_PROFILE.mc} · ${SN_PROFILE.dot}`;
  return { subject, body };
}

const DOC_LABEL = {
  'have':'On file', 'have-coi':'COI on file', 'have-1p':'One-pager ready',
  'gap-ein':'Need W-9 (EIN)', 'gap-uei':'Register SAM/UEI', 'gap-cage':'CAGE via SAM',
  'gap-bank':'Provide banking', 'gap-oaks':'Register OAKS', 'buyer':'Buyer provides',
};
function docColor(s){ return s.startsWith('have')?'#3fb950':s==='buyer'?'#6b7684':'#f2a541'; }
