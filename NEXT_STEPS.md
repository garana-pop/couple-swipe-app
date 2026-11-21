# 次に必要な作業一覧

最終更新: 2026-11-21

[couple-swipe-development-plan.md](./couple-swipe-development-plan.md) に基づくフェーズ1〜5のアプリ側・DB設計実装に続いて、今後行う必要がある作業をまとめています。

---

## 1. 今すぐ行う設定（動作確認のため）

1. **Supabase プロジェクトの作成（無料プラン）**
   - [Supabase](https://supabase.com/) で新規プロジェクトを作成します。
2. **匿名認証とレート制限の有効化**
   - Supabase ダッシュボードの **Authentication > Providers / Settings** で **Anonymous Sign-Ins** を ON にします。
   - 乱用対策として **Authentication > Rate Limits** で匿名サインインのレート制限を設定します（必要に応じて CAPTCHA の導入も検討）。
3. **データベース・RLS・RPC の適用**
   - Supabase ダッシュボードの **SQL Editor** を開き、[supabase/migrations/20261121000000_init.sql](./supabase/migrations/20261121000000_init.sql) の内容を貼り付けて実行します。
4. **環境変数の設定**
   - [.env.example](./.env.example) を `.env.local` にコピーします。
   - Supabase ダッシュボードの Project Settings > API から URL と anon key を取得し、`.env.local` に設定します。
     ```env
     EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
     EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
     ```
5. **動作確認**
   - `npx expo start` で起動し、2台の端末（またはエミュレータ＋実機）でペア作成・招待コード参加・スワイプ回答・待機画面のロック解除・結果表示・履歴表示を確認します。

---

## 2. 今後実装・対応するフェーズ

### フェーズ5（残作業）: 質問データの拡充・追加配信
- [ ] 同梱質問を現在の60問から100問以上に増やす（[src/constants/questions.ts](./src/constants/questions.ts)）
- [ ] アプリ更新なしで質問を追加したい場合の配信方式を決めて実装する

### フェーズ6: 運用・コスト対策
- [ ] 長期間使われていないペアの自動削除を設定する（Supabase で `pg_cron` 拡張を有効にし、`cleanup_inactive_pairs(180)` を定期実行、または GitHub Actions + Edge Function）
- [ ] 無料プランの7日間非アクティブによる DB 一時停止対策を決める
- [ ] 無料プランの使用量（DB容量 500MB・egress 5GB・MAU 5万）の定期確認手順を決める
- [ ] 定期的なデータエクスポート（バックアップ）の手順または自動化を用意する

### フェーズ7: 通知・認証の強化（開発ビルドが必要）
- [ ] 「今日の質問が届きました」を端末のローカル通知で実装する（`expo-notifications`）
- [ ] 「相手が回答した」プッシュ通知を実装する（Expo Push + Edge Function / DB Webhook、FCM 設定）
- [ ] 機種変更対策として、`linkIdentity` による Google ログイン等へのアカウント昇格 UI を実装する

### フェーズ8: 課金・AIレポート・Google Play リリース準備
- [ ] RevenueCat（無料枠）＋ Google Play Billing を導入し、ペア共有の課金状態管理を実装する
- [ ] AI 相性レポート（[src/app/ai-report.tsx](./src/app/ai-report.tsx)）をサーバー側（Edge Function）で課金状態確認後に生成・返却するよう切り替える
- [ ] 退会・アカウント削除の Web 導線を用意する（アプリ内削除 `delete_my_account` は実装済み、Google Play 審査要件として Web ページの用意が必要）
- [ ] EAS Build（`npx eas-cli@latest build`）で Android 用 APK / AAB をビルドできるようにする
- [ ] Google Play デベロッパー登録、プライバシーポリシー、アプリアイコン、ストア用スクリーンショットの準備
- [ ] 個人デベロッパーアカウント要件の **14日間のクローズドテスト** を実施後、本番リリース
