# FleetView — Freight Command

A one-stop freight dashboard that pulls live loads from multiple boards into a
single, board-agnostic interface: filter, sort, view on a map, generate a
SupplyNow quote, and bid the broker — all in one place.

**Live free sources:**
- **Direct Freight** — the one *truly* free real load board (official API).
- **Craigslist · NE Ohio** — local freight/hauling gigs, scraped with NO login
  (server-side RSS parse in the proxy). This is the "scrape any board" piece,
  applied to a source that's actually open.
- **123Loadboard** — adapter is built but the board is *off by default*: its
  "free tier" is a delayed teaser that funnels to paid, so it's opt-in only.

DAT / Truckstop are intentionally excluded — paid and they prohibit scraping.

---

## Opportunity Pipeline (`opportunities.html`) — the real play

Load boards are the spot market (broker-marked-up, price-competed). The higher-value
game for a carrier is **direct shippers + institutional/RFP + government contracts**.
The Opportunity Pipeline is a BD tool to **scope → score → record → pursue** freight
contracts, equipment-agnostic (cold or dry).

- **Source:** [SAM.gov Get Opportunities API](https://open.gsa.gov/api/get-opportunities-public-api/)
  — real, free federal solicitations. The proxy (`fetchSamGov`) queries the freight
  NAICS set (484xxx trucking, 492xxx courier, 493xxx warehousing).
- **Worth-it score (0–100):** deadline window + core-trucking NAICS + Ohio/neighbor
  proximity + small-business set-aside eligibility + est. value. Every score shows its
  rationale in the drawer.
- **Pipeline board:** New → Scoping → Pursuing → Bid → Won → Passed, drag-free (status
  buttons), persisted per-browser, with an "in pursuit $" roll-up.

**Going live:** get a **free SAM.gov API key** (sam.gov → Account Details → API key),
set `SAM_API_KEY` in the proxy's Script Properties, and set `OPPS_CONFIG.useMock=false`
+ `OPPS_CONFIG.proxyUrl` in `js/opps-data.js`. No paid anything.

**Next layers:** state/institutional RFP boards (Ohio Buys, school districts) and
direct-shipper prospecting via Apollo/ZoomInfo (contacts for NE-Ohio manufacturers,
distributors, cold-storage).

---

## What works right now

Open `index.html` (or publish to GitHub Pages) and it runs immediately on
**realistic sample loads** across your Cleveland / Youngstown / Pittsburgh /
Chicago footprint. Every feature is live in sample mode:

- **Filters** — origin/destination city + state + radius, equipment, weight,
  trip miles, rate, **$/mile floor**, load age, full-only, hide call-for-rate.
- **Results table** — sortable columns, board badges (DF / 123), color-coded
  RPM (green ≥ $2.00, amber ≥ $1.60, red below), age freshness.
- **Map view** — loads plotted at origin with lane lines to destination
  (Table / Split / Map toggle).
- **Detail drawer** — full load + broker card (credit score, days-to-pay).
- **Quote & Bid** — auto-prices against your **$1.69/mi** model, gives a
  go / watch / no verdict vs your floor, adjustable bid slider, a branded
  SupplyNow quote, and a broker message. **Sending always asks you to confirm.**
- **Saved searches / alerts** — stored per-browser.

The mode badge in the header reads **● Sample data** until you go live.

---

## Going live (flip one flag + paste tokens)

The browser never calls the boards directly (their tokens must stay secret and
they block cross-origin calls). A tiny Apps Script proxy holds the tokens,
calls each board server-side, and returns already-normalized loads.

### 1. Get the credentials

| Board | How to get access | Notes |
|---|---|---|
| **Direct Freight** | Request a **partner `api-token`** at <https://github.com/Direct-Freight/df-api-docs> (they issue it after contact). You also need an end-user login. | Full search API — all our filters map to it. |
| **123Loadboard** | Apply for API access at <https://www.123loadboard.com/api/> — they assign a tech lead. Free tier returns loads ~15 min delayed. | Exact field names finalize during onboarding; `proxy/Code.gs` has the mapping stub ready. |

### 2. Deploy the proxy

1. Create a new Apps Script project, paste `proxy/Code.gs`.
2. Fill tokens via **Project Settings → Script Properties** (or run `setup()`
   once, then delete the literals):
   - `DF_API_TOKEN`, `DF_USER`, `DF_PASS`
   - `LB123_API_KEY` (when approved)
3. **Deploy → New deployment → Web app** — *Execute as: Me*, *Access: Anyone*.
   Copy the `/exec` URL.

### 3. Point the frontend at it

In `js/connectors.js`:

```js
const CONFIG = {
  useMock: false,                                  // ← flip this
  proxyUrl: 'https://script.google.com/.../exec',  // ← paste /exec URL
  ...
};
```

Refresh. Badge flips to **● Live**. Toggle boards on/off with the header chips.

> The Direct Freight host/path in `Code.gs` (`api.directfreight.com`, `/boards/load`,
> `/auth`) reflect the published swagger; confirm the exact strings against
> <http://apidocs.directfreight.com/swagger-ui/> when your token arrives — one
> place to edit.

---

## Architecture (why adding a 3rd board is trivial)

```
 index.html ─ css/styles.css
      │
      ├─ js/schema.js       unified Load shape + sample data
      ├─ js/connectors.js   fetchLoads() + per-board adapters (buildQuery/normalize)
      └─ js/app.js          UI: filters, table, map, drawer, quote/bid, saved searches
                                   │  (live mode)
                                   ▼
                       proxy/Code.gs (Apps Script) ─→ Direct Freight API
                                                   └→ 123Loadboard API
```

The UI only ever sees the **unified `Load` schema**. Each board is one adapter
with `buildQuery(filters)` + `normalize(raw)`. To add DAT, Truckstop, NextLoad,
etc. later: add an adapter + a `CONFIG.sources` entry — nothing in the UI changes.

## Files

```
freight-dashboard/
├── index.html
├── css/styles.css
├── js/schema.js
├── js/connectors.js
├── js/app.js
├── proxy/Code.gs
└── README.md
```

## Notes / honest limits

- **APIs, not scraping.** DAT and Truckstop are paid and prohibit scraping;
  the free boards' web UIs are auth-walled SPAs behind bot-detection. Using the
  official Direct Freight / 123Loadboard APIs is legal, robust, and gives clean
  structured data. "Scrape any board" from a static page isn't real; this is.
- **Bidding is outward-facing** and always behind an explicit confirm. In live
  mode wire the bid to the board's endpoint or a broker email in `doPost()`.
- Sample RPMs are randomized around real market ranges to exercise the UI.
