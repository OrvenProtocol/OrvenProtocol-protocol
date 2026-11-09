(function () {
  'use strict';
  var doc = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var REG = {};
  try { REG = JSON.parse(doc.getElementById('reg').textContent).records || {}; } catch (e) { REG = {}; }
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  /* ---------- damped spring ---------- */
  function spring(opts, onUpdate, onDone) {
    var k = opts.stiffness || 170, c = opts.damping || 24, m = opts.mass || 1;
    var x = 0, v = 0, target = 1, dt = 1 / 120, acc = 0, last = performance.now(), alive = true;
    function frame(now) {
      if (!alive) return;
      acc += Math.min(0.05, (now - last) / 1000); last = now;
      while (acc >= dt) {
        var a = (-k * (x - target) - c * v) / m;
        v += a * dt; x += v * dt; acc -= dt;
      }
      var settled = Math.abs(x - target) < 0.0008 && Math.abs(v) < 0.0008;
      onUpdate(settled ? 1 : x);
      if (settled) { alive = false; if (onDone) onDone(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return function cancel() { alive = false; };
  }

  /* ---------- scroll reveal (not used by hero) ---------- */
  function setupReveal() {
    var els = $$('[data-reveal]');
    if (reduced || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.style.opacity = 1; }); return; }
    $$('[data-stagger]').forEach(function (g) {
      $$('[data-reveal]', g).forEach(function (e, i) { e.dataset.i = i; });
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, d = (parseInt(el.dataset.i || '0', 10) || 0) * 80;
        setTimeout(function () {
          spring({ stiffness: 150, damping: 20 }, function (p) {
            el.style.opacity = Math.min(1, p * 1.4);
            el.style.transform = 'translate3d(0,' + ((1 - p) * 36).toFixed(2) + 'px,0)';
          }, function () { el.style.transform = ''; el.style.opacity = 1; });
        }, d);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------- scroll progress + parallax ---------- */
  var bar = $('.progress i');
  var hero = $('.hero');
  var layers = $$('[data-depth]');
  var ptr = { x: 0, y: 0 }, scrollY = 0, ticking = false;
  function paint() {
    ticking = false;
    var max = doc.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max) : 0) + ')';
    if (reduced || !hero) return;
    var hh = hero.offsetHeight, s = Math.min(scrollY, hh);
    layers.forEach(function (l) {
      var d = parseFloat(l.dataset.depth);
      l.style.setProperty('--px', (ptr.x * d * 60).toFixed(1) + 'px');
      l.style.setProperty('--py', (ptr.y * d * 60 + s * d * 1.4).toFixed(1) + 'px');
    });
  }
  function queue() { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }
  addEventListener('scroll', function () { scrollY = window.pageYOffset; queue(); }, { passive: true });
  addEventListener('resize', queue);
  if (hero && !reduced) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      ptr.x = (e.clientX - r.left) / r.width - 0.5; ptr.y = (e.clientY - r.top) / r.height - 0.5; queue();
    });
  }
  queue();

  /* ---------- spotlight ---------- */
  doc.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest('[data-spot]');
    if (!t) return;
    var r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    t.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  /* ---------- copy ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var t = doc.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      doc.body.appendChild(t); t.select();
      try { doc.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } t.remove();
    });
  }
  function flashDone(btn, doneLabel, ms) {
    var act = btn.querySelector('.ca__act'), old = act ? act.textContent : null;
    btn.classList.add('is-done');
    if (act) act.textContent = doneLabel;
    var live = $('#live'); if (live) live.textContent = doneLabel;
    setTimeout(function () { btn.classList.remove('is-done'); if (act) act.textContent = old; if (live) live.textContent = ''; }, ms || 1400);
  }
  var ca = $('button.ca[data-copy]');
  if (ca) ca.addEventListener('click', function () {
    copyText(ca.dataset.copy).then(function () { flashDone(ca, 'Copied'); }, function () { flashDone(ca, 'Press copy'); });
  });

  /* ---------- ways accordion ---------- */
  var ways = $$('.way');
  function openWay(w) { ways.forEach(function (x) { x.classList.toggle('is-open', x === w); x.setAttribute('aria-expanded', x === w ? 'true' : 'false'); }); }
  ways.forEach(function (w) {
    w.addEventListener('click', function () { openWay(w); });
    w.addEventListener('mouseenter', function () { if (matchMedia('(hover:hover)').matches) openWay(w); });
    w.addEventListener('focus', function () { openWay(w); });
    w.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWay(w); } });
  });

  /* ---------- faq ---------- */
  var items = $$('.faq__item');
  if (items.length) {
    var cur = 0;
    var qEl = $('.faq__aq'), aEl = $('.faq__aa'), cEl = $('.faq__count'), ans = $('.faq__answer');
    var setFaq = function (i) {
      cur = (i + items.length) % items.length;
      items.forEach(function (it, n) { it.classList.toggle('is-on', n === cur); it.querySelector('.faq__q').setAttribute('aria-expanded', n === cur ? 'true' : 'false'); });
      var it = items[cur];
      qEl.textContent = it.dataset.q; aEl.textContent = it.dataset.a;
      cEl.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0');
      ans.style.animation = 'none'; void ans.offsetWidth; ans.style.animation = '';
    };
    items.forEach(function (it, n) { it.querySelector('.faq__q').addEventListener('click', function () { setFaq(n); }); });
    $('.faq__prev').addEventListener('click', function () { setFaq(cur - 1); });
    $('.faq__next').addEventListener('click', function () { setFaq(cur + 1); });
    setFaq(0);
  }

  /* ---------- chain tiles: supply via rpc, only when ca is stated ---------- */
  var caRec = REG.ca, chain = REG.chain;
  if (caRec && caRec.state === 'stated' && caRec.value && chain && chain.state === 'stated' && chain.rpc) {
    var sv = $('[data-supply]');
    if (sv) {
      fetch(chain.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [caRec.value] }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { var v = j.result && j.result.value; if (v) sv.textContent = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v.uiAmount); else sv.textContent = '—'; })
        .catch(function () { sv.textContent = '—'; });
    }
  }

  /* ---------- live market ---------- */
  var mk = REG.market;
  if (mk && mk.state === 'stated' && mk.provider === 'gecko' && mk.feedUrl) initMarket(mk);
  else {
    $$('.brow[data-row]').forEach(function (row) {
      row.classList.remove('is-sk');
      $$('.dx', row).forEach(function (d) { d.textContent = '—'; });
      $('.cell-tok', row).innerHTML = '<span class="tile tile--lg">—</span><div><b>—</b></div>';
    });
    var tr = $('.ticker__track');
    if (tr) { tr.classList.remove('is-sk'); tr.innerHTML = '<span class="tk">—</span>'; }
  }

  function initMarket(src) {
    var rows = $$('.brow[data-row]');
    var track = $('.ticker__track');
    var pill = $('.pill[data-status]'), pillTxt = $('.pill [data-status-text]');
    var good = null, failCount = 0, timer = null, inflight = false, firstPaint = true;
    var prev = {};
    var nfC = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 });

    function fmtPrice(p) {
      if (!isFinite(p)) return '—';
      if (p >= 1000) return '$' + p.toLocaleString('en', { maximumFractionDigits: 0 });
      if (p >= 1) return '$' + p.toFixed(2);
      if (p === 0) return '$0';
      var dec = Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(p))));
      return '$' + p.toFixed(dec);
    }
    function fmtChg(c) { return isFinite(c) ? (c > 0 ? '+' : '') + c.toFixed(2) + '%' : '—'; }
    function fmtUsd(n) { return isFinite(n) ? '$' + nfC.format(n) : '—'; }

    function getJSON(url) {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 12000);
      return fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } }).then(function (r) {
        clearTimeout(t); if (!r.ok) throw new Error('http'); return r.json();
      }, function (e) { clearTimeout(t); throw e; });
    }

    function pullGecko() {
      return getJSON(src.feedUrl + (src.feedUrl.indexOf('?') < 0 ? '?' : '&') + 'include=base_token').then(function (j) {
        var toks = {};
        ((j && j.included) || []).forEach(function (i) { if (i.type === 'token') toks[i.id] = i.attributes || {}; });
        var best = {};
        ((j && j.data) || []).forEach(function (p) {
          var a = p.attributes || {}, rel = p.relationships && p.relationships.base_token && p.relationships.base_token.data;
          var tk = rel && toks[rel.id] || {}, addr = tk.address || (rel && rel.id) || p.id;
          var vol = a.volume_usd && +a.volume_usd.h24 || 0;
          if (!best[addr] || vol > best[addr].vol) {
            var img = tk.image_url && /^https:/.test(tk.image_url) ? tk.image_url : '';
            best[addr] = {
              addr: addr, symbol: tk.symbol || String(a.name || '?').split(' / ')[0], name: tk.name || a.name || '', img: img,
              price: parseFloat(a.base_token_price_usd), chg: a.price_change_percentage && +a.price_change_percentage.h24,
              vol: vol, liq: +a.reserve_in_usd
            };
          }
        });
        var out = Object.keys(best).map(function (k) { return best[k]; }).sort(function (x, y) { return (y.vol || 0) - (x.vol || 0); }).slice(0, 9);
        if (!out.length) throw new Error('empty');
        return out;
      });
    }

    function pull() { return pullGecko(); }

    function setStatus(kind, text) {
      pill.classList.toggle('is-err', kind === 'err'); pill.classList.toggle('is-stale', kind === 'stale');
      pillTxt.textContent = text;
    }

    function tile(t, big) {
      var s = doc.createElement('span'); s.className = 'tile' + (big ? ' tile--lg' : '');
      s.textContent = (t.symbol || '?').trim().charAt(0).toUpperCase() || '?';
      if (t.img) {
        var im = doc.createElement('img'); im.alt = ''; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
        im.addEventListener('load', function () { im.classList.add('ok'); });
        im.addEventListener('error', function () { im.remove(); });
        s.appendChild(im);       // attach first, then set src
        im.src = t.img;
      }
      return s;
    }

    function countTo(el, from, to, fmt, dur) {
      if (reduced || !isFinite(from) || !isFinite(to) || from === to) { el.textContent = fmt(to); return; }
      var t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
      })(t0);
    }
    function flash(el, dir) {
      if (reduced || !dir) return;
      el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth;
      el.classList.add(dir > 0 ? 'flash-up' : 'flash-dn');
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove('flash-up', 'flash-dn'); }); });
    }

    function paintRow(row, t, k) {
      var wasSk = row.classList.contains('is-sk');
      var old = prev[t.addr] || {};
      row.dataset.addr = t.addr;
      var tok = $('.cell-tok', row);
      if (wasSk || row.dataset.sym !== t.symbol) {
        tok.innerHTML = '';
        tok.appendChild(tile(t, true));
        var d = doc.createElement('div');
        var b = doc.createElement('b'); b.textContent = t.symbol;
        var sm = doc.createElement('small'); sm.textContent = t.name;
        d.appendChild(b); d.appendChild(sm); tok.appendChild(d);
        row.dataset.sym = t.symbol;
      }
      var cells = { px: $('.c-price .dx', row), ch: $('.c-chg .dx', row), vo: $('.c-vol .dx', row), li: $('.c-liq .dx', row) };
      var from = wasSk ? 0 : old;
      function upd(key, el, val, fmt, base) {
        var f = wasSk ? 0 : base;
        var dir = wasSk ? 0 : (isFinite(val) && isFinite(base) ? Math.sign(val - base) : 0);
        countTo(el, f, val, fmt, 700); flash(el, dir);
      }
      upd('px', cells.px, t.price, fmtPrice, old.price);
      upd('ch', cells.ch, t.chg, fmtChg, old.chg);
      upd('vo', cells.vo, t.vol, fmtUsd, old.vol);
      upd('li', cells.li, t.liq, fmtUsd, old.liq);
      var chgCell = $('.c-chg', row), chgEl = cells.ch;
      chgEl.classList.remove('up', 'dn');
      if (isFinite(t.chg)) chgEl.classList.add(t.chg >= 0 ? 'up' : 'dn');
      var meta = $('.meta', row);
      if (meta) meta.innerHTML = '<span>24h&nbsp;<b class="' + (t.chg >= 0 ? 'chg up' : 'chg dn') + '">' + fmtChg(t.chg) + '</b></span><span>Vol&nbsp;' + fmtUsd(t.vol) + '</span><span>Liq&nbsp;' + fmtUsd(t.liq) + '</span>';
      var cp = $('.cp', row); cp.disabled = false; cp.setAttribute('aria-label', 'Copy address of ' + t.symbol);
      if (wasSk) { row.classList.remove('is-sk'); row.style.setProperty('--k', k); row.classList.add('fill'); }
    }

    function paintTicker(list) {
      var html = '';
      list.forEach(function (t) {
        html += '<span class="tk"><b>' + esc(t.symbol) + '</b><span>' + fmtPrice(t.price) + '</span><span class="chg ' + (t.chg >= 0 ? 'up' : 'dn') + '">' + fmtChg(t.chg) + '</span></span>';
      });
      track.classList.remove('is-sk');
      track.innerHTML = html + html;
      $$('.tk', track).forEach(function (el, i) {
        var t = list[i % list.length];
        el.insertBefore(tile(t, false), el.firstChild);
      });
      track.style.setProperty('--dur', Math.max(30, list.length * 6) + 's');
    }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function render(list) {
      rows.forEach(function (row, i) {
        var t = list[i];
        if (t) paintRow(row, t, i); else row.hidden = true;
      });
      paintTicker(list);
      list.forEach(function (t) { prev[t.addr] = { price: t.price, chg: t.chg, vol: t.vol, liq: t.liq }; });
      firstPaint = false;
    }

    function showDash() {
      rows.forEach(function (row) {
        if (!row.classList.contains('is-sk')) return;
        row.classList.remove('is-sk');
        $$('.dx', row).forEach(function (d) { d.textContent = '—'; });
        var tk = $('.cell-tok', row); tk.innerHTML = '<span class="tile tile--lg">—</span><div><b>—</b></div>';
        var cp = $('.cp', row); cp.disabled = true;
      });
      track.classList.remove('is-sk'); track.innerHTML = '<span class="tk">—</span>';
    }

    function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
    function tick() {
      if (doc.hidden || inflight) return;
      inflight = true;
      pull().then(function (list) {
        good = list; failCount = 0; render(list); setStatus('ok', 'Live');
        schedule(60000);
      }).catch(function () {
        failCount++;
        if (good) setStatus('stale', 'Holding last good data, retrying');
        else { showDash(); setStatus('err', 'Feed unreachable, retrying'); }
        schedule(Math.min(60000, 2000 * Math.pow(2, failCount - 1)) * (0.85 + Math.random() * 0.3));
      }).then(function () { inflight = false; });
    }
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) clearTimeout(timer); else tick();
    });

    // copy-per-address
    $('.board').addEventListener('click', function (e) {
      var b = e.target.closest('.cp'); if (!b || b.disabled) return;
      var a = b.closest('.brow').dataset.addr; if (!a) return;
      copyText(a).then(function () {
        b.classList.add('is-done'); var live = $('#live'); if (live) live.textContent = 'Copied';
        setTimeout(function () { b.classList.remove('is-done'); if (live) live.textContent = ''; }, 1300);
      });
    });

    if (!doc.hidden) tick();
  }

  setupReveal();
})();
