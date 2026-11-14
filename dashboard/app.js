// Limber Meridian dashboard: renders window.RADAR, no network, no fetch.
(function () {
  var D = window.RADAR;
  if (!D) return;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return s;
  }
  function growthClass(v) {
    if (v === null || v === undefined) return '';
    return v > 0 ? 'up' : v < 0 ? 'down' : '';
  }
  function $(id) { return document.getElementById(id); }

  // Masthead and stats.
  $('mastMeta').innerHTML =
    'Snapshot as of <b>' + esc(D.as_of) + '</b><br>' +
    esc(D.watchlist_size) + ' watchlist &middot; ' + esc(D.board_size) + ' rows &middot; ' + esc(D.live_size) + ' live';
  var top = D.rows[0];
  $('stats').innerHTML =
    '<div class="stat"><div class="k">Top implied value</div><div class="v">' + money(top.implied_value_usd) + ' <small>' + esc(top.name) + '</small></div></div>' +
    '<div class="stat"><div class="k">Market multiple</div><div class="v">' + D.market_multiple.toFixed(3) + ' <small>median mcap / TVL</small></div></div>' +
    '<div class="stat"><div class="k">Board rows</div><div class="v">' + D.board_size + ' <small>' + D.early_size + ' beyond the watchlist</small></div></div>' +
    '<div class="stat"><div class="k">Watchlist covered</div><div class="v">' + D.watchlist_size + ' / ' + D.watchlist_size + ' <small>every slug</small></div></div>';
  $('footDate').textContent = D.as_of;
  $('marketMultiple').textContent = D.market_multiple.toFixed(4);

  // Tabs.
  var tabButtons = document.querySelectorAll('#tabs button');
  function showTab(name) {
    tabButtons.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tabpage').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
  }
  tabButtons.forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });

  // Category filter options.
  var categories = [];
  D.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) === -1) categories.push(r.category);
  });
  categories.sort();
  var filter = $('categoryFilter');
  filter.innerHTML = '<option value="">All categories</option>' +
    categories.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');

  // Diversity strip: the ten biggest categories on the board.
  var counts = {};
  D.rows.forEach(function (r) {
    var c = r.category || '(no category)';
    counts[c] = (counts[c] || 0) + 1;
  });
  var topCats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 10);
  $('strip').innerHTML = topCats.map(function (c) {
    return '<span class="chip" data-cat="' + esc(c) + '">' + esc(c) + ' <b>' + counts[c] + '</b></span>';
  }).join('');
  document.querySelectorAll('#strip .chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var c = chip.dataset.cat;
      filter.value = categories.indexOf(c) === -1 ? '' : c;
      document.querySelectorAll('#strip .chip').forEach(function (x) { x.classList.toggle('on', x === chip); });
      renderBoard();
    });
  });

  var selectedSlug = null;

  function visibleRows() {
    var q = $('search').value.trim().toLowerCase();
    var cat = filter.value;
    var rows = D.rows.filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (q && (r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1)) return false;
      return true;
    });
    var sort = $('sortBy').value;
    if (sort === 'implied') rows.sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; });
    else if (sort === 'tvl') rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (sort === 'growth') rows.sort(function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); });
    else rows.sort(function (a, b) { return a.rank - b.rank; });
    return rows;
  }

  function renderBoard() {
    var rows = visibleRows();
    $('rowCount').textContent = rows.length + ' of ' + D.board_size + ' rows';
    $('boardBody').innerHTML = rows.map(function (r) {
      var core = r.farm_steps && r.farm_steps.length > 1 ? r.farm_steps[1] : (r.farm_steps[0] || '');
      return '<tr data-slug="' + esc(r.slug) + '"' + (r.slug === selectedSlug ? ' class="selected"' : '') + '>' +
        '<td class="num rank">#' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + '<small>' + esc(r.slug) + '</small></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="cat">' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + growthClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">&times;' + r.multiple.toFixed(3) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td>' +
        '<td class="step">' + esc(core) + '</td></tr>';
    }).join('');
    document.querySelectorAll('#boardBody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.dataset.slug); });
    });
  }

  function showDetail(slug) {
    var r = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { r = D.rows[i]; break; }
    selectedSlug = slug;
    if (!r) { $('detail').innerHTML = ''; renderBoard(); return; }
    var age = r.age_days === null ? 'unknown age' : r.age_days + ' days listed';
    var basisNote = r.multiple_basis === 'measured' ? 'measured from ' + r.peers + ' tokened peers'
      : r.multiple_basis === 'market' ? 'market median (' + r.peers + ' peers, too few to measure)'
      : r.multiple_basis === 'floored' ? 'measured, floored at 0.15'
      : 'measured, capped at 0.60';
    var why = 'Implied ' + money(r.implied_value_usd) + ' = ' + money(r.tvl_usd) + ' TVL &times; ' + r.multiple.toFixed(3) +
      ' multiple (' + basisNote + ') &times; ' + r.growth_multiplier.toFixed(2) + ' growth &times; ' +
      r.maturity_multiplier.toFixed(2) + ' maturity. Ranked #' + r.rank + ' because its TVL at that multiple beats every protocol below it.';
    $('detail').innerHTML =
      '<div class="detail-card"><h2><span class="rank">#' + r.rank + '</span>' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.category || 'No category') + ' &middot; ' + esc((r.chains || []).join(', ') || 'no chain listed') +
      ' &middot; TVL ' + money(r.tvl_usd) + ' &middot; 7d <span class="' + growthClass(r.change_7d) + '">' + pct(r.change_7d) +
      '</span> &middot; ' + age + '</p>' +
      '<div class="model-line"><span>Multiple <b>&times;' + r.multiple.toFixed(3) + '</b> <span class="dim">' + esc(basisNote) + '</span></span>' +
      '<span>Growth <b>&times;' + r.growth_multiplier.toFixed(2) + '</b></span>' +
      '<span>Maturity <b>&times;' + r.maturity_multiplier.toFixed(2) + '</b></span>' +
      '<span>Implied value <b>' + money(r.implied_value_usd) + '</b></span></div>' +
      '<p class="why"><b>Why this rank.</b> ' + why + '</p>' +
      '<h3>Farm plan &mdash; seven steps</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol></div>';
    document.querySelectorAll('#boardBody tr').forEach(function (tr) {
      tr.classList.toggle('selected', tr.dataset.slug === slug);
    });
    var card = document.querySelector('.detail-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Live tokens.
  $('liveBody').innerHTML = D.live.map(function (p) {
    var ratio = p.mcap_usd !== null && p.tvl_usd > 0 ? (p.mcap_usd / p.tvl_usd).toFixed(3) : '—';
    return '<tr><td class="name">' + esc(p.name) + '<small>' + esc(p.slug) + '</small></td>' +
      '<td class="cat">' + esc(p.category || '—') + '</td>' +
      '<td class="cat">' + esc((p.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num val">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">&times;' + ratio + '</td>' +
      '<td class="num ' + growthClass(p.change_7d) + '">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // Multiples table.
  $('multiplesBody').innerHTML = D.multiples.map(function (m) {
    return '<tr><td class="name">' + esc(m.category) + '</td>' +
      '<td class="num">' + m.peers + '</td>' +
      '<td class="num">' + (m.raw_median === null ? '—' : '&times;' + m.raw_median.toFixed(3)) + '</td>' +
      '<td class="num val">&times;' + m.multiple.toFixed(3) + '</td>' +
      '<td class="cat">' + esc(m.basis) + '</td></tr>';
  }).join('');

  $('search').addEventListener('input', renderBoard);
  filter.addEventListener('change', renderBoard);
  $('sortBy').addEventListener('change', renderBoard);

  // Hash routing for deep links: #detail=<slug> and #filter=<category>.
  function applyHash() {
    var h = location.hash.replace(/^#/, '');
    var params = {};
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    if (params.filter && categories.indexOf(params.filter) !== -1) filter.value = params.filter;
    renderBoard();
    if (params.detail) showDetail(params.detail);
  }
  window.addEventListener('hashchange', applyHash);
  applyHash();
})();
