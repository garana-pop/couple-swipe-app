-- フェーズ7: プッシュ通知トークン保存 RPC と重複送信防止ログテーブル
-- 対象: Supabase (PostgreSQL)

-- ============================================================================
-- 1. プッシュ通知の送信ログ（1ペア・1日・1イベントあたり重複送信を防止）
-- ============================================================================

create table if not exists public.push_notification_logs (
  pair_id uuid not null references public.pairs(id) on delete cascade,
  quiz_date date not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('partner_completed', 'both_completed')),
  sent_at timestamptz not null default now(),
  primary key (pair_id, quiz_date, sender_id, event_type)
);

create index if not exists idx_push_notification_logs_sender_id
  on public.push_notification_logs (sender_id);

alter table public.push_notification_logs enable row level security;

-- Edge Function (secret key / service_role) 専用テーブルのためクライアントからの直接アクセスは禁止
revoke all on table public.push_notification_logs from public, anon, authenticated;

-- ============================================================================
-- 2. Expo Push Token の保存・解除 RPC
-- ============================================================================

create or replace function public.upsert_push_token(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_token := nullif(trim(coalesce(p_expo_push_token, '')), '');

  if v_token is not null and v_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,128}\]$' then
    raise exception 'INVALID_EXPO_PUSH_TOKEN';
  end if;

  insert into public.profiles (id, expo_push_token, updated_at)
  values (v_uid, v_token, now())
  on conflict (id) do update
    set expo_push_token = excluded.expo_push_token,
        updated_at = now();
end;
$$;

revoke all on function public.upsert_push_token(text) from public, anon;
grant execute on function public.upsert_push_token(text) to authenticated;
