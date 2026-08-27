# 美容サロン 無料カウンセリングLP（広告CV計測 練習用）

Web広告のコンバージョン計測（GTM / GA4 / Google広告 / Meta Pixel）を練習するための**架空**のランディングページです。
実在のサロンではありません。フォームの入力内容はどこにも送信されません。

- `assets/config.js` … 計測モードと各種IDの設定
- `assets/tracking.js` … dataLayer の生成、UTM取得、GTM読み込み
- `assets/app.js` … CTAクリック / フォーム入力開始 / 送信完了 のイベント発火
- `assets/debug-panel.js` … 右下の計測デバッグパネル（練習用）

## 計測イベント
| event | タイミング |
|---|---|
| `cta_click` | CTAボタンのクリック |
| `form_start` | フォーム入力開始（1回のみ） |
| `generate_lead` | フォーム送信完了（最終CV） |
