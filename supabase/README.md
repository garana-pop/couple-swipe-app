# Supabase セットアップ手順

1. [Supabase](https://supabase.com/) で無料プランのプロジェクトを作成します。
2. Supabase ダッシュボードの **Authentication > Providers / Settings** で **Anonymous Sign-Ins** を有効にします。
   - 不正利用対策として **Authentication > Rate Limits**（匿名サインインのレート制限）を設定してください。
3. **SQL Editor** で `supabase/migrations/20261121000000_init.sql` の内容を実行します。
4. プロジェクトルートの `.env.example` を `.env.local` にコピーし、`EXPO_PUBLIC_SUPABASE_URL` と `EXPO_PUBLIC_SUPABASE_ANON_KEY` を設定します。
5. （任意・フェーズ6）長期間使われていないペアを自動削除する場合は、`pg_cron` 拡張を有効にして以下をスケジュール登録します:
   ```sql
   select cron.schedule(
     'cleanup-inactive-pairs',
     '0 4 * * 0',
     $$select public.cleanup_inactive_pairs(180);$$
   );
   ```
