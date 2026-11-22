# 運用・コスト管理ガイド（ふたりスワイプ）

最終更新: 2026-11-22  
対象 Supabase プロジェクト: `couple-swipe-app` (`zfnbyxntyxgmoebvvifu` / 東京リージョン `ap-northeast-1`)

---

## 1. 追加質問の配信手順（アプリ更新不要・低 egress）

アプリには **120問（`q1`〜`q120`）** が同梱されています。アプリをストア更新せずに質問を追加したい場合のみ、Supabase の `public.extra_questions` テーブルへ登録します。

- アプリは通常 **24時間に1回だけ** `get_extra_questions_since` で差分同期します（追加が無ければ空配列のみ返却されるため egress をほぼ消費しません）。
- パートナー側で新しい追加質問が出題された場合、未同期端末でも未知の質問IDを検知して自動補完します。
- ID は同梱質問（`q1`〜`q120`）と衝突しないよう **`x1`, `x2`, ...** などの接頭辞を推奨します。

### 新しい質問を追加する SQL 例
Supabase ダッシュボードの [SQL Editor](https://supabase.com/dashboard/project/zfnbyxntyxgmoebvvifu/sql/new) で実行します：

```sql
insert into public.extra_questions (id, category, title, choices, match_rule, is_active)
values (
  'x1',
  '記念日・イベント',
  '1年に1回、二人で必ずやりたい恒例行事は？',
  '{
    "UP": "記念日の旅行",
    "DOWN": "ちょっと良いレストランでディナー",
    "LEFT": "季節のイベント（花見・紅葉など）",
    "RIGHT": "おうちで写真を見返す会"
  }'::jsonb,
  'exact', -- UP(自分)とDOWN(相手)を相互一致にする場合は 'mirror_up_down'
  true
)
on conflict (id) do update
  set category = excluded.category,
      title = excluded.title,
      choices = excluded.choices,
      match_rule = excluded.match_rule,
      is_active = excluded.is_active;
```

### 追加質問の出題を停止する（過去履歴は維持）
行を `DELETE` せず `is_active = false` にしてください（過去の履歴表示を壊さず、今後の出題プールからのみ除外されます）：

```sql
update public.extra_questions
set is_active = false
where id = 'x1';
```

---

## 2. 長期間使われていないペアの自動削除（`pg_cron` 設定済み）

DB 容量（無料枠 500MB）を守るため、Supabase の `pg_cron` で以下を自動実行しています。

- **ジョブ名**: `cleanup-inactive-pairs-weekly`
- **実行スケジュール**: `0 18 * * 0`（毎週月曜 03:00 JST / 日曜 18:00 UTC）
- **実行内容**: `select public.cleanup_inactive_pairs(180);`（180日以上アクティブでないペアと紐づく `pair_members` / `daily_sets` / `answers` をカスケード削除）

### 稼働確認クエリ
```sql
-- 登録ジョブ一覧
select jobid, jobname, schedule, command, active
from cron.job
order by jobid;

-- 直近の実行履歴
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 10;
```

---

## 3. 無料プランの「7日間非アクティブによる一時停止」対策

Supabase 無料プランでは **7日間 API アクセスがないとプロジェクトが自動一時停止** されます。  
リリース初期や開発休止期間中の停止を防ぐため、GitHub Actions ワークフロー [.github/workflows/supabase-keepalive.yml](../.github/workflows/supabase-keepalive.yml) を用意しています（5日ごとに軽量なヘルスチェックを実行）。

### 有効化手順（GitHub リポジトリ設定）
GitHub リポジトリの **Settings > Secrets and variables > Actions > New repository secret** で以下 2 つを登録します：

| Secret 名 | 値 |
|---|---|
| `SUPABASE_URL` | `https://zfnbyxntyxgmoebvvifu.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key（`sb_publishable_...`） |

※登録後、GitHub の **Actions > Supabase Keepalive > Run workflow** で手動テストできます。

---

## 4. 無料プラン使用量の定期確認手順（月1回推奨）

### 無料枠の上限目安
| 指標 | 無料枠上限 | 注意ライン（要検討） | 確認先 |
|---|---|---|---|
| DB 容量 | 500 MB | 350 MB (70%) | [Organization Usage](https://supabase.com/dashboard/org/dyfceywlqwkucpoenkza/usage) |
| Egress（通信量） | 5 GB / 月 | 3.5 GB / 月 (70%) | 同上 |
| MAU（月間アクティブユーザー） | 50,000 | 35,000 (70%) | 同上 |
| Realtime 同時接続 | 200 | 140 | 同上（現在はポーリングのため未使用） |

### DB サイズ・行数・アクティブペア確認 SQL
```sql
-- データベース全体サイズ（上限 500MB）
select pg_size_pretty(pg_database_size(current_database())) as total_db_size;

-- public スキーマのテーブル別サイズと概算行数
select
  relname as table_name,
  n_live_tup as approx_rows,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc;

-- アクティブペア数と削除対象候補（180日超）
select
  count(*) as total_pairs,
  count(*) filter (where last_active_at >= now() - interval '7 days') as active_7d,
  count(*) filter (where last_active_at >= now() - interval '30 days') as active_30d,
  count(*) filter (where last_active_at < now() - interval '180 days') as inactive_over_180d
from public.pairs;
```

### Pro プラン移行の判断基準
- 上記の **注意ライン（70%）** を継続的に超え始めたとき
- 有料ユーザー（AI 相性レポート課金）の月間売上が Pro プラン費用（$25/月）を上回り、自動日次バックアップや無停止運用を優先したいとき

---

## 5. 定期バックアップとリストア手順

Supabase 無料プランには自動日次バックアップが無いため、暗号化バックアップ用の GitHub Actions ワークフロー [.github/workflows/supabase-backup.yml](../.github/workflows/supabase-backup.yml)（毎週月曜 04:00 JST 実行・30日保持）を用意しています。

### 自動バックアップの有効化手順
GitHub の **Settings > Secrets and variables > Actions** で以下 2 つを登録します：

| Secret 名 | 値 |
|---|---|
| `SUPABASE_DB_URL` | Supabase ダッシュボードの **Connect > Session pooler**（IPv4 対応 URI、`postgresql://postgres.zfnbyxntyxgmoebvvifu:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`） |
| `BACKUP_PASSPHRASE` | 任意の強力な暗号化パスフレーズ（公開リポジトリでも中身が読めないよう AES256 暗号化します。パスワードマネージャー等に控えてください） |

### 手動リストア手順
GitHub Actions の Artifact から `.sql.gz.gpg` をダウンロードしたあと、ローカルで復号して復元します：

```bash
# 1. 復号と解凍
gpg --decrypt couple-swipe-public-YYYYMMDD-HHMMSS.sql.gz.gpg | gunzip > backup.sql

# 2. 復元先 DB に流し込み（本番へ直接流す前に必ずテスト用 DB で確認すること）
psql "$SUPABASE_DB_URL" -f backup.sql
```
