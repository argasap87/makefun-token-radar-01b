// Token Radar dashboard — renders the board from window.RADAR, the data
// file main.ts writes beside this page. No network: every byte the page
// needs is local. Deep links: #p=<slug> opens a protocol's detail view,
// #category=<name> filters to a category, so a screenshot can name the
// exact view it shows.
(function () {
  "use strict";
  var DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) {
    document.getElementById("rows").innerHTML =
      '<tr><td colspan="7">No board data found. Run main.ts first.</td></tr>';
    return;
  }

  var rows = DATA.rows;
  var live = DATA.live_reference || [];
  var state = {
    tab: "pre",
    query: "",
    category: "all",
    chain: "all",
    watchlist: false,
    sort: "rank",
    dir: 1,
  };

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n);
  }

  function pct(change) {
    if (change == null || !isFinite(change)) return "—";
    var sign = change > 0 ? "+" : change < 0 ? "−" : "";
    return sign + Math.abs(change).toFixed(1) + "%";
  }

  function yearsSince(listedAt) {
    if (!listedAt) return null;
    var days = Math.floor(
      (Date.parse(DATA.as_of + "T00:00:00Z") -
        Date.parse(listedAt + "T00:00:00Z")) / 86400000,
    );
    if (!isFinite(days) || days < 0) return null;
    return days / 365.25;
  }

  // ---- stats -------------------------------------------------------------
  var watchCount = rows.filter(function (r) { return r.on_watchlist; }).length;
  var totalImplied = rows.reduce(function (sum, r) { return sum + r.implied_value_usd; }, 0);
  document.getElementById("stats").innerHTML =
    "<span><b>" + rows.length + "</b> protocols on the board</span>" +
    "<span><b>" + watchCount + "</b> on the watchlist</span>" +
    "<span><b>" + (rows.length - watchCount) + "</b> below the floor</span>" +
    "<span><b>" + money(totalImplied) + "</b> combined implied value</span>" +
    "<span>Snapshot as of <b>" + esc(DATA.as_of) + "</b></span>";

  // ---- filter controls ----------------------------------------------------
  var catSelect = document.getElementById("category");
  var chainSelect = document.getElementById("chain");
  function fillSelect(select, values, label) {
    var html = '<option value="all">' + esc(label) + "</option>";
    values.forEach(function (v) {
      html += '<option value="' + esc(v) + '">' + esc(v) + "</option>";
    });
    select.innerHTML = html;
  }
  var categories = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    (r.chains || []).forEach(function (c) {
      if (chains.indexOf(c) < 0) chains.push(c);
    });
  });
  categories.sort();
  chains.sort();
  fillSelect(catSelect, categories, "All categories");
  fillSelect(chainSelect, chains, "All chains");

  // ---- filtering + sorting -------------------------------------------------
  function visibleRows() {
    var list = rows.filter(function (r) {
      if (r.has_token) return false;
      if (state.watchlist && !r.on_watchlist) return false;
      if (state.category !== "all" && r.category !== state.category) return false;
      if (state.chain !== "all" && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.query) {
        var q = state.query;
        if (
          r.name.toLowerCase().indexOf(q) < 0 &&
          r.slug.toLowerCase().indexOf(q) < 0
        ) return false;
      }
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    list.sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av == null && bv == null) return a.rank - b.rank;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return dir * (av < bv ? -1 : av > bv ? 1 : a.rank - b.rank);
      return dir * (av - bv || a.rank - b.rank);
    });
    return list;
  }

  function visibleLive() {
    var list = live.slice();
    var key = state.sort === "implied_value_usd" ? "mcap_usd" : state.sort;
    var dir = state.dir;
    list.sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return dir * (av < bv ? -1 : av > bv ? 1 : 0);
      return dir * (av - bv);
    });
    if (state.query) {
      var q = state.query;
      list = list.filter(function (r) {
        return (
          r.name.toLowerCase().indexOf(q) >= 0 ||
          r.slug.toLowerCase().indexOf(q) >= 0
        );
      });
    }
    if (state.category !== "all") {
      list = list.filter(function (r) { return r.category === state.category; });
    }
    if (state.chain !== "all") {
      list = list.filter(function (r) { return (r.chains || []).indexOf(state.chain) >= 0; });
    }
    return list;
  }

  // ---- rendering ------------------------------------------------------------
  var tbody = document.getElementById("rows");
  var theadRow = document.querySelector("#board thead tr");
  var emptyNote = document.getElementById("empty");
  var maxImplied = rows.length ? rows[0].implied_value_usd : 1;

  function headCell(key, label, num) {
    var cls = (num ? "num" : "") + (state.sort === key ? " sorted" : "");
    return '<th data-sort="' + key + '" class="' + cls + '">' + esc(label) + "</th>";
  }

  function render() {
    var isLive = state.tab === "live";
    theadRow.innerHTML = isLive
      ? "<th class=\"num\">#</th>" +
        headCell("name", "Protocol") +
        headCell("category", "Category") +
        "<th>Chains</th>" +
        headCell("tvl_usd", "TVL", true) +
        headCell("mcap_usd", "Market cap", true)
      : headCell("rank", "Rank", true) +
        headCell("name", "Protocol") +
        headCell("category", "Category") +
        "<th>Chains</th>" +
        headCell("tvl_usd", "TVL", true) +
        headCell("change_7d", "7d", true) +
        headCell("implied_value_usd", "Implied value", true);
    theadRow.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === "name" || key === "category" ? 1 : -1; }
        render();
      });
    });

    var html = "";
    if (!isLive) {
      var list = visibleRows();
      list.forEach(function (r) {
        var width = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
        var chg = r.change_7d;
        var chgCls = chg == null ? "" : chg > 0 ? "up" : chg < 0 ? "down" : "";
        html +=
          '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num">' + r.rank + "</td>" +
          '<td class="name-cell"><b>' + esc(r.name) +
          (r.on_watchlist ? '<span class="star" title="On the watchlist">★</span>' : "") +
          '</b><span class="slug">' + esc(r.slug) + "</span></td>" +
          "<td>" + esc(r.category || "—") + "</td>" +
          "<td>" + (r.chains || []).slice(0, 3).map(function (c) {
            return '<span class="chip">' + esc(c) + "</span>";
          }).join("") + "</td>" +
          '<td class="num">' + money(r.tvl_usd) + "</td>" +
          '<td class="num ' + chgCls + '">' + pct(chg) + "</td>" +
          '<td class="num">' + money(r.implied_value_usd) +
          '<div class="bar"><i style="width:' + width + '%"></i></div></td>' +
          "</tr>";
      });
      emptyNote.hidden = list.length > 0;
    } else {
      var liveList = visibleLive();
      liveList.forEach(function (r, i) {
        html +=
          '<tr data-slug="' + esc(r.slug) + '" data-live="1">' +
          '<td class="num">' + (i + 1) + "</td>" +
          '<td class="name-cell"><b>' + esc(r.name) +
          '</b><span class="slug">' + esc(r.slug) + "</span></td>" +
          "<td>" + esc(r.category || "—") + "</td>" +
          "<td>" + (r.chains || []).slice(0, 3).map(function (c) {
            return '<span class="chip">' + esc(c) + "</span>";
          }).join("") + "</td>" +
          '<td class="num">' + money(r.tvl_usd) + "</td>" +
          '<td class="num">' + money(r.mcap_usd) + "</td>" +
          "</tr>";
      });
      emptyNote.hidden = liveList.length > 0;
    }
    tbody.innerHTML = html;
    tbody.querySelectorAll("tr").forEach(function (tr) {
      tr.addEventListener("click", function () {
        openDetail(tr.getAttribute("data-slug"), tr.getAttribute("data-live") === "1");
      });
    });
  }

  // ---- detail drawer ---------------------------------------------------------
  var drawer = document.getElementById("drawer");
  var backdrop = document.getElementById("backdrop");

  function factorRows(r) {
    var f = r.factors;
    var yrs = yearsSince(r.listed_at);
    function row(label, value, why) {
      return "<tr><td>" + esc(label) + '<span class="why">' + esc(why) + "</span></td>" +
        "<td>×" + value.toFixed(2) + "</td></tr>";
    }
    return (
      row("Category", f.category, "Multiple for " + (r.category || "an uncategorised protocol") + ".") +
      row("Momentum", f.momentum, r.change_7d == null
        ? "No seven-day change reported."
        : "TVL " + (r.change_7d >= 0 ? "grew " : "fell ") + Math.abs(r.change_7d).toFixed(1) + "% in seven days.") +
      row("Age", f.age, r.listed_at == null
        ? "No listing date reported."
        : "Tracked since " + r.listed_at + ".") +
      row("Early", f.early, yrs == null
        ? "No listing date reported."
        : "Still pre-token " + yrs.toFixed(1) + " years into its run.") +
      row("Breadth", f.breadth, "TVL on " + (r.chains || []).length + " chain" + ((r.chains || []).length === 1 ? "" : "s") + ".")
    );
  }

  function openDetail(slug, isLive) {
    var r = null;
    if (isLive) {
      for (var i = 0; i < live.length; i++) if (live[i].slug === slug) r = live[i];
    } else {
      for (var j = 0; j < rows.length; j++) if (rows[j].slug === slug) r = rows[j];
    }
    if (!r) return;
    document.getElementById("d-name").textContent = r.name;
    document.getElementById("d-sub").textContent =
      r.slug + (r.on_watchlist ? "  ★ on the watchlist" : "") +
      (isLive ? "  · already has a token" : "  · no token recorded");
    var facts = "";
    function fact(label, value) {
      facts += "<dt>" + esc(label) + "</dt><dd>" + value + "</dd>";
    }
    if (!isLive) {
      fact("Rank", "#" + r.rank + " of " + rows.length);
      fact("Implied value", money(r.implied_value_usd));
    } else {
      fact("Market cap", money(r.mcap_usd));
    }
    fact("TVL", money(r.tvl_usd));
    if (!isLive) fact("7-day change", pct(r.change_7d));
    fact("Category", esc(r.category || "—"));
    fact("Chains", esc((r.chains || []).join(", ") || "—"));
    if (!isLive) fact("Tracked since", esc(r.listed_at || "—"));
    document.getElementById("d-facts").innerHTML = facts;
    var factorsTable = document.getElementById("d-factors");
    var stepsList = document.getElementById("d-steps");
    var factorHead = factorsTable.previousElementSibling;
    var stepsHead = stepsList.previousElementSibling;
    if (!isLive) {
      factorHead.style.display = "";
      factorsTable.style.display = "";
      factorsTable.innerHTML = factorRows(r);
      stepsHead.style.display = "";
      stepsList.style.display = "";
      stepsList.innerHTML = r.farm_steps.map(function (s) {
        return "<li>" + esc(s) + "</li>";
      }).join("");
    } else {
      factorHead.style.display = "none";
      factorsTable.style.display = "none";
      stepsHead.style.display = "none";
      stepsList.style.display = "none";
      stepsList.innerHTML = "";
    }
    drawer.hidden = false;
    backdrop.hidden = false;
    if (history.replaceState) {
      history.replaceState(null, "", isLive ? "#live=" + encodeURIComponent(slug) : "#p=" + encodeURIComponent(slug));
    }
  }

  function closeDetail() {
    drawer.hidden = true;
    backdrop.hidden = true;
    if (history.replaceState) history.replaceState(null, "", "#");
  }
  document.getElementById("d-close").addEventListener("click", closeDetail);
  backdrop.addEventListener("click", closeDetail);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDetail();
  });

  // ---- controls ---------------------------------------------------------------
  document.getElementById("search").addEventListener("input", function (e) {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
  catSelect.addEventListener("change", function (e) {
    state.category = e.target.value;
    render();
  });
  chainSelect.addEventListener("change", function (e) {
    state.chain = e.target.value;
    render();
  });
  document.getElementById("watchlist").addEventListener("change", function (e) {
    state.watchlist = e.target.checked;
    render();
  });
  function setTab(tab) {
    state.tab = tab;
    document.getElementById("tab-pre").classList.toggle("active", tab === "pre");
    document.getElementById("tab-live").classList.toggle("active", tab === "live");
    document.querySelector(".watch-toggle").style.display = tab === "pre" ? "" : "none";
    state.sort = tab === "pre" ? "rank" : "mcap_usd";
    state.dir = -1;
    render();
  }
  document.getElementById("tab-pre").addEventListener("click", function () { setTab("pre"); });
  document.getElementById("tab-live").addEventListener("click", function () { setTab("live"); });

  // ---- deep links ---------------------------------------------------------------
  var hash = window.location.hash || "";
  var catMatch = /#category=([^&]+)/.exec(hash);
  if (catMatch) {
    var cat = decodeURIComponent(catMatch[1]);
    if (categories.indexOf(cat) >= 0) {
      state.category = cat;
      catSelect.value = cat;
    }
  }
  render();
  var pMatch = /#p=([^&]+)/.exec(hash);
  if (pMatch) openDetail(decodeURIComponent(pMatch[1]), false);
})();
