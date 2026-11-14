// Token Radar dashboard — renders the board from window.RADAR (data.js).
// No network, no dependencies. Sorting, filtering and the detail drawer
// all run client-side over the shipped rows.

(function () {
  var D = window.RADAR;
  if (!D || !D.rows) {
    document.getElementById("meta").textContent = "data.js failed to load";
    return;
  }
  var rows = D.rows;
  var live = D.live || [];

  var $ = function (id) { return document.getElementById(id); };
  var fmtUsd = function (v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + Math.round(v);
  };
  var fmtPct = function (v) {
    if (v == null) return "—";
    var s = Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0);
    return (v > 0 ? "+" : "") + s + "%";
  };
  var esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  // ---- header meta
  $("meta").innerHTML =
    "<b>" + rows.length + "</b> pre-token protocols · snapshot <b>" + esc(D.as_of) + "</b><br>" +
    "watchlist <b>40/40</b> · model <b>" + esc(D.model) + "</b>";

  // ---- diversity strip: best protocol per category, outside the curator cluster
  var skip = { "Risk Curators": 1, "Onchain Capital Allocator": 1 };
  var best = {};
  rows.forEach(function (r) {
    if (skip[r.category]) return;
    if (!best[r.category] || r.implied_value_usd > best[r.category].implied_value_usd) best[r.category] = r;
  });
  var leaders = Object.keys(best).map(function (k) { return best[k]; })
    .sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; })
    .slice(0, 8);
  $("strip-chips").innerHTML = leaders.map(function (r) {
    return '<button class="chip" data-category="' + esc(r.category) + '" title="Filter to ' + esc(r.category) + '">' +
      "<b>#" + r.rank + " " + esc(r.name) + "</b> <span class=\"cat\">" + esc(r.category) + " · " + fmtUsd(r.implied_value_usd) + "</span></button>";
  }).join("");
  $("strip-chips").addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    setCategory(chip.getAttribute("data-category"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---- filter controls
  var cats = {};
  rows.forEach(function (r) { cats[r.category] = 1; });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement("option");
    o.value = c; o.textContent = c;
    $("category").appendChild(o);
  });
  var chains = {};
  rows.forEach(function (r) { r.chains.forEach(function (ch) { chains[ch] = 1; }); });
  Object.keys(chains).sort().forEach(function (ch) {
    var o = document.createElement("option");
    o.value = ch; o.textContent = ch;
    $("chain").appendChild(o);
  });

  // ---- state
  var state = { tab: "pre", q: "", category: "", chain: "", watchOnly: false, sort: "rank", dir: 1 };

  function setCategory(c) {
    state.category = c;
    $("category").value = c;
    render();
  }

  function filtered() {
    var list = state.tab === "pre" ? rows : live;
    var q = state.q.trim().toLowerCase();
    return list.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !r.watchlist) return false;
      return true;
    });
  }

  function sorted(list) {
    var k = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return dir * (av < bv ? -1 : av > bv ? 1 : 0);
      return dir * (av - bv);
    });
  }

  function render() {
    var list = sorted(filtered());
    var tbody = $("rows");
    tbody.innerHTML = list.map(function (r) {
      var chg = r.change_7d == null ? "—" : '<span class="' + (r.change_7d >= 0 ? "up" : "down") + '">' + fmtPct(r.change_7d) + "</span>";
      var implied = state.tab === "pre"
        ? '<span class="implied">' + fmtUsd(r.implied_value_usd) + "</span>"
        : '<span class="implied">' + fmtUsd(r.tvl_usd) + "</span>";
      var rank = state.tab === "pre" ? r.rank : "—";
      var star = r.watchlist ? ' <span class="star" title="Watchlist">★</span>' : "";
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + rank + "</td>" +
        '<td><span class="name">' + esc(r.name) + "</span>" + star + ' <span class="slug">' + esc(r.slug) + "</span></td>" +
        "<td>" + esc(r.category) + "</td>" +
        "<td>" + esc(r.chains.slice(0, 3).join(", ")) + (r.chains.length > 3 ? " +" + (r.chains.length - 3) : "") + "</td>" +
        '<td class="num">' + fmtUsd(r.tvl_usd) + "</td>" +
        '<td class="num">' + chg + "</td>" +
        '<td class="num">' + implied + "</td></tr>";
    }).join("");
    $("count").textContent = list.length + " of " + (state.tab === "pre" ? rows.length : live.length) +
      (state.tab === "pre" ? " pre-token protocols" : " live protocols") + " shown";
    $("live-note").hidden = state.tab !== "live";
    document.querySelectorAll("#board th").forEach(function (th) {
      var k = th.getAttribute("data-sort");
      if (k) th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (k === state.sort ? (state.dir === 1 ? " ▲" : " ▼") : "");
    });
    $("tab-pre").setAttribute("aria-selected", state.tab === "pre" ? "true" : "false");
    $("tab-live").setAttribute("aria-selected", state.tab === "live" ? "true" : "false");
  }

  // ---- events
  $("search").addEventListener("input", function (e) { state.q = e.target.value; render(); });
  $("category").addEventListener("change", function (e) { state.category = e.target.value; render(); });
  $("chain").addEventListener("change", function (e) { state.chain = e.target.value; render(); });
  $("watchonly").addEventListener("change", function (e) { state.watchOnly = e.target.checked; render(); });
  $("tab-pre").addEventListener("click", function () { state.tab = "pre"; render(); });
  $("tab-live").addEventListener("click", function () { state.tab = "live"; render(); });
  document.querySelectorAll("#board th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var k = th.getAttribute("data-sort");
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === "name" || k === "category" ? 1 : -1; }
      render();
    });
  });

  // ---- detail drawer
  function openDrawer(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    var f = r.factors;
    var body = "<h2>" + esc(r.name) + (r.watchlist ? ' <span class="star">★</span>' : "") + "</h2>" +
      '<p class="dsub">Rank #' + r.rank + " · " + esc(r.category) + " · " + esc(r.chains.join(", ")) +
      " · TVL " + fmtUsd(r.tvl_usd) + " · 7d " + fmtPct(r.change_7d) + "</p>" +
      "<h3>Value model</h3>" +
      '<table class="factors">' +
      "<tr><td>TVL</td><td>" + fmtUsd(r.tvl_usd) + "</td></tr>" +
      "<tr><td>Category multiple (" + esc(r.category) + ")</td><td>" + f.categoryMultiple.toFixed(2) + "×</td></tr>" +
      "<tr><td>Momentum (7d " + fmtPct(r.change_7d) + ")</td><td>" + f.momentum.toFixed(2) + "×</td></tr>" +
      "<tr><td>Age (" + (f.years * 12).toFixed(0) + " months running)</td><td>" + f.age.toFixed(2) + "×</td></tr>" +
      "<tr><td>Early (no token yet)</td><td>" + f.early.toFixed(2) + "×</td></tr>" +
      "<tr><td>Breadth (" + r.chains.length + " chains)</td><td>" + f.breadth.toFixed(2) + "×</td></tr>" +
      '<tr class="total"><td>Implied launch value</td><td>' + fmtUsd(r.implied_value_usd) + "</td></tr>" +
      "</table>" +
      "<h3>Farm plan — 7 steps for this protocol</h3>" +
      '<ol class="plan">' + r.farm_steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>";
    $("drawer-body").innerHTML = body;
    $("drawer").hidden = false;
    if (history.replaceState) history.replaceState(null, "", "#p=" + encodeURIComponent(slug));
  }
  function closeDrawer() {
    $("drawer").hidden = true;
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  }
  $("rows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr");
    if (tr) openDrawer(tr.getAttribute("data-slug"));
  });
  $("drawer-close").addEventListener("click", closeDrawer);

  // ---- deep links: #p=<slug> opens the drawer, #category=<name> filters
  function applyHash() {
    var h = location.hash.slice(1);
    var params = new URLSearchParams(h);
    var p = params.get("p");
    var cat = params.get("category");
    if (cat) setCategory(cat);
    if (p) openDrawer(p);
  }

  render();
  applyHash();
})();
