# 次に必要な作業一覧

最終更新: 2026-11-23

[couple-swipe-development-plan.md](./couple-swipe-development-plan.md) に基づくフェーズ1〜5のアプリ側・DB設計実装に続いて、今後行う必要がある作業をまとめています。

---

## 1. 今すぐ行う設定（動作確認のため）

1. ~~**Supabase プロジェクトの作成（無料プラン）**~~ ✅ 完了（`couple-swipe-app` / 東京リージョン）
2. ~~**匿名認証とレート制限の有効化**~~ ✅ 完了
3. ~~**データベース・RLS・RPC の適用**~~ ✅ 完了（全6テーブル・RLS・16関数・最小権限・Advisors確認・E2Eスモークテスト通過）
4. ~~**環境変数の設定**~~ ✅ 完了（`.env.local` に URL・Publishable key 設定済み）
5. ~~**実機／エミュレータでの動作確認**~~ ✅ 完了（実機 Expo Go ＋ PC ブラウザ Expo Web で2台連携・スワイプ・ロック解除・結果・履歴を確認済み）

---

## 2. 今後実装・対応するフェーズ

### フェーズ5（残作業）: 質問データの拡充・追加配信 ✅ 完了
- [x] 同梱質問を現在の60問から100問以上に増やす（[src/constants/questions.ts](./src/constants/questions.ts) — **120問**へ拡充完了）
- [x] アプリ更新なしで質問を追加したい場合の配信方式を決めて実装する（`public.extra_questions` ＋差分同期 RPC `get_extra_questions_since` ＋24時間ローカルキャッシュ＋未知ID自動補完＋90日再出題枠強化）

### フェーズ6: 運用・コスト対策 ✅ 完了（※GitHub Secrets 登録のみ手動設定が必要）
- [x] 長期間使われていないペアの自動削除を設定する（Supabase `pg_cron` 有効化・`cleanup-inactive-pairs-weekly` ジョブ登録済み）
- [x] 無料プランの7日間非アクティブによる DB 一時停止対策を決める（[.github/workflows/supabase-keepalive.yml](./.github/workflows/supabase-keepalive.yml) を作成済み）
- [x] 無料プランの使用量（DB容量 500MB・egress 5GB・MAU 5万）の定期確認手順を決める（[docs/OPERATIONS.md](./docs/OPERATIONS.md) に整備済み）
- [x] 定期的なデータエクスポート（バックアップ）の手順または自動化を用意する（[.github/workflows/supabase-backup.yml](./.github/workflows/supabase-backup.yml) ＋復号リストア手順を [docs/OPERATIONS.md](./docs/OPERATIONS.md) に整備済み）

### フェーズ7: 通知・認証の強化 ✅ 実装・デプロイ完了（※外部設定・開発ビルドでの実機反映は [docs/PHASE7_SETUP.md](./docs/PHASE7_SETUP.md) 参照）
- [x] 「今日の質問が届きました」を端末のローカル通知で実装する（[src/lib/notifications.ts](./src/lib/notifications.ts)・[src/app/settings.tsx](./src/app/settings.tsx) — Expo Go 実機でテスト可能）
- [x] 「相手が回答した」プッシュ通知を実装する（`upsert_push_token` RPC・`push_notification_logs`・Edge Function `notify-partner-answered` デプロイ済み／Android 実機配信は FCM + EAS 開発ビルドが必要）
- [x] 機種変更対策として、`linkIdentity` による Google ログイン昇格＋既存アカウント復元ログイン UI を実装する（[src/lib/auth.ts](./src/lib/auth.ts)・[src/app/settings.tsx](./src/app/settings.tsx)・[src/app/auth/callback.tsx](./src/app/auth/callback.tsx)／Supabase の Manual Linking + Google Provider 設定が必要）

### フェーズ8: 課金・AIレポート・Google Play リリース準備（コード・バックエンド実装完了／外部設定・提出手順は [docs/RELEASE_GUIDE.md](./docs/RELEASE_GUIDE.md) 参照）
- [x] RevenueCat（無料枠）＋ Google Play Billing を導入し、ペア共有の課金状態管理を実装する（`user_subscriptions`・`is_pair_premium`・`get_pair_entitlement` RPC・Edge Function `revenuecat-webhook` デプロイ済み・[src/lib/billing.ts](./src/lib/billing.ts) 実装済み）
- [x] AI 相性レポート（[src/app/ai-report.tsx](./src/app/ai-report.tsx)）をサーバー側（Edge Function `generate-ai-report` ＋ `pair_ai_reports` キャッシュ）で課金状態確認後に生成・返却するよう切り替える
- [x] 退会・アカウント削除の Web 導線・プライバシーポリシーを用意する（[web-legal/](./web-legal/) ＋ GitHub Pages 公開完了）
- [x] EAS Build（`npx eas-cli@latest build`）で Android 用 APK / AAB をビルドできるようにする（[eas.json](./eas.json)・EAS 環境変数登録・FCM V1 認証鍵登録・Android 実機 APK ビルド＆動作確認完了）
- [ ] **【ユーザー作業（リリース・課金有効化時）】** 外部キー登録（Supabase Secrets の `GEMINI_API_KEY` / `REVENUECAT_WEBHOOK_AUTH_KEY`、Google OAuth 設定、RevenueCat 商品連携 — [docs/PHASE7_SETUP.md](./docs/PHASE7_SETUP.md)・[docs/RELEASE_GUIDE.md](./docs/RELEASE_GUIDE.md) 参照）
- [ ] **【ユーザー作業（ストア申請時）】** Google Play デベロッパー登録、ストア用アプリアイコン（512×512）・フィーチャーグラフィック（1024×500）・スクリーンショットの準備
- [ ] **【ユーザー作業（ストア申請時）】** 個人デベロッパーアカウント要件の **14日間のクローズドテスト** を実施後、本番リリース
