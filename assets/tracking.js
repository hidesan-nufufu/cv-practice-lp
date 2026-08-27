/* =============================================================================
 * tracking.js  ―― 計測の心臓部
 * =============================================================================
 *
 *  【このファイルは広告計測のどの部分？】
 *
 *      Google広告 / Meta広告
 *              ↓ クリック（?utm_source=... 付きでLPに着地）
 *             LP        ← ★ このファイルはここ
 *              ↓  dataLayer.push()  で「今こういうことが起きた」と通知
 *             GTM
 *          ↙       ↘
 *        GA4        広告媒体タグ
 *
 *  重要な考え方：
 *    LP は「何が起きたか」を dataLayer に置くだけ。
 *    「そのイベントを GA4 に送るか / Meta に送るか / Google広告に送るか」は GTM が決める。
 *    こうしておくと、計測先を増やすときに LP のコードを触らなくて済みます。
 *    （＝タグマネージャを使う最大の理由）
 *
 *  このファイルが必ず最初に読み込まれる理由：
 *    GTM のスニペットより先に dataLayer を作っておかないと、
 *    最初に push した情報を GTM が取りこぼすことがあるためです。
 * ============================================================================= */

(function () {
  'use strict';

  var CFG = window.MEASUREMENT_CONFIG || {};

  /* ===========================================================================
   * 1. dataLayer を用意する
   * ---------------------------------------------------------------------------
   *  dataLayer は「LP と GTM の間にある伝言板」です。ただの配列です。
   *  LP が push すると、GTM がそれを読んで対応するタグを発火します。
   * ========================================================================= */
  window.dataLayer = window.dataLayer || [];

  /* ===========================================================================
   * 2. デバッグ用に push を覗き見できるようにする（練習用の仕掛け）
   * ---------------------------------------------------------------------------
   *  本番のサイトには不要です。ここでは「何が push されたか」を
   *  画面右下のパネルにリアルタイム表示するために push をラップしています。
   *  ※ GTM 読み込み前にラップしておくのがポイント。
   * ========================================================================= */
  window.__mtLog = [];                 // push されたイベントの記録
  window.__mtListeners = [];           // デバッグパネルが登録するコールバック

  (function wrapPush() {
    var dl = window.dataLayer;
    var originalPush = dl.push;
    dl.push = function () {
      var result = originalPush.apply(dl, arguments);
      try {
        for (var i = 0; i < arguments.length; i++) {
          var payload = arguments[i];
          if (!payload || typeof payload !== 'object') continue;
          var record = {
            time: new Date(),
            event: payload.event || '(データのみ)',
            data: payload
          };
          window.__mtLog.push(record);
          window.__mtListeners.forEach(function (fn) {
            try { fn(record); } catch (e) { /* デバッグパネルの都合で本体は止めない */ }
          });
        }
      } catch (e) { /* 計測の失敗でLPを壊さない */ }
      return result;
    };
  })();

  /* ===========================================================================
   * 3. UTM パラメータを読み取る
   * ---------------------------------------------------------------------------
   *  UTM = 広告からの流入に付ける「どこから来たか」のタグ。
   *    utm_source   … 媒体名        例: google / facebook
   *    utm_medium   … 流入の種類    例: cpc / paid_social
   *    utm_campaign … キャンペーン名 例: test_campaign
   *    utm_content  … クリエイティブ違いの識別
   *    utm_term     … キーワード（検索広告）
   *
   *  ★ GA4 は URL の UTM を自動で読み取ります。ここで手動で取っているのは
   *    「イベント単位でも媒体を持たせて、GTM から確認しやすくするため」の学習用です。
   *
   *  さらに、広告クリックIDも一緒に見ておきます。
   *    gclid / gbraid / wbraid … Google広告のクリックID
   *    fbclid                  … Meta広告のクリックID
   *  これがあると「広告経由の着地」だと確実に分かります。
   * ========================================================================= */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'yclid'];

  function readQuery() {
    var out = {};
    try {
      var params = new URLSearchParams(window.location.search);
      params.forEach(function (v, k) { out[k] = v; });
    } catch (e) { /* 古いブラウザ対策。練習環境では起きません */ }
    return out;
  }

  function pickUtm() {
    var q = readQuery();
    var utm = {};
    UTM_KEYS.forEach(function (k) { if (q[k]) utm[k] = q[k]; });
    CLICK_ID_KEYS.forEach(function (k) { if (q[k]) utm[k] = q[k]; });
    return utm;
  }

  /* ---------------------------------------------------------------------------
   *  UTM をセッション中ずっと覚えておく
   *  → 広告で着地したあと、UTM の付いていないサンクスページに移動しても
   *     「この人は Google広告から来た」と分かるようにするため。
   *     （GA4 自身もセッション単位で流入元を保持しています。同じ考え方です）
   * ------------------------------------------------------------------------- */
  var STORE_KEY = 'mt_first_touch';

  function rememberUtm() {
    var current = pickUtm();
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
    if (Object.keys(current).length > 0) {
      // 新しく UTM 付きで着地した → 上書き（＝流入元が変わった）
      stored = { utm: current, landing_page: window.location.href, ts: Date.now() };
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify(stored)); } catch (e) {}
    }
    return stored || { utm: {}, landing_page: window.location.href, ts: Date.now() };
  }

  var firstTouch = rememberUtm();

  /* ===========================================================================
   * 4. すべてのイベントに共通で付けるパラメータ
   * ---------------------------------------------------------------------------
   *  GA4 のレポートで「どのページの、どこから来た人の行動か」を切り分けるために使います。
   * ========================================================================= */
  function commonParams() {
    var p = {
      page_location: window.location.href,       // 今いるページのURL（UTM込み）
      page_path: window.location.pathname,       // /index.html などパス部分だけ
      page_title: document.title,
      page_referrer: document.referrer || '(direct)', // どこから来たか
      landing_page: firstTouch.landing_page       // 最初に着地したページ
    };
    // 記憶しておいた UTM を展開して付与
    Object.keys(firstTouch.utm).forEach(function (k) { p[k] = firstTouch.utm[k]; });
    // UTM が1つも無い＝広告以外からの流入
    p.traffic_type = Object.keys(firstTouch.utm).length ? 'ad' : 'organic_or_direct';
    return p;
  }

  /* ===========================================================================
   * 5. イベントを送る共通関数  ―― ここが一番大事
   * ---------------------------------------------------------------------------
   *  使い方:  MT.push('cta_click', { cta_position: 'hero' });
   *
   *  実際に走るのは、あなたが読んだこの形です：
   *
   *      window.dataLayer.push({
   *        event: 'generate_lead',
   *        form_name: 'free_consultation'
   *      });
   *
   *  第3引数 options:
   *    onDone   … タグの発火が終わってから実行したい処理（ページ遷移など）
   *    timeout  … onDone を待つ最大ミリ秒（既定 2000）
   *
   *  ★ なぜ onDone が必要か（実務で必ずハマるポイント）
   *    push した直後に location.href でページを移動すると、
   *    GTM がタグを撃ち終わる前にページが消えてコンバージョンが欠測します。
   *    GTM は eventCallback という仕組みで「撃ち終わった」を教えてくれるので、
   *    それを待ってから遷移します。
   * ========================================================================= */
  function pushEvent(eventName, params, options) {
    options = options || {};
    var payload = { event: eventName };

    var common = commonParams();
    Object.keys(common).forEach(function (k) { payload[k] = common[k]; });
    if (params) Object.keys(params).forEach(function (k) { payload[k] = params[k]; });

    if (typeof options.onDone === 'function') {
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        options.onDone();
      };
      payload.eventCallback = finish;                    // GTM がタグ発火後に呼ぶ
      payload.eventTimeout = options.timeout || 2000;    // GTM 側の待ち上限
      // GTM が無い / 読み込み失敗のときの保険
      setTimeout(finish, (options.timeout || 2000) + 100);
    }

    window.dataLayer.push(payload);
    return payload;
  }

  /* ===========================================================================
   * 6. GTM スニペットの読み込み（MODE: 'gtm'）
   * ---------------------------------------------------------------------------
   *  本来は HTML に直接貼るコードですが、この練習環境では config.js の
   *  GTM_ID を書き換えるだけで済むように JS から挿入しています。
   *  （公式スニペットと動作は同じです）
   * ========================================================================= */
  function loadGTM(gtmId) {
    if (!/^GTM-[A-Z0-9]+$/.test(gtmId)) {
      console.warn('[計測] GTM_ID が未設定です。config.js の GTM_ID を書き換えてください:', gtmId);
      return false;
    }
    // gtm.js が読む「開始の合図」。公式スニペットと同じ内容です。
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(gtmId);
    document.head.appendChild(s);

    // JavaScript が無効な環境用の noscript（形だけ再現）
    document.addEventListener('DOMContentLoaded', function () {
      var ns = document.createElement('noscript');
      ns.innerHTML = '<iframe src="https://www.googletagmanager.com/ns.html?id=' +
        encodeURIComponent(gtmId) +
        '" height="0" width="0" style="display:none;visibility:hidden"></iframe>';
      document.body.insertBefore(ns, document.body.firstChild);
    });
    return true;
  }

  /* ===========================================================================
   * 7. GTM を使わない直接計測（MODE: 'direct'）＝比較用
   * ---------------------------------------------------------------------------
   *  GTM を挟まず、LP から直接 GA4 と Meta Pixel を読み込みます。
   *  タグを増やすたびに LP を修正することになる、という不便さを体験する用です。
   * ========================================================================= */
  function loadGA4Direct(measurementId) {
    if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
      console.warn('[計測] GA4_MEASUREMENT_ID が未設定です:', measurementId);
      return false;
    }
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(s);

    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    var cfg = { send_page_view: true };
    if (CFG.FORCE_GA4_DEBUG_MODE) cfg.debug_mode = true;   // GA4 DebugView に出るようになる
    window.gtag('config', measurementId, cfg);
    return true;
  }

  function loadMetaPixelDirect(pixelId) {
    if (!/^\d{10,20}$/.test(pixelId)) {
      console.warn('[計測] META_PIXEL_ID が未設定です:', pixelId);
      return false;
    }
    /* Meta 公式のベースコード（読みやすく整形したもの） */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
    return true;
  }

  /* ===========================================================================
   * 8. 起動
   * ========================================================================= */
  var mode = CFG.MODE || 'off';
  var loaded = { gtm: false, ga4: false, meta: false };

  if (mode === 'gtm') {
    loaded.gtm = loadGTM(CFG.GTM_ID);
  } else if (mode === 'direct') {
    loaded.ga4 = loadGA4Direct(CFG.GA4_MEASUREMENT_ID);
    loaded.meta = loadMetaPixelDirect(CFG.META_PIXEL_ID);
  }

  /* ---------------------------------------------------------------------------
   *  ページ情報を dataLayer に置く
   *
   *  ★ page_view について（よくある勘違い）
   *    GA4 の page_view は、GTM の「Google タグ」が All Pages で発火した時点で
   *    自動的に送られます。自分で page_view を push する必要は普通ありません。
   *    ここで push しているのは 'page_meta_ready' という別名のイベントで、
   *    「このページの情報（UTM等）を GTM に渡すため」のものです。
   *    同名で二重に page_view を送ると、GA4 のセッション数やPV数が狂います。
   * ------------------------------------------------------------------------- */
  pushEvent('page_meta_ready', {
    measurement_mode: mode,
    page_type: document.body ? (document.body.getAttribute('data-page-type') || 'unknown')
                             : (window.__PAGE_TYPE__ || 'unknown')
  });

  /* ===========================================================================
   * 9. 外に公開する API
   * ========================================================================= */
  window.MT = {
    push: pushEvent,
    utm: function () { return firstTouch.utm; },
    common: commonParams,
    mode: mode,
    loaded: loaded,
    config: CFG,
    log: function () { return window.__mtLog; },
    /** デバッグパネル用: push を購読する */
    onPush: function (fn) { window.__mtListeners.push(fn); }
  };
})();
