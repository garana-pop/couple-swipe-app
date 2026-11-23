# 次に必要な作業一覧（Kotaeai）

最終更新: 2026-11-23  
アプリ名: **Kotaeai**（ストア掲載・説明文用表記: **Kotaeai（コタエアイ）**）  
Android パッケージ名: `com.garanapop.coupleswipeapp`

[couple-swipe-development-plan.md](./couple-swipe-development-plan.md) に基づく全フェーズ（フェーズ1〜8）および追加機能・UX改善・ストア／課金準備の進捗と、公開に向けた残タスクをまとめています。

---

## 1. 完了済みの基盤・全フェーズ実装・ストア／課金準備

### 初期構築・フェーズ1〜5 ✅ 完了
1. **Supabase プロジェクト構築・匿名認証・DB／RLS／RPC 適用**（`couple-swipe-app` / `zfnbyxntyxgmoebvvifu` / 東京リージョン）
2. **同梱質問 120問 ＋ 追加質問の低 Egress 差分同期**（[src/constants/questions.ts](./src/constants/questions.ts)・`public.extra_questions`・`get_extra_questions_since`）
3. **実機 Expo Go ＆ Android APK での2台ペア連携・スワイプ・ロック解除・履歴動作確認**

### フェーズ6: 運用・コスト対策 ✅ 完了
- [x] 非アクティブペア（180日）の自動削除（`pg_cron` `cleanup-inactive-pairs-weekly`）
- [x] DB 一時停止対策（[.github/workflows/supabase-keepalive.yml](./.github/workflows/supabase-keepalive.yml)）＆ 自動バックアップ（[.github/workflows/supabase-backup.yml](./.github/workflows/supabase-backup.yml)）・運用手順書（[docs/OPERATIONS.md](./docs/OPERATIONS.md)）

### フェーズ7: 通知・認証強化 ✅ 完了
- [x] 毎日の端末ローカル通知リマインダー（[src/lib/notifications.ts](./src/lib/notifications.ts)・[src/app/settings.tsx](./src/app/settings.tsx)）
- [x] パートナー回答完了時の Expo Push 通知（`notify-partner-answered` v3・過去日追っかけ回答の専用通知文言対応・FCM V1 認証鍵 EAS 登録済み）
- [x] 機種変更引き継ぎ用 Google アカウント連携（`linkIdentity` ＋復元ログイン UI）

### フェーズ8: 課金・AI診断・法的ページ・EAS ビルド ✅ 実装＆実動作検証完了
- [x] RevenueCat ＋ Google Play Billing ペア共有課金基盤（年額 ¥3,000・`月額比 50% OFF`／月額 ¥500・1人課金で2人共有）
- [x] **課金即時同期 ＆ Webhook 堅牢化（本番 Edge Function デプロイ済み）**
  - `revenuecat-webhook` v3（`TRANSFER` 復元移行・返金即時キャンセル・`SUBSCRIPTION_EXTENDED` 対応）
  - `sync-subscription` v1（購入直後・復元直後に RevenueCat REST API で即座に DB 同期し、Webhook 遅延による未解放状態を防止）
  - アプリ側（[src/lib/billing.ts](./src/lib/billing.ts)・[src/app/ai-report.tsx](./src/app/ai-report.tsx)）で即時同期＋リトライ、契約状況サマリー表示、復元時の未契約ハンドリング、動的価格表示に対応
- [x] **実 Gemini API AI 相性診断（`generate-ai-report` v9 本番稼働・E2E 検証済み）**
  - `GEMINI_API_KEY` 登録・実動作検証完了
  - `gemini-flash-lite-latest`（404/503 自動フェイルオーバー）＋ `thinkingBudget: 512` ＋ `maxOutputTokens: 2048` ＋ 1ペア1日3回上限のコスト安全策実装済み
  - 回答日時（時間帯5区分・当日／追っかけ割合・回答テンポ）の集計サマリーを診断へ反映（細かい時刻非言及・肯定表現ガード付き）
- [x] **課金ペア向け過去日機能（本番 DB マイグレーション＆E2E 検証済み）**
  - 過去未回答日の相手回答の閲覧＆AI診断反映（[20261123000002_premium_past_partner_answers.sql](./supabase/migrations/20261123000002_premium_past_partner_answers.sql)）
  - 過去未回答お題への追っかけ回答＆ネタバレ防止（回答完了で相手の答えと一致率を即公開：[20261123000003_premium_answer_past_days.sql](./supabase/migrations/20261123000003_premium_answer_past_days.sql)）
