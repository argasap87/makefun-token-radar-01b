// Limber Equinox dashboard: renders the board window.LIMBER_DATA carries.
// Board, detail view and filters are all driven by that data — no network,
// no hardcoded rows. Hash routes: #detail/<slug>, #filter/<category>,
// #watchlist (watchlist-only view).
(function () {
  "use strict";
  var D = window.LIMBER_DATA;
  var PAGE = 15;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
    return "$" + Math.round(n);
  }
  function pct(v) {
    if (v == null) return "—";
    var s = (v > 0 ? "+" : "") + v.toFixed(1) + "%";
    return '<span class="' + (v > 0 ? "up" : v < 0 ? "down" : "") + '">' + s + "</span>";
  }
  function ageYears(listedAt) {
    if (!listedAt) return null;
    var days = (new Date(D.as_of + "T00:00:00Z") - new Date(listedAt + "T00:00:00Z")) / 86400000;
    if (!(days > 0)) return null;
    return days / 365;
  }

  var state = { q: "", cat: "All", wl: false, sort: "value", page: 0, sel: null };

  function filtered() {
    var rows = D.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.cat !== "All" && r.category !== state.cat) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (state.sort === "tvl") rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (state.sort === "growth") rows.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (state.sort === "age") rows.sort(function (a, b) {
      var ya = ageYears(a.listed_at), yb = ageYears(b.listed_at);
      if (ya == null && yb == null) return 0;
      if (ya == null) return 1;
      if (yb == null) return -1;
      return yb - ya;
    });
    else rows.sort(function (a, b) { return a.rank - b.rank; });
    return rows;
  }

  function renderBoard() {
    var rows = filtered();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    if (state.page < 0) state.page = 0;
    var slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
    $("rows").innerHTML = slice.map(function (r) {
      return "<tr data-slug=\"" + esc(r.slug) + "\" class=\"" + (state.sel === r.slug ? "sel" : "") + "\">" +
        "<td class=\"rank\">" + r.rank + "</td>" +
        "<td class=\"name\">" + esc(r.name) + (r.watchlist ? " <span class=\"star\" title=\"On the house watchlist\">★</span>" : "") + "</td>" +
        "<td class=\"cat\">" + esc(r.category) + "</td>" +
        "<td class=\"cat\">" + esc(r.chains.slice(0, 2).join(", ")) + (r.chains.length > 2 ? " +" + (r.chains.length - 2) : "") + "</td>" +
        "<td class=\"num\">" + money(r.tvl_usd) + "</td>" +
        "<td class=\"num\">" + pct(r.change_7d) + "</td>" +
        "<td class=\"num\">" + r.multiple.toFixed(2) + (r.multiple_fallback ? "*" : "") + "</td>" +
        "<td class=\"num val\">" + money(r.implied_value_usd) + "</td>" +
        "<td><button type=\"button\" data-detail=\"" + esc(r.slug) + "\">Farm →</button></td>" +
        "</tr>";
    }).join("");
    $("pageInfo").textContent = "Page " + (state.page + 1) + " of " + pages + " · " + rows.length + " rows · 15 per page";
    $("prev").disabled = state.page === 0;
    $("next").disabled = state.page >= pages - 1;
  }

  function renderDiversity() {
    $("diversity").innerHTML = D.diversity.map(function (d) {
      return "<span class=\"chip" + (state.cat === d.category ? " on" : "") + "\" data-cat=\"" + esc(d.category) + "\">" +
        esc(d.category) + " <b>" + d.count + "</b></span>";
    }).join("");
  }

  function renderDetail() {
    var box = $("detail");
    if (!state.sel) { box.hidden = true; box.innerHTML = ""; return; }
    var r = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === state.sel) { r = D.rows[i]; break; }
    if (!r) { box.hidden = true; return; }
    var multNote = r.multiple_fallback
      ? "market median — fewer than 3 tokened peers in " + esc(r.category)
      : "median of " + r.peers + " tokened " + esc(r.category) + " peers";
    box.hidden = false;
    box.innerHTML =
      "<button type=\"button\" class=\"close\" id=\"closeDetail\">Close ✕</button>" +
      "<h2>#" + r.rank + " " + esc(r.name) + (r.watchlist ? " <span class=\"star\">★ watchlist</span>" : "") + "</h2>" +
      "<p class=\"sub\">" + esc(r.category) + " · " + esc(r.chains.join(", ")) +
      (r.listed_at ? " · tracked since " + esc(r.listed_at) : " · listing date unreported") +
      " · records no token</p>" +
      "<div class=\"breakdown\">" +
      "<div class=\"cell\"><div class=\"k\">TVL</div><div class=\"v\">" + money(r.tvl_usd) + "</div></div>" +
      "<div class=\"cell\"><div class=\"k\">Peer multiple</div><div class=\"v\">" + r.multiple.toFixed(3) + "×</div></div>" +
      "<div class=\"cell\"><div class=\"k\">Growth ×</div><div class=\"v\">" + r.growth_factor.toFixed(3) + "</div></div>" +
      "<div class=\"cell\"><div class=\"k\">Age ×</div><div class=\"v\">" + r.age_factor.toFixed(3) + "</div></div>" +
      "<div class=\"cell\"><div class=\"k\">Implied value</div><div class=\"v gold\">" + money(r.implied_value_usd) + "</div></div>" +
      "</div>" +
      "<p class=\"formula\">" + money(r.tvl_usd) + " TVL × " + r.multiple.toFixed(3) + " peer multiple (" + multNote + ") × " +
      r.growth_factor.toFixed(3) + " growth (" + (r.change_7d == null ? "7d change unreported" : (r.change_7d > 0 ? "+" : "") + r.change_7d.toFixed(1) + "% in 7 days") + ") × " +
      r.age_factor.toFixed(3) + " age = <strong>" + money(r.implied_value_usd) + "</strong></p>" +
      "<h3>How to farm it</h3><ol>" +
      r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") +
      "</ol>";
    $("closeDetail").addEventListener("click", function () {
      state.sel = null;
      if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
      renderBoard(); renderDetail();
    });
  }

  function renderMultiples() {
    $("multRows").innerHTML = D.multiples.map(function (m) {
      return "<tr><td>" + esc(m.category) + "</td><td class=\"num\">" + m.peers + "</td>" +
        "<td class=\"num val\">" + m.multiple.toFixed(4) + "×</td>" +
        "<td class=\"cat\">" + (m.fallback ? "Market median" : "Category peers") + "</td></tr>";
    }).join("");
  }

  function applyHash() {
    var h = window.location.hash || "";
    // A new hash replaces the whole view: clear the previous selection,
    // filter and watchlist flag first, then set what the hash names.
    state.sel = null; state.cat = "All"; state.wl = false; state.scrollBoard = false;
    if (h.indexOf("#detail/") === 0) {
      state.sel = decodeURIComponent(h.slice(8));
    } else if (h.indexOf("#filter/") === 0) {
      state.cat = decodeURIComponent(h.slice(8));
    } else if (h === "#watchlist") {
      state.wl = true;
    } else if (h === "#board") {
      state.scrollBoard = true;
    }
    var sel = $("cat");
    if (sel) sel.value = state.cat;
    var cb = $("wl");
    if (cb) cb.checked = state.wl;
    state.page = 0;
  }

  // Deep links land on their view: a #detail/ link opens the detail panel in
  // view, #board puts the board's 15 rows in view. Instant scroll so a
  // screenshot taken on load sees the target, not the top of the page.
  function scrollToHash() {
    if (state.sel) {
      var det = $("detail");
      if (det && !det.hidden) det.scrollIntoView({ behavior: "auto", block: "start" });
    } else if (state.scrollBoard) {
      var main = document.querySelector("main");
      if (main) main.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }

  function renderAll() {
    renderDiversity(); renderBoard(); renderDetail();
  }

  // Static chrome.
  $("metaLine").textContent = "Snapshot " + D.as_of + " · " + D.snapshot_protocols +
    " protocols at $5M+ TVL · " + D.watchlist_count + " on the house watchlist · " +
    D.rows.length + " launch candidates ranked · ★ = watchlist";
  $("globalMedian").textContent = D.global_median_multiple.toFixed(4);
  $("asOf").textContent = D.as_of;
  $("rowCount").textContent = D.rows.length;
  var catSel = $("cat");
  catSel.innerHTML = "<option value=\"All\">All categories</option>" +
    D.diversity.map(function (d) { return "<option value=\"" + esc(d.category) + "\">" + esc(d.category) + " (" + d.count + ")</option>"; }).join("");
  renderMultiples();

  // Events.
  $("q").addEventListener("input", function (e) { state.q = e.target.value; state.page = 0; renderBoard(); });
  catSel.addEventListener("change", function (e) { state.cat = e.target.value; state.page = 0; renderAll(); });
  $("sort").addEventListener("change", function (e) { state.sort = e.target.value; state.page = 0; renderBoard(); });
  $("wl").addEventListener("change", function (e) { state.wl = e.target.checked; state.page = 0; renderBoard(); });
  $("prev").addEventListener("click", function () { state.page--; renderBoard(); });
  $("next").addEventListener("click", function () { state.page++; renderBoard(); });
  $("diversity").addEventListener("click", function (e) {
    var chip = e.target.closest("[data-cat]");
    if (!chip) return;
    state.cat = state.cat === chip.getAttribute("data-cat") ? "All" : chip.getAttribute("data-cat");
    catSel.value = state.cat;
    state.page = 0; renderAll();
  });
  $("rows").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-detail]");
    var tr = e.target.closest("tr[data-slug]");
    var slug = btn ? btn.getAttribute("data-detail") : tr ? tr.getAttribute("data-slug") : null;
    if (!slug) return;
    state.sel = slug;
    history.replaceState(null, "", "#detail/" + encodeURIComponent(slug));
    renderBoard(); renderDetail();
    $("detail").scrollIntoView({ behavior: "auto", block: "start" });
  });
  window.addEventListener("hashchange", function () { applyHash(); renderAll(); scrollToHash(); });

  applyHash();
  renderAll();
  scrollToHash();
})();
