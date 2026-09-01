/* =============================================================================
 * FleetView — Pipeline Core (shared across Opportunities, Dashboard, Marketing)
 * -----------------------------------------------------------------------------
 * ONE record per pursuit, one append-only activity log, one set of stage math.
 * Every page reads and writes through here so the pipeline can't say different
 * things on different screens — that is the whole point of the oversight layer.
 *
 * Storage (localStorage, no backend):
 *   fleetview_opps_pipeline   {id: {status, notes, owner, nextAction,
 *                                   nextActionDue, campaign, valueOverride,
 *                                   history:[{t, from, to, by}]}}
 *   fleetview_activity_log    [{t, id, title, kind, text}]   append-only, capped
 *
 * Backward compatible: records written by the older Opportunities page carried
 * only {status, notes}; missing fields are filled on read, not on migration.
 * =========================================================================== */
'use strict';

const PIPE_KEY   = 'fleetview_opps_pipeline';
const LOG_KEY    = 'fleetview_activity_log';
const LOG_CAP    = 400;

const STATUSES = ['New','Scoping','Pursuing','Bid','Won','Passed'];
const STATUS_COLOR = {
  New:'#6b7684', Scoping:'#4c8dff', Pursuing:'#f2a541',
  Bid:'#c471ed', Won:'#3fb950', Passed:'#f85149',
};
// Weighted-forecast probability by stage. Deliberately conservative: federal
// bids are low-hit-rate, so a fat "Pursuing" column should NOT read as revenue.
const STAGE_PROB = { New:0.02, Scoping:0.10, Pursuing:0.25, Bid:0.40, Won:1, Passed:0 };
// A pursuit with no stage movement for this long is flagged as drifting.
const STALE_DAYS = 14;

const BLANK = () => ({
  status:'New', notes:'', owner:'', nextAction:'', nextActionDue:'',
  campaign:'', valueOverride:null, history:[],
});

const Pipeline = (function () {
  function all() { try { return JSON.parse(localStorage.getItem(PIPE_KEY) || '{}'); } catch { return {}; } }
  function writeAll(p) { localStorage.setItem(PIPE_KEY, JSON.stringify(p)); }

  function get(id) { return Object.assign(BLANK(), all()[id] || {}); }

  /* Patch a record. Stage changes are stamped into history and the activity
   * log automatically — a status can never move without leaving a trace. */
  function set(id, patch, meta) {
    const store = all();
    const before = Object.assign(BLANK(), store[id] || {});
    const after  = Object.assign({}, before, patch);
    if (patch.status && patch.status !== before.status) {
      after.history = (before.history || []).concat([{
        t: Date.now(), from: before.status, to: patch.status, by: (meta && meta.by) || 'me',
      }]);
      log({ id, title: (meta && meta.title) || id, kind: 'stage',
            text: `${before.status} → ${patch.status}` });
    }
    if (patch.owner && patch.owner !== before.owner) {
      log({ id, title: (meta && meta.title) || id, kind: 'owner', text: `Owner set to ${patch.owner}` });
    }
    if (patch.nextAction && patch.nextAction !== before.nextAction) {
      log({ id, title: (meta && meta.title) || id, kind: 'action',
            text: `Next: ${patch.nextAction}${patch.nextActionDue ? ' (by ' + patch.nextActionDue + ')' : ''}` });
    }
    store[id] = after; writeAll(store);
    return after;
  }

  /* ---- append-only activity log ---- */
  function logAll() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } }
  function log(entry) {
    const l = logAll();
    l.unshift(Object.assign({ t: Date.now() }, entry));
    localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(0, LOG_CAP)));
  }

  /* ---- derived reads ---- */
  // Attach the stored record onto a list of opportunities (non-destructive).
  function decorate(opps) {
    const store = all();
    return opps.map(o => {
      const rec = Object.assign(BLANK(), store[o.id] || {});
      return Object.assign({}, o, rec, {
        effValue: rec.valueOverride != null ? rec.valueOverride : (o.value || 0),
        lastMoved: rec.history && rec.history.length ? rec.history[rec.history.length-1].t : null,
      });
    });
  }
  function daysSinceMove(o) {
    if (!o.lastMoved) return null;
    return Math.floor((Date.now() - o.lastMoved) / 86400000);
  }
  function isStale(o) {
    if (['Won','Passed','New'].includes(o.status)) return false;
    const d = daysSinceMove(o);
    return d === null ? true : d >= STALE_DAYS;   // never moved = drifting too
  }
  function isOpen(o) { return !['Won','Passed'].includes(o.status); }

  // Weighted forecast. Returns the money AND the honesty: how much of the
  // pipeline actually has a dollar figure behind it.
  function forecast(opps) {
    let weighted = 0, raw = 0, withValue = 0, counted = 0;
    opps.forEach(o => {
      if (!isOpen(o)) return;
      counted++;
      const v = o.effValue || 0;
      if (v > 0) withValue++;
      raw += v;
      weighted += v * (STAGE_PROB[o.status] != null ? STAGE_PROB[o.status] : 0);
    });
    return { weighted, raw, withValue, counted,
             coverage: counted ? Math.round(withValue / counted * 100) : 0 };
  }
  function byStage(opps) {
    const m = {}; STATUSES.forEach(s => m[s] = { n:0, value:0, items:[] });
    opps.forEach(o => { const b = m[o.status] || m.New; b.n++; b.value += o.effValue || 0; b.items.push(o); });
    return m;
  }
  function winRate(opps) {
    const won = opps.filter(o => o.status==='Won').length;
    const closed = won + opps.filter(o => o.status==='Passed').length;
    return { won, closed, pct: closed ? Math.round(won/closed*100) : null };
  }

  return { all, get, set, log, logAll, decorate, decorateList:decorate,
           daysSinceMove, isStale, isOpen, forecast, byStage, winRate,
           STATUSES, STATUS_COLOR, STAGE_PROB, STALE_DAYS };
})();

/* Real days-until against the real clock. (The Opportunities page originally
 * pinned "now" to a build date, which quietly aged every deadline.) */
function fvDaysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((d - now) / 86400000);
}
const fvMoney = n => n ? '$' + Math.round(n).toLocaleString() : '—';
function fvAgo(t) {
  if (!t) return '—';
  const m = Math.floor((Date.now()-t)/60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m/60); if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}
