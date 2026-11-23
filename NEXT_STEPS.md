# 次に必要な作業一覧（Kotaeai）

最終更新: 2026-11-23  
アプリ名: **Kotaeai**（ストア掲載・説明文用表記: **Kotaeai（コタエアイ）**）  
Android パッケージ名: `com.garanapop.coupleswipeapp`

[couple-swipe-development-plan.md](./couple-swipe-development-plan.md) に基づく全フェーズ（フェーズ1〜8）および追加機能・UX改善の進捗と、ストア公開に向けた残タスクをまとめています。

---

## 1. 完了済みの基盤・全フェーズ実装

### 初期構築・フェーズ1〜5 ✅ 完了
1. **Supabase プロジェクト構築・匿名認証・DB／RLS／RPC 適用**（`couple-swipe-app` / `zfnbyxntyxgmoebvvifu` / 東京リージョン）
2. **同梱質問 120問 ＋ 追加質問の低 Egress 差分同期**（[src/constants/questions.ts](./src/constants/questions.ts)・`public.extra_questions`・`get_extra_questions_since`）
3. **実機 Expo Go ＆ Android APK での2台ペア連携・スワイプ・ロック解除・履歴動作確認**

### フェーズ6: 運用・コスト対策 ✅ 完了
- [x] 非アクティブペア（180日）の自動削除（`pg_cron` `cleanup-inactive-pairs-weekly`）
- [x] DB 一時停止対策（[.github/workflows/supabase-keepalive.yml](./.github/workflows/supabase-keepalive.yml)）＆ 自動バックアップ（[.github/workflows/supabase-backup.yml](./.github/workflows/supabase-backup.yml)）・運用手順書（[docs/OPERATIONS.md](./docs/OPERATIONS.md)）

### フェーズ7: 通知・認証強化 ✅ 完了
- [x] 毎日の端末ローカル通知リマインダー（[src/lib/notifications.ts](./src/lib/notifications.ts)・[src/app/settings.tsx](./src/app/settings.tsx)）
- [x] パートナー回答完了時の Expo Push 通知（`notify-partner-answered` v2・過去日追っかけ回答の専用通知文言対応・FCM V1 認証鍵 EAS 登録済み）
- [x] 機種変更引き継ぎ用 Google アカウント連携（`linkIdentity` ＋復元ログイン UI）

### フェーズ8: 課金・AI診断・法的ページ・EAS ビルド ✅ 実装＆実動作検証完了
- [x] RevenueCat ＋ Google Play Billing ペア共有課金基盤（年額 ¥3,000・`50% OFF`／月額 ¥500・1人課金で2人共有、`revenuecat-webhook` デプロイ済み）
- [x] **実 Gemini API AI 相性診断（`generate-ai-report` v9 本番稼働・E2E 検証済み）**
  - `GEMINI_API_KEY` 登録・実動作検証完了
  - `gemini-flash-lite-latest`（404/503 自動フェイルオーバー）＋ `thinkingBudget: 512` ＋ `maxOutputTokens: 2048` ＋ 1ペア1日3回上限のコスト安全策実装済み
  - 回答日時（時間帯5区分・当日／追っかけ割合・回答テンポ）の集計サマリーを診断へ反映（細かい時刻非言及・肯定表現ガード付き）
- [x] **課金ペア向け過去日機能（本番 DB マイグレーション＆E2E 検証済み）**
  - 過去未回答日の相手回答の閲覧＆AI診断反映（[20261123000002_premium_past_partner_answers.sql](./supabase/migrations/20261123000002_premium_past_partner_answers.sql)）
  - 過去未回答お題への追っかけ回答＆ネタバレ防止（回答完了で相手の答えと一致率を即公開：[20261123000003_premium_answer_past_days.sql](./supabase/migrations/20261123000003_premium_answer_past_days.sql)）
- [x] **UX・審査対応改善（実装完了）**
  - アプリ表示名・ロゴ・Web 法的ページ（[web-legal/](./web-legal/)）を **`Kotaeai`** に統一（GitHub Pages 自動公開）
  - 購入画面（[src/app/ai-report.tsx](./src/app/ai-report.tsx)）・設定画面（[src/app/settings.tsx](./src/app/settings.tsx)）にプライバシーポリシー／Google Play 解約管理／退会案内リンクを設置
  - 当日回答時の通信エラー保護（失敗時ロールバック・エラー表示・再スワイプ復帰）
  - ホーム画面の連続回答ストリーク表示＆履歴画面のカテゴリ別一致率グラフ
  - 過去の AI 診断レポートを並べて前回比スコア比較＆閲覧できるアーカイブ機能
  - 結果画面（[src/app/result.tsx](./src/app/result.tsx)）の会話きっかけ一言＆プライバシー配慮の一致率シェアカード＋テキスト共有
- [x] EAS 環境変数登録 ＆ Android プレビュー APK クラウドビルド成功

---

## 2. これから行う作業（リリース・課金本番化に向けて）

### A. 最新コードの APK 再ビルド（任意・実機最終確認用）
- [ ] `Kotaeai` 名称および今回の7項目改善を反映した Android プレビュー APK を再ビルドして実機確認する：
  ```bash
  npx eas-cli@latest build --platform android --profile preview
  ```

### B. 外部サービス設定（課金・Google連携の本番有効化時）
詳細は [docs/PHASE7_SETUP.md](./docs/PHASE7_SETUP.md)・[docs/RELEASE_GUIDE.md](./docs/RELEASE_GUIDE.md) を参照してください。
- [ ] **Google Play Console 定期購入商品の作成**
  - `couple_swipe_yearly`（年額 **¥3,000**・50% OFF）
  - `couple_swipe_monthly`（月額 **¥500**）
- [ ] **RevenueCat 連携＆秘密鍵登録**
  - RevenueCat にアプリ（`com.garanapop.coupleswipeapp`）と Entitlement `premium`／Offering `default` を設定
  - EAS 環境変数に `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` を登録
  - Supabase Secrets に `REVENUECAT_WEBHOOK_AUTH_KEY`（および推奨: `REVENUECAT_SECRET_API_KEY`）を登録し、Webhook（`revenuecat-webhook`）のテスト送信で `200 OK` を確認
- [ ] **Google アカウント連携（機種変更引き継ぎ）を有効化する場合**
  - Supabase Auth の Manual Linking と Google Provider を設定（[docs/PHASE7_SETUP.md](./docs/PHASE7_SETUP.md)）
- [ ] **GitHub Secrets 登録（まだの場合）**
  - `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`（keepalive 用）、`SUPABASE_DB_URL` / `BACKUP_PASSPHRASE`（週次バックアップ用）

### C. Google Play ストア申請・公開準備
- [ ] **Google Play デベロッパー登録**（初回登録料 $25）
- [ ] **オリジナルアプリアイコン差し替え**（`assets/icon.png`・`assets/android-icon-*.png`）およびストア素材準備
  - アプリアイコン（512×512 PNG）、フィーチャーグラフィック（1024×500）、スクリーンショット（4〜6枚）
  - ストア掲載名・説明文に「**Kotaeai（コタエアイ）**」を使用
- [ ] **データセーフティ＆プライバシー／退会 URL 登録**
  - プライバシーポリシー：`https://garana-pop.github.io/couple-swipe-app/privacy.html`
  - アカウント削除：`https://garana-pop.github.io/couple-swipe-app/account-deletion.html`
- [ ] **本番 AAB ビルド ＆ 14日間クローズドテスト**
  - `npx eas-cli@latest build --platform android --profile production`
  - 個人アカウント要件の **テスター12名以上・14日間連続** を完了後、本番リリース
