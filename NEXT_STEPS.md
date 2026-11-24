# 次に必要な作業一覧（Kotaeai）

最終更新: 2026-11-24  
アプリ名: **Kotaeai**（ストア掲載・説明文用表記: **Kotaeai（コタエアイ）**）  
Android パッケージ名: `com.garanapop.coupleswipeapp`  
Google Play Console: https://play.google.com/console/u/1/developers/6018247349959212303/home

[couple-swipe-development-plan.md](./couple-swipe-development-plan.md) に基づく全フェーズ（フェーズ1〜8）および追加機能・UX改善・ストア／課金準備の進捗と、本人確認通過後のリリース手順をまとめています。

---

## 1. 完了済みの基盤・全フェーズ実装・ストア／課金準備

### 初期構築・フェーズ1〜7 ✅ 完了
1. **Supabase プロジェクト構築・匿名認証・DB／RLS／RPC 適用**（`couple-swipe-app` / `zfnbyxntyxgmoebvvifu` / 東京リージョン）
2. **同梱質問 120問 ＋ 追加質問の低 Egress 差分同期**（[src/constants/questions.ts](./src/constants/questions.ts)・`public.extra_questions`・`get_extra_questions_since`）
3. **非アクティブペア（180日）自動削除（`pg_cron`）・keepalive・暗号化週次バックアップワークフロー整備**（[docs/OPERATIONS.md](./docs/OPERATIONS.md)）
4. **毎日のローカル通知リマインダー・パートナー回答プッシュ通知（`notify-partner-answered` v3・FCM V1 鍵 EAS 登録済み）・Google アカウント引き継ぎ UI**

### フェーズ8: 課金・AI診断・回答カレンダー・法的ページ・EAS ビルド ✅ 完了
- [x] **課金基盤 ＆ Webhook 疎通確認済み**
  - `revenuecat-webhook` v3（`REVENUECAT_WEBHOOK_AUTH_KEY` 登録済み・RevenueCat テスト送信 **`200 OK` 確認済み**）
  - `sync-subscription` v1（購入・復元直後の即時同期）
  - アプリ側（[src/lib/billing.ts](./src/lib/billing.ts)・[src/app/ai-report.tsx](./src/app/ai-report.tsx)）で即時同期＋リトライ、契約状況サマリー、復元未契約ハンドリング、動的価格表示に対応
- [x] **実 Gemini API AI 相性診断 ＆ 優しい別れ振り返り診断（`generate-ai-report` v10 本番稼働・E2E 検証済み）**
  - `GEMINI_API_KEY` 登録・`gemini-flash-lite-latest`（404/503 フェイルオーバー）・1ペア1日3回上限・回答リズム集計サマリー反映
  - すれ違い・別れの原因 AI 振り返り診断（`mode: 'breakup_reflection'`・相手解除後の1人残存ペア対応・ペア解除モーダル導線＆AI画面最下部の控えめ導線）
- [x] **回答カレンダー ＆ 課金ペア向け過去日機能（本番 DB マイグレーション適用済み）**
  - 過去未回答日の相手回答閲覧・追っかけ回答＆ネタバレ防止（`20261123000002` / `20261123000003`）
  - **回答カレンダーモーダル（[src/components/AnswerCalendarModal.tsx](./src/components/AnswerCalendarModal.tsx)）・未回答日数 KPI・過去日オンデマンド出題（`get_pair_calendar_summary` / `get_or_create_past_daily_set`：`20261124000000_calendar_and_past_days.sql` 本番適用済み）**