- [x] **UX・審査対応・ストア素材準備（完了）**
  - `expo-font`（必須ピア依存）・`expo-splash-screen` 導入済み（`npx expo-doctor` 全項目クリア）
  - オリジナル **Kotaeai** アプリアイコン一式差し替え済み（[assets/icon.png](./assets/icon.png)・Android Adaptive Icon 3層・[assets/splash-icon.png](./assets/splash-icon.png)・[assets/favicon.png](./assets/favicon.png)）
  - Google Play ストア提出用グラフィック生成済み（[store-assets/google-play/app-icon-512x512.png](./store-assets/google-play/app-icon-512x512.png)・[store-assets/google-play/feature-graphic-1024x500.png](./store-assets/google-play/feature-graphic-1024x500.png)）
  - Web 法的ページに **利用規約（[web-legal/terms.html](./web-legal/terms.html)）** を追加し、購入画面・設定画面・アカウント削除確認からリンク＆解約注意喚起を設置（`privacy.html`・`account-deletion.html` 公開確認済み、`main` へ push で `terms.html` も自動公開）
  - Google Play ストア提出・定期購入・データセーフティ回答シート作成済み（[docs/STORE_LISTING.md](./docs/STORE_LISTING.md)）
  - 当日回答時の通信エラー保護・連続回答ストリーク・カテゴリ別一致率グラフ・AI 診断アーカイブ・一致率シェアカード実装済み
- [x] EAS 環境変数登録（Supabase URL / Publishable Key）＆ Android プレビュー APK クラウドビルド成功

---

## 2. これから行う作業（外部コンソール設定・リリース公開）

詳細なコピペ用文面・定期購入 ID・データセーフティ回答シートは [docs/STORE_LISTING.md](./docs/STORE_LISTING.md)・[docs/RELEASE_GUIDE.md](./docs/RELEASE_GUIDE.md) を参照してください。

### A. GitHub へ push（`terms.html` の自動公開）＆ 最新 APK 再ビルド（任意・実機確認＆スクショ撮影用）
- [ ] 今回の変更（アイコン・課金同期強化・利用規約）を `main` ブランチへ push し、`https://garana-pop.github.io/couple-swipe-app/terms.html` の公開を確認する
- [ ] 実機での最終確認＆ストア用スクリーンショット（4〜6枚）撮影のため Android プレビュー APK を再ビルドする：
  ```bash
  npx eas-cli@latest build --platform android --profile preview
  ```

### B. Google Play 登録・初回 AAB アップロード・課金連携
1. [ ] **Google Play デベロッパー登録**（初回登録料 $25・本人確認）
2. [ ] **初回 本番 AAB ビルド ＆ クローズドテスト（または内部テスト）へアップロード**
   ```bash
   npx eas-cli@latest build --platform android --profile production
   ```
   ※ Google Play Console で定期購入を作成する前に、Billing 権限入りの AAB を1回アップロードしておく必要があります。
3. [ ] **Google Play Console 定期購入商品の作成**（[docs/STORE_LISTING.md](./docs/STORE_LISTING.md#3-google-play-console-定期購入--revenuecat-設定シート)）
   - `couple_swipe_yearly`（基本プラン `yearly-base`・年額 **¥3,000**）
   - `couple_swipe_monthly`（基本プラン `monthly-base`・月額 **¥500**）
4. [ ] **RevenueCat 連携＆秘密鍵登録**
   - RevenueCat にアプリ（`com.garanapop.coupleswipeapp`）と Entitlement `premium`／Offering `default`（`$rc_annual`・`$rc_monthly`）を設定
   - EAS 環境変数に `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` を登録し、本番 AAB を再ビルド
   - Supabase Secrets に `REVENUECAT_WEBHOOK_AUTH_KEY` および `REVENUECAT_SECRET_API_KEY` を登録し、Webhook（`revenuecat-webhook`）のテスト送信で **`200 OK`** を確認
   - Google Play ライセンステストアカウントで実機テスト購入→即時解放→パートナー共有→復元を確認

### C. 外部サービス設定（任意・運用強化）
- [ ] **Google アカウント連携（機種変更引き継ぎ）を有効化する場合**
  - Supabase Auth の Manual Linking・Redirect URLs（`account-deletion.html` 含む）・Google Provider を設定（[docs/PHASE7_SETUP.md](./docs/PHASE7_SETUP.md)）
- [ ] **GitHub Secrets 登録（まだの場合）**
  - `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`（keepalive 用）、`SUPABASE_DB_URL` / `BACKUP_PASSPHRASE`（週次バックアップ用）

### D. ストア掲載設定 ＆ 14日間クローズドテスト → 本番公開
- [ ] **ストア掲載情報・グラフィック登録**（[docs/STORE_LISTING.md](./docs/STORE_LISTING.md)）
  - ストア掲載名：`Kotaeai（コタエアイ）`・簡単な説明・詳しい説明を貼り付け
  - `store-assets/google-play/app-icon-512x512.png`・`feature-graphic-1024x500.png`・実機スクリーンショット（4〜6枚）をアップロード
- [ ] **データセーフティ＆プライバシー／退会 URL 登録**
  - プライバシーポリシー：`https://garana-pop.github.io/couple-swipe-app/privacy.html`
  - アカウント削除：`https://garana-pop.github.io/couple-swipe-app/account-deletion.html`
  - データセーフティ・コンテンツレーティング・ターゲットユーザーを [docs/STORE_LISTING.md](./docs/STORE_LISTING.md) に沿って申告
- [ ] **14日間クローズドテスト → 本番リリース**
  - 個人アカウント要件の **テスター12名以上（余裕を見て15〜20名）・14日間連続オプトイン** を完了後、本番アクセスを申請して公開
