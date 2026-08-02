/* =============================================================================
 * FleetView — global Internal / Broker-facing view mode (shared across tools)
 * -----------------------------------------------------------------------------
 * One switch, persisted in localStorage, applied on every page. In
 * broker-facing mode a standing CSS rule hides everything tagged .internal-only
 * (scores, margins, credit, cost, intel, logs) so any screen is safe to
 * screen-share or hand a broker. Elements tagged .broker-only show ONLY in
 * broker-facing mode.
 * =========================================================================== */
(function () {
  var KEY = 'fleetview_view_mode';
  function get() { return localStorage.getItem(KEY) === 'broker' ? 'broker' : 'internal'; }
  function apply(m) {
    document.body.classList.toggle('broker-facing', m === 'broker');
    var b = document.getElementById('vm-toggle');
    if (b) { b.textContent = m === 'broker' ? '🤝 Broker view' : '🔒 Internal'; b.dataset.mode = m; b.title = m==='broker'?'Broker-facing — safe to screen-share. Click for internal.':'Internal cockpit. Click for broker-facing.'; }
    if (typeof window.onViewMode === 'function') window.onViewMode(m);
  }
  function toggle() { var m = get() === 'internal' ? 'broker' : 'internal'; localStorage.setItem(KEY, m); apply(m); }
  window.FleetViewMode = { get: get, apply: apply, toggle: toggle };
  document.addEventListener('DOMContentLoaded', function () {
    var host = document.getElementById('vm-host');
    if (host) { var btn = document.createElement('button'); btn.id = 'vm-toggle'; btn.className = 'btn vm-btn'; btn.onclick = toggle; host.appendChild(btn); }
    apply(get());
  });
})();
