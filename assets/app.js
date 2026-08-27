/* =============================================================================
 * app.js  ―― LPの動きと、計測イベントの発火場所
 * =============================================================================
 *
 *  ここで発火するイベントは4つだけです。
 *
 *   ┌───────────────┬──────────────────────────┬────────────────────────────┐
 *   │ イベント名     │ いつ起きる                │ 広告計測での意味            │
 *   ├───────────────┼──────────────────────────┼────────────────────────────┤
 *   │ page_view     │ ページが開かれた          │ 母数（何人が着地したか）    │
 *   │ cta_click     │ CTAボタンが押された       │ 興味の強さ／どのCTAが効くか │
 *   │ form_start    │ フォームに入力し始めた    │ 途中離脱の把握              │
 *   │ generate_lead │ フォーム送信が完了した    │ ★最終CV（広告の成果）       │
 *   └───────────────┴──────────────────────────┴────────────────────────────┘
 *
 *   page_view だけは自分で push しません（GTMのGoogleタグが自動送信）。
 * ============================================================================= */

(function () {
  'use strict';

  var CFG = window.MEASUREMENT_CONFIG || {};
  var FORM_NAME = CFG.FORM_NAME || 'free_consultation';

  /* ===========================================================================
   * A. CTAクリック  →  cta_click
   * ---------------------------------------------------------------------------
   *  HTML側で <a data-cta="hero"> のように「どのCTAか」を書いておき、
   *  それをそのままイベントのパラメータにします。
   *
   *  ★ なぜ位置(cta_position)を送るのか
   *    「ファーストビューのボタンは押されるが、下のボタンは押されない」
   *    のような差が分かると、LPのどこを直せばCVが増えるか判断できます。
   *    広告の改善は「広告 → LP → フォーム」のどこが詰まっているかの特定作業です。
   * ========================================================================= */
  function bindCtaClicks() {
    var ctas = document.querySelectorAll('[data-cta]');
    Array.prototype.forEach.call(ctas, function (el) {
      el.addEventListener('click', function () {
        var position = el.getAttribute('data-cta') || 'unknown';
        var label = (el.getAttribute('data-cta-text') || el.textContent || '').trim().slice(0, 60);

        window.MT.push('cta_click', {
          cta_position: position,          // hero / header / mid / faq / sticky / form
          cta_text: label,                 // ボタンの文言
          cta_destination: el.getAttribute('href') || '',
          form_name: FORM_NAME
        });

        // ↓ Meta Pixel を direct モードで動かしている場合のカスタムイベント
        //    （GTMモードでは GTM のタグが同じことをします）
        if (window.MT.mode === 'direct' && typeof window.fbq === 'function') {
          window.fbq('trackCustom', 'CTA_Click', { cta_position: position });
        }
      });
    });
  }

  /* ===========================================================================
   * B. フォーム入力開始  →  form_start
   * ---------------------------------------------------------------------------
   *  最初の1回だけ送ります。毎回送るとGA4のイベント数が膨らみ、
   *  「何人が入力を始めたか」という本来知りたい数字が読めなくなります。
   * ========================================================================= */
  var formStarted = false;
  function bindFormStart(form) {
    var fields = form.querySelectorAll('input, textarea, select');
    Array.prototype.forEach.call(fields, function (f) {
      var handler = function () {
        if (formStarted) return;
        formStarted = true;
        window.MT.push('form_start', {
          form_name: FORM_NAME,
          form_id: form.id || '',
          first_field: f.name || f.id || ''    // どの項目から入力し始めたか
        });
      };
      f.addEventListener('focus', handler, { once: false });
      f.addEventListener('input', handler, { once: false });
    });
  }

  /* ===========================================================================
   * C. フォーム送信完了  →  generate_lead  ★これが最終CV
   * ---------------------------------------------------------------------------
   *  ポイント3つ:
   *
   *  1) 「送信ボタンを押した瞬間」ではなく「送信が成功した瞬間」に送る
   *     入力ミスで弾かれた分までCVに数えると、広告の成果が水増しされます。
   *
   *  2) lead_id を必ず付ける（＝重複排除キー）
   *     ユーザーが二重送信したり、サンクスページをリロードしたときに
   *     CVが2件に増えるのを防ぎます。GA4/Meta/Google広告すべてで使う考え方です。
   *
   *  3) value / currency を付ける
   *     「1CVの価値がいくらか」を媒体に教えると、
   *     広告の自動入札が"金額"を基準に最適化できるようになります。
   * ========================================================================= */
  function makeLeadId() {
    // 例: lead_1756300000000_x7f3k9
    return 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  var submitted = false;   // 二重送信ガード

  function bindFormSubmit(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();   // 練習環境なのでサーバー送信はしません

      // --- 入力チェック（ここを通らなければCVにしない） ---------------------
      var errors = validate(form);
      renderErrors(form, errors);
      if (Object.keys(errors).length > 0) {
        // 失敗も計測しておくと「どの項目で詰まるか」が分かります（任意）
        window.MT.push('form_error', {
          form_name: FORM_NAME,
          error_fields: Object.keys(errors).join(',')
        });
        var firstKey = Object.keys(errors)[0];
        var firstEl = form.querySelector('[name="' + firstKey + '"]');
        if (firstEl) firstEl.focus();
        return;
      }

      if (submitted) return;     // すでに送信済みなら何もしない
      submitted = true;

      var btn = form.querySelector('[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '送信中…'; }

      var leadId = makeLeadId();
      var menu = (form.querySelector('[name="menu"]') || {}).value || '(未選択)';

      // --- ★ここが最終コンバージョンの発火点 -------------------------------
      window.MT.push('generate_lead', {
        form_name: FORM_NAME,          // どのフォームか
        form_id: form.id || '',
        lead_id: leadId,               // 重複排除キー
        value: CFG.LEAD_VALUE || 0,    // 1件の想定価値
        currency: CFG.LEAD_CURRENCY || 'JPY',
        menu_interest: menu,           // 希望メニュー（分析用）
        method: 'inline'               // 完了の見せ方（inline / thanks_page）
      });

      // direct モードのときの Meta Pixel（GTMモードではGTMが撃ちます）
      if (window.MT.mode === 'direct' && typeof window.fbq === 'function') {
        window.fbq('track', 'Lead', {
          content_name: FORM_NAME,
          value: CFG.LEAD_VALUE || 0,
          currency: CFG.LEAD_CURRENCY || 'JPY'
        }, { eventID: leadId });   // eventID = 重複排除キー
      }

      // --- 画面を「送信完了」状態にする -------------------------------------
      try { sessionStorage.setItem('mt_last_lead_id', leadId); } catch (err) {}
      showComplete(form, leadId);
    });
  }

  function validate(form) {
    var errors = {};
    var name = (form.querySelector('[name="name"]') || {}).value || '';
    var email = (form.querySelector('[name="email"]') || {}).value || '';
    var agree = form.querySelector('[name="agree"]');

    if (!name.trim()) errors.name = 'お名前を入力してください';
    if (!email.trim()) {
      errors.email = 'メールアドレスを入力してください';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'メールアドレスの形式が正しくありません';
    }
    if (agree && !agree.checked) errors.agree = '個人情報の取り扱いに同意してください';
    return errors;
  }

  function renderErrors(form, errors) {
    Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (el) {
      el.textContent = '';
      el.hidden = true;
    });
    Array.prototype.forEach.call(form.querySelectorAll('.is-invalid'), function (el) {
      el.classList.remove('is-invalid');
    });
    Object.keys(errors).forEach(function (key) {
      var msgEl = form.querySelector('[data-error-for="' + key + '"]');
      var input = form.querySelector('[name="' + key + '"]');
      if (msgEl) { msgEl.textContent = errors[key]; msgEl.hidden = false; }
      if (input) input.classList.add('is-invalid');
    });
  }

  function showComplete(form, leadId) {
    var wrap = document.getElementById('form-area');
    var done = document.getElementById('form-complete');
    if (!wrap || !done) return;
    wrap.hidden = true;
    done.hidden = false;
    var idEl = document.getElementById('lead-id-view');
    if (idEl) idEl.textContent = leadId;

    // サンクスページ方式を試すリンクに lead_id を引き継ぐ
    var link = document.getElementById('go-thanks');
    if (link) {
      var q = new URLSearchParams(window.location.search);
      q.set('lead_id', leadId);
      q.set('form_name', FORM_NAME);
      link.setAttribute('href', 'thanks.html?' + q.toString());
    }
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ===========================================================================
   * D. スクロール深度（おまけ）
   * ---------------------------------------------------------------------------
   *  GA4 は 90% 到達で scroll イベントを自動収集しますが、
   *  「LPのどこで離脱しているか」を細かく見たいときは自分で送ります。
   * ========================================================================= */
  function bindScrollDepth() {
    var marks = [25, 50, 75, 100];
    var fired = {};
    var onScroll = function () {
      var h = document.documentElement;
      var total = h.scrollHeight - h.clientHeight;
      if (total <= 0) return;
      var pct = Math.round((h.scrollTop / total) * 100);
      marks.forEach(function (m) {
        if (pct >= m && !fired[m]) {
          fired[m] = true;
          window.MT.push('scroll_depth', { percent_scrolled: m });
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ===========================================================================
   * E. 起動
   * ========================================================================= */
  document.addEventListener('DOMContentLoaded', function () {
    bindCtaClicks();
    bindScrollDepth();

    var form = document.getElementById('lead-form');
    if (form) {
      bindFormStart(form);
      bindFormSubmit(form);
    }

    // 「もう一度試す」ボタン（練習用にフォームを初期状態へ戻す）
    var retry = document.getElementById('retry-form');
    if (retry) {
      retry.addEventListener('click', function () {
        submitted = false;
        formStarted = false;
        var f = document.getElementById('lead-form');
        if (f) f.reset();
        var btn = f && f.querySelector('[type="submit"]');
        if (btn) { btn.disabled = false; btn.textContent = '無料カウンセリングを予約する'; }
        document.getElementById('form-area').hidden = false;
        document.getElementById('form-complete').hidden = true;
        document.getElementById('form-area').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  });
})();
