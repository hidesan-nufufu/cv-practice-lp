/* =============================================================================
 * debug-panel.js  ―― 画面右下の「計測デバッグパネル」（練習専用）
 * =============================================================================
 *
 *  本番サイトには入れません。config.js の DEBUG_PANEL: false で消えます。
 *
 *  何が見えるか:
 *   1) dataLayer に push されたイベントのライブログ
 *      → GTM のプレビューを開かなくても「イベントが起きたか」が分かります。
 *   2) 実際に外部へ飛んだ計測リクエスト（＝タグが本当に発火したか）
 *      GA4     : /g/collect
 *      Meta    : facebook.com/tr
 *      Google広告: googleads.g.doubleclick.net など
 *      → 「dataLayerには出ているのに外に飛んでいない」= GTMの設定ミス、と切り分けできます。
 *   3) 現在のUTMパラメータ
 * ============================================================================= */

(function () {
  'use strict';
  var CFG = window.MEASUREMENT_CONFIG || {};
  if (!CFG.DEBUG_PANEL) return;

  var EVENT_COLORS = {
    generate_lead: '#c2185b',
    cta_click: '#0b7285',
    form_start: '#7048e8',
    form_error: '#e8590c',
    page_view: '#2b8a3e',
    page_meta_ready: '#868e96',
    scroll_depth: '#868e96'
  };

  /* --- 外部への計測リクエストを見分けるルール ------------------------------ */
  var BEACON_RULES = [
    { test: /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect|\/g\/collect/, name: 'GA4', color: '#2b8a3e' },
    { test: /googletagmanager\.com\/gtm\.js/, name: 'GTM読込', color: '#1c7ed6' },
    { test: /googletagmanager\.com\/gtag\/js/, name: 'Googleタグ読込', color: '#1c7ed6' },
    { test: /connect\.facebook\.net/, name: 'Pixel読込', color: '#1877f2' },
    { test: /facebook\.com\/tr/, name: 'Meta Pixel', color: '#1877f2' },
    { test: /googleads\.g\.doubleclick\.net|google\.com\/pagead|googleadservices\.com\/pagead/, name: 'Google広告CV', color: '#e8590c' }
  ];

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style') e.setAttribute('style', attrs[k]);
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    if (text != null) e.textContent = text;
    return e;
  }

  function time(d) {
    var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
  }

  function build() {
    var panel = el('div', { id: 'mt-panel', class: 'mt-panel' });

    /* ヘッダー */
    var head = el('div', { class: 'mt-panel__head' });
    head.appendChild(el('span', { class: 'mt-panel__dot' }));
    head.appendChild(el('strong', null, '計測デバッグパネル'));
    var modeBadge = el('span', { class: 'mt-panel__mode' }, 'MODE: ' + (window.MT ? window.MT.mode : '-'));
    head.appendChild(modeBadge);
    var toggle = el('button', { class: 'mt-panel__toggle', type: 'button', 'aria-label': '開閉' }, '−');
    head.appendChild(toggle);
    panel.appendChild(head);

    var body = el('div', { class: 'mt-panel__body' });

    /* 読み込み状態 */
    var status = el('div', { class: 'mt-panel__status' });
    body.appendChild(status);

    /* UTM */
    var utmBox = el('div', { class: 'mt-panel__utm' });
    body.appendChild(utmBox);

    /* タブ */
    var tabs = el('div', { class: 'mt-panel__tabs' });
    var tabDL = el('button', { class: 'mt-tab is-active', type: 'button', 'data-tab': 'dl' }, 'dataLayer');
    var tabNet = el('button', { class: 'mt-tab', type: 'button', 'data-tab': 'net' }, '送信リクエスト');
    tabs.appendChild(tabDL); tabs.appendChild(tabNet);
    body.appendChild(tabs);

    var listDL = el('div', { class: 'mt-panel__list', 'data-list': 'dl' });
    var listNet = el('div', { class: 'mt-panel__list', 'data-list': 'net', hidden: 'hidden' });
    body.appendChild(listDL);
    body.appendChild(listNet);

    /* フッター操作 */
    var foot = el('div', { class: 'mt-panel__foot' });
    var clearBtn = el('button', { class: 'mt-btn', type: 'button' }, 'ログを消す');
    var dumpBtn = el('button', { class: 'mt-btn', type: 'button' }, 'コンソールに出力');
    foot.appendChild(clearBtn); foot.appendChild(dumpBtn);
    body.appendChild(foot);

    panel.appendChild(body);
    document.body.appendChild(panel);

    /* --- 動作 --------------------------------------------------------------- */
    toggle.addEventListener('click', function () {
      var collapsed = panel.classList.toggle('is-collapsed');
      toggle.textContent = collapsed ? '+' : '−';
    });
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.mt-tab');
      if (!b) return;
      Array.prototype.forEach.call(tabs.querySelectorAll('.mt-tab'), function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
      var t = b.getAttribute('data-tab');
      listDL.hidden = (t !== 'dl');
      listNet.hidden = (t !== 'net');
    });
    clearBtn.addEventListener('click', function () { listDL.innerHTML = ''; listNet.innerHTML = ''; });
    dumpBtn.addEventListener('click', function () {
      /* eslint-disable no-console */
      console.log('%c=== dataLayer 全件 ===', 'font-weight:bold');
      console.log(window.dataLayer);
      console.table((window.__mtLog || []).map(function (r) {
        return { 時刻: time(r.time), イベント: r.event };
      }));
    });

    /* --- 状態表示 ----------------------------------------------------------- */
    function refreshStatus() {
      status.innerHTML = '';
      var rows = [
        ['GTM', !!(window.google_tag_manager), CFG.GTM_ID],
        ['GA4 (gtag)', typeof window.gtag === 'function', CFG.GA4_MEASUREMENT_ID],
        ['Meta Pixel (fbq)', typeof window.fbq === 'function', CFG.META_PIXEL_ID]
      ];
      rows.forEach(function (r) {
        var line = el('div', { class: 'mt-status' });
        line.appendChild(el('span', { class: 'mt-status__pill ' + (r[1] ? 'is-on' : 'is-off') }, r[1] ? '読込済' : '未読込'));
        line.appendChild(el('span', { class: 'mt-status__name' }, r[0]));
        line.appendChild(el('code', { class: 'mt-status__id' }, String(r[2] || '')));
        status.appendChild(line);
      });
    }
    refreshStatus();
    setInterval(refreshStatus, 1500);

    /* --- UTM 表示 ------------------------------------------------------------ */
    var utm = (window.MT && window.MT.utm()) || {};
    var keys = Object.keys(utm);
    utmBox.appendChild(el('div', { class: 'mt-panel__label' }, 'このセッションの流入元（UTM / クリックID）'));
    if (!keys.length) {
      utmBox.appendChild(el('div', { class: 'mt-utm mt-utm--empty' }, 'なし（直接アクセス扱い）'));
    } else {
      keys.forEach(function (k) {
        var row = el('div', { class: 'mt-utm' });
        row.appendChild(el('span', { class: 'mt-utm__k' }, k));
        row.appendChild(el('span', { class: 'mt-utm__v' }, utm[k]));
        utmBox.appendChild(row);
      });
    }

    /* --- dataLayer ログ ------------------------------------------------------ */
    function renderPush(rec) {
      var color = EVENT_COLORS[rec.event] || '#495057';
      var item = el('div', { class: 'mt-item' });
      var top = el('div', { class: 'mt-item__top' });
      top.appendChild(el('span', { class: 'mt-item__time' }, time(rec.time)));
      top.appendChild(el('span', { class: 'mt-item__name', style: 'background:' + color }, rec.event));
      item.appendChild(top);

      var shown = {};
      Object.keys(rec.data).forEach(function (k) {
        if (k === 'event' || k === 'eventCallback' || k === 'eventTimeout') return;
        shown[k] = rec.data[k];
      });
      if (Object.keys(shown).length) {
        var pre = el('pre', { class: 'mt-item__json' }, JSON.stringify(shown, null, 2));
        item.appendChild(pre);
      }
      listDL.insertBefore(item, listDL.firstChild);
      while (listDL.childElementCount > 80) listDL.removeChild(listDL.lastChild);
    }

    (window.__mtLog || []).forEach(renderPush);
    if (window.MT) window.MT.onPush(renderPush);

    /* --- 送信リクエスト監視 --------------------------------------------------- */
    function renderBeacon(url, rule) {
      var item = el('div', { class: 'mt-item' });
      var top = el('div', { class: 'mt-item__top' });
      top.appendChild(el('span', { class: 'mt-item__time' }, time(new Date())));
      top.appendChild(el('span', { class: 'mt-item__name', style: 'background:' + rule.color }, rule.name));
      item.appendChild(top);

      // GA4 / Meta は URL のクエリにイベント名が入っているので抜き出して見せる
      var hint = '';
      try {
        var u = new URL(url, location.href);
        var en = u.searchParams.get('en');   // GA4 の event name
        var ev = u.searchParams.get('ev');   // Meta の event name
        if (en) hint = 'イベント: ' + en;
        if (ev) hint = 'イベント: ' + ev;
      } catch (e) {}
      if (hint) item.appendChild(el('div', { class: 'mt-item__hint' }, hint));
      item.appendChild(el('pre', { class: 'mt-item__json mt-item__url' }, url));

      listNet.insertBefore(item, listNet.firstChild);
      while (listNet.childElementCount > 80) listNet.removeChild(listNet.lastChild);

      // 未読バッジ
      if (listNet.hidden) tabNet.classList.add('has-new');
    }

    tabNet.addEventListener('click', function () { tabNet.classList.remove('has-new'); });

    function inspect(url) {
      if (!url) return;
      for (var i = 0; i < BEACON_RULES.length; i++) {
        if (BEACON_RULES[i].test.test(url)) { renderBeacon(url, BEACON_RULES[i]); return; }
      }
    }

    try {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) { inspect(e.name); });
      });
      po.observe({ type: 'resource', buffered: true });
    } catch (e) {
      console.warn('[計測パネル] リクエスト監視を開始できませんでした', e);
    }

    // fetch / sendBeacon 経由（GA4 は sendBeacon を使うことがあります）
    if (navigator.sendBeacon) {
      var origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        try { inspect(String(url)); } catch (e) {}
        return origBeacon(url, data);
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