- [x] **ストア素材・審査対応・法的ページ（すべて仕様検証＆公開済み）**
  - `expo-font`・`expo-splash-screen` 導入済み（`npx expo-doctor` 20/20・`expo lint` / `tsc --noEmit` エラー 0）
  - オリジナル **Kotaeai** アプリアイコン一式 ＆ ストア素材一式（[store-assets/google-play/app-icon-512x512.png](./store-assets/google-play/app-icon-512x512.png)・[feature-graphic-1024x500.png](./store-assets/google-play/feature-graphic-1024x500.png)・[screenshots/01-home.png 〜 06-ai-report.png](./store-assets/google-play/screenshots/)）すべて Google Play 仕様チェック通過
  - GitHub Pages 法的ページ 4 種（[index.html](https://garana-pop.github.io/couple-swipe-app/)・[privacy.html](https://garana-pop.github.io/couple-swipe-app/privacy.html)・[terms.html](https://garana-pop.github.io/couple-swipe-app/terms.html)・[account-deletion.html](https://garana-pop.github.io/couple-swipe-app/account-deletion.html)）すべて `200 OK` 公開確認済み
  - Google Play ストア提出・課金・データセーフティ完全ガイド（[docs/STORE_LISTING.md](./docs/STORE_LISTING.md)）
- [x] **Google Play Console デベロッパー登録（$25 支払済み・本人確認通過済み！）**
- [x] **カレンダー機能込みの初回提出用 Android 本番 AAB（`versionCode: 3`・`a556234`）EAS クラウドビルド実行済み**

---

## 2. 本人確認通過後の実行手順（順番どおりに進めるだけ）

コピペ用の文面・商品 ID・データセーフティ回答はすべて [docs/STORE_LISTING.md](./docs/STORE_LISTING.md) にまとめてあります。

### Step 1: Google Play Console でアプリ作成 ＆ 初回 AAB アップロード
1. [Google Play Console](https://play.google.com/console/u/1/developers/6018247349959212303/home) で **「アプリを作成」**
   - アプリ名: `Kotaeai（コタエアイ）` / デフォルト言語: 日本語 / アプリ / 無料
2. **「テスト ＞ 内部テスト」**（またはクローズドテスト）で新しいリリースを作成し、今回ビルドした **`versionCode: 3` の `.aab`** を初回アップロード（※これにより Play Console が `com.garanapop.coupleswipeapp` と Google Play Billing 権限を認識します）。
3. **「アプリの設定」**（プライバシーポリシー URL・アプリアクセス・広告「いいえ」・コンテンツレーティング・ターゲットユーザー・データセーフティ・ストア掲載情報＆グラフィック一式）を [docs/STORE_LISTING.md](./docs/STORE_LISTING.md) に沿って入力・保存。

### Step 2: 定期購入商品作成 ＆ RevenueCat 接続（課金本番化）
1. Play Console **「収益化 ＞ 商品 ＞ 定期購入」** で 2 商品を作成し、基本プランを有効化：
   - `couple_swipe_yearly`（基本プラン `yearly-base`・年額 **¥3,000**）
   - `couple_swipe_monthly`（基本プラン `monthly-base`・月額 **¥500**）
2. Google Cloud で Play Developer API 用サービスアカウントを作成し、Play Console「ユーザーと権限」で権限付与 → JSON 鍵を RevenueCat へ登録。
3. RevenueCat でアプリ（`com.garanapop.coupleswipeapp`）を追加し、商品をインポート → Entitlement `premium` ＆ Offering `default`（`$rc_annual` / `$rc_monthly`）を設定。
4. RevenueCat の **API Keys** から取得したキーを登録：
   - **Secret API Key (V1)**（`sk_...`）→ Supabase Secrets の `REVENUECAT_SECRET_API_KEY` へ登録
   - **Google Public API Key**（`goog_...`）→ チャットで共有いただければ、こちらで `npx eas-cli@latest env:create` 登録 ＋ **課金有効化済みの本番 AAB（`versionCode: 4`）** を即ビルドします！

### Step 3: ライセンステスト課金検証 ＆ 14日間クローズドテスト → 本番公開
1. Play Console **「設定 ＞ ライセンステスト」** に自分の Gmail を追加し、課金有効化済み AAB（`versionCode: 4`）を内部テスト／クローズドテストへアップロードしてテストカードで課金・即時解放・ペア共有・復元を確認。
2. **クローズドテスト**へテスター **12名以上（余裕を見て 15〜20名）** を登録し、オプトイン状態を **14日間連続** で維持。
3. 14日間完了後、**「本番環境へのアクセスを申請」** → 承認で Google Play 公開！

### （任意・並行OK）運用強化設定
- [ ] **Google アカウント連携（機種変更引き継ぎ）を有効化する場合**：Supabase Auth の Manual Linking・Redirect URLs（`account-deletion.html` 含む）・Google Provider を設定（[docs/PHASE7_SETUP.md](./docs/PHASE7_SETUP.md)）
- [ ] **GitHub Secrets 登録（まだの場合）**：`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`（keepalive 用）、`SUPABASE_DB_URL` / `BACKUP_PASSPHRASE`（週次バックアップ用）
