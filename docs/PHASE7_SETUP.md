# フェーズ7 外部サービス設定ガイド（プッシュ通知・Google ログイン昇格）

最終更新: 2026-11-23  
対象 Supabase プロジェクト: `couple-swipe-app` (`zfnbyxntyxgmoebvvifu`)

アプリ側・DB 側・Edge Function 側の実装はすべて完了しています。実機で **7-2（リモートプッシュ通知）** と **7-3（Google ログイン昇格）** を有効化するための外部設定手順をまとめています。

> ※ **7-1（毎日のローカル通知リマインダー）** は外部設定不要です。今すぐ Expo Go の実機でメニュー →「通知・アカウント引き継ぎ」→「テスト通知を3秒後に試す」で動作確認できます。

---

## 1. Google ログイン昇格（7-3）を有効化する手順

### 1-1. Supabase で「Manual Linking」と「Redirect URLs」を設定
1. [Authentication > Providers / Settings](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/auth/providers)（または **Sign In / Providers > User Signups**）を開く
2. **Allow manual linking** を **ON** にして保存（匿名ユーザーを Google へ昇格する `linkIdentity` に必須）
3. [Authentication > URL Configuration](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/auth/url-configuration) を開く
4. **Redirect URLs** に以下を追加して保存：
   - `couple-swipe-app://auth/callback`（Android / iOS アプリ用）
   - `http://localhost:8081/settings`（PC ブラウザ開発テスト用）

### 1-2. Google Cloud Console で OAuth クライアント ID を作成
1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存を選択）
2. **API とサービス > OAuth 同意画面** を構成（外部・アプリ名「Kotaeai」）
3. **認証情報 > 認証情報を作成 > OAuth クライアント ID** → 種類は **ウェブ アプリケーション**
4. **承認済みのリダイレクト URI** に次を登録：
   ```text
   https://zfnbyxntyxgmoebvvifu.supabase.co/auth/v1/callback
   ```
5. 発行された **クライアント ID** と **クライアント シークレット** をコピー
6. Supabase の [Authentication > Providers > Google](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/auth/providers) を開き、**Enable Sign in with Google** を ON にして貼り付け → **Save**

これで PC ブラウザ（Expo Web）でも実機（Expo Go / 開発ビルド）でも「Google と連携してデータを保護する」「機種変更後のデータ復元」が動作します！

---

## 2. 「相手が回答した」リモートプッシュ通知（7-2）を有効化する手順

Supabase 側（`push_notification_logs`、`upsert_push_token`、Edge Function `notify-partner-answered`）はデプロイ済みです。Android 実機へリモート通知を届けるには **EAS 開発ビルド ＋ Firebase (FCM)** の設定が必要です（Expo Go の Android は SDK 53 以降リモートプッシュ非対応）。

1. **EAS プロジェクトの初期化（フェーズ8の EAS Build と共通）**
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
   実行後、`app.json` に `extra.eas.projectId` が自動で追加されます。
2. **Firebase (FCM) の設定（Android 向け）**
   - [Firebase Console](https://console.firebase.google.com/) で Android アプリを追加（パッケージ名例: `com.garanapop.coupleswipeapp`）し、`google-services.json` をダウンロード
   - `app.json` の `android.googleServicesFile` に `"./google-services.json"` を設定
   - Firebase の **プロジェクト設定 > サービス アカウント > 新しい秘密鍵の生成** で JSON を取得し、Expo ダッシュボード（`expo.dev` → プロジェクト → Credentials → Android → FCM V1 service account key）へアップロード
3. **（推奨）Expo Access Token の設定**
   - [Expo Access Tokens](https://expo.dev/accounts/_/settings/access-tokens) でトークンを発行し、「Enhanced Security for Push Notifications」を ON にした場合、Supabase の [Edge Functions Secrets](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/functions/secrets) に `EXPO_ACCESS_TOKEN` として登録してください（Edge Function 側は自動対応済み）。
4. **開発ビルドを作成して実機でテスト**
   ```bash
   npx eas-cli@latest build --profile development --platform android
   ```
   インストール後、設定画面の「プッシュ通知トークンを登録・更新」が **「登録済み」** になれば完了です！
