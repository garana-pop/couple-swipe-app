# フェーズ8 リリース・課金・AIレポート設定ガイド（Google Play）

最終更新: 2026-11-23  
Android パッケージ名: `com.garanapop.coupleswipeapp`  
EAS Project ID: `53113b48-89fc-44ec-b0d1-0bdd6fdab884`  
Supabase Project: `zfnbyxntyxgmoebvvifu`

---

## 1. EAS Build 環境変数の登録とビルド手順

`.env.local` は Git 管理外のため、クラウド上で EAS Build を実行する前に EAS 環境変数を登録します。

```bash
# 必須: Supabase 接続情報（development / preview / production 全環境向け）
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://zfnbyxntyxgmoebvvifu.supabase.co" --visibility plaintext --environment development --environment preview --environment production
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "sb_publishable_ZJC-JNxuIha9NsSLhw5IGA_Vo_2_td9" --visibility plaintext --environment development --environment preview --environment production

# 課金有効化後: RevenueCat Android Public SDK Key（goog_...）
npx eas-cli@latest env:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value "goog_xxxxxxxx" --visibility plaintext --environment development --environment preview --environment production
```

### Android ビルドコマンド
- **開発ビルド（実機でプッシュ通知・課金・Google連携をデバッグ）**:
  ```bash
  npx eas-cli@latest build --profile development --platform android
  ```
- **プレビュー APK（実機へ直接インストールして単独動作確認）**:
  ```bash
  npx eas-cli@latest build --profile preview --platform android
  ```
- **本番 AAB（Google Play ストア提出用）**:
  ```bash
  npx eas-cli@latest build --profile production --platform android
  ```

---

## 2. AI 相性レポート用 Gemini API キーの設定（Supabase Edge Function Secret）

AI 相性レポート生成（Edge Function: `generate-ai-report`）は **サーバー側で課金確認を通過した有料ペアに対してのみ** Gemini API を呼び出します（デフォルトモデル: `gemini-flash-lite-latest`、`404/503` 時は `gemini-flash-latest` 等へ自動フェイルオーバー、`thinkingBudget: 512`・1ペア1日3回上限付き）。

1. [Google AI Studio](https://aistudio.google.com/apikey) で `GEMINI_API_KEY` を取得
2. Supabase ダッシュボードの [Edge Functions > Secrets](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/functions/secrets) に以下を登録：
   - `GEMINI_API_KEY`: 取得した API キー
   - （任意）`GEMINI_MODEL`: モデル名を変更したい場合のみ設定

---

## 3. RevenueCat（無料枠）＋ Google Play Billing 連携手順

1. **Google Play Console で定期購入商品を作成**
   - 定期購入 ID 例: `couple_swipe_yearly`（年額 ¥3,000・50% OFF）、`couple_swipe_monthly`（月額 ¥500）
2. **RevenueCat（https://www.revenuecat.com/）で無料プロジェクト作成**
   - Google Play アプリ（`com.garanapop.coupleswipeapp`）を登録し、サービスアカウントを接続
   - Entitlement `premium` を作成し、Offering `default` に `$rc_annual`（年額）と `$rc_monthly`（月額）を紐づけ
   - **API Keys** から **Google (Public) API Key**（`goog_...`）をコピー → 上記セクション1の `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` へ設定
3. **RevenueCat Webhook を Supabase Edge Function に接続（ペア共有課金の要）**
   - 任意の強力なランダム文字列を1つ生成し、Supabase の [Edge Functions > Secrets](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/functions/secrets) に `REVENUECAT_WEBHOOK_AUTH_KEY` として登録
   - （推奨・購入直後の即時反映用）RevenueCat の **Secret API Key (V1)** を `REVENUECAT_SECRET_API_KEY` として登録
   - RevenueCat ダッシュボードの **Integrations > Webhooks > Add new configuration** で以下を設定：
     - **Webhook URL**: `https://zfnbyxntyxgmoebvvifu.supabase.co/functions/v1/revenuecat-webhook`
     - **Authorization header value**: `Bearer <REVENUECAT_WEBHOOK_AUTH_KEY と同じ値>`
   - **Send test event** を押して `200 OK` が返れば完了！

---

## 4. プライバシーポリシー ＆ 退会 Web 導線の公開（GitHub Pages・無料）

Google Play 審査では、アプリ外の公開 URL（プライバシーポリシー＋アカウント削除ページ）が必須です。

1. 今回の変更を GitHub の `main` ブランチへ push
2. GitHub リポジトリの **Settings > Pages > Build and deployment > Source** を **GitHub Actions** に変更
3. `.github/workflows/deploy-legal-pages.yml` が自動実行され、以下が公開されます：
   - プライバシーポリシー: `https://garana-pop.github.io/couple-swipe-app/privacy.html`
   - アカウント削除ページ: `https://garana-pop.github.io/couple-swipe-app/account-deletion.html`
4. Supabase の [Authentication > URL Configuration > Redirect URLs](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/auth/url-configuration) に `https://garana-pop.github.io/couple-swipe-app/account-deletion.html` を追加（Web 退会ページの Google ログイン即時削除が有効になります）

---

## 5. Google Play デベロッパー登録・ストア素材・14日間クローズドテスト

### ストア提出チェックリスト
- [ ] Google Play Console デベロッパー登録（初回登録料 $25）
- [ ] アプリアイコン（`512x512 px` PNG・透過なし）
- [ ] フィーチャーグラフィック（`1024x500 px` PNG / JPEG）
- [ ] スマートフォン用スクリーンショット（最低2枚、推奨4〜6枚：ホーム / 4択スワイプ / 待機ロック / 結果一致率 / 履歴比較 / AIレポート）
- [ ] **データセーフティ** 申告（匿名ID・任意のメールアドレス・回答履歴・通知トークン・購入履歴／アカウント削除 URL として上記 `account-deletion.html` を登録）
- [ ] プライバシーポリシー URL として上記 `privacy.html` を登録
- [ ] **クローズドテスト（個人アカウント必須要件）**：
  - 本番用 AAB（`npx eas-cli@latest build --profile production --platform android`）をクローズドテストトラックへアップロード
  - **テスター12名以上** がオプトインした状態を **14日間連続** で維持後、本番アクセスを申請してリリース
