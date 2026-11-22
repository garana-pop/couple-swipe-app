-- フェーズ8: ペア共有課金状態（RevenueCat連携）＋ AI相性レポートキャッシュ
-- 対象: Supabase (PostgreSQL)

-- ============================================================================
-- 1. ユーザー課金状態テーブル（RevenueCat Webhook / サーバー検証専用）
-- ============================================================================

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entitlement_id text not null default 'premium',
  product_id text,
  store text,
  status text not null default 'inactive'
    check (status in ('active', 'grace_period', 'cancelled', 'expired', 'inactive')),
  expires_at timestamptz,
  will_renew boolean not null default false,
  revenuecat_app_user_id text,
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

-- クライアントから直接書き換え不可（参照は get_pair_entitlement RPC 経由、更新は Edge Function 専用）
revoke all on table public.user_subscriptions from public, anon, authenticated;

-- ============================================================================
-- 2. AI 相性レポートキャッシュテーブル（有料ペア限定・無駄なLLM再生成を防止）
-- ============================================================================

create table if not exists public.pair_ai_reports (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  generated_by uuid references auth.users(id) on delete set null,
  analyzed_days int not null default 0,
  analyzed_answers int not null default 0,
  report_json jsonb not null,
  model_used text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pair_ai_reports_pair_created
  on public.pair_ai_reports (pair_id, created_at desc);

create index if not exists idx_pair_ai_reports_generated_by
  on public.pair_ai_reports (generated_by);

alter table public.pair_ai_reports enable row level security;

-- ============================================================================
-- 3. ペア共有の課金判定ヘルパー ＆ 状態取得 RPC
-- ============================================================================

create or replace function public.is_pair_premium(p_pair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_pair_member(p_pair_id)
    and exists (
      select 1
      from public.pair_members pm
      join public.user_subscriptions us on us.user_id = pm.user_id
      where pm.pair_id = p_pair_id
        and us.status in ('active', 'grace_period')
        and (us.expires_at is null or us.expires_at > now())
    );
$$;

revoke all on function public.is_pair_premium(uuid) from public, anon;
grant execute on function public.is_pair_premium(uuid) to authenticated;

create policy "pair_ai_reports_select_premium_member"
  on public.pair_ai_reports for select
  to authenticated
  using (
    public.is_pair_member(pair_id)
    and public.is_pair_premium(pair_id)
  );

revoke all on table public.pair_ai_reports from public, anon, authenticated;
grant select on table public.pair_ai_reports to authenticated;

create or replace function public.get_pair_entitlement()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid;
  v_my_sub public.user_subscriptions;
  v_partner_sub public.user_subscriptions;
  v_active_sub public.user_subscriptions;
  v_paid_by_me boolean := false;
  v_paid_by_partner boolean := false;
  v_is_premium boolean := false;
  v_revealed_days int := 0;
  v_latest_report jsonb := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_my_sub
  from public.user_subscriptions
  where user_id = v_uid;

  v_paid_by_me :=
    v_my_sub.user_id is not null
    and v_my_sub.status in ('active', 'grace_period')
    and (v_my_sub.expires_at is null or v_my_sub.expires_at > now());

  select pair_id into v_pair_id
  from public.pair_members
  where user_id = v_uid;

  if v_pair_id is not null then
    select us.* into v_partner_sub
    from public.pair_members pm
    join public.user_subscriptions us on us.user_id = pm.user_id
    where pm.pair_id = v_pair_id
      and pm.user_id <> v_uid
    limit 1;

    v_paid_by_partner :=
      v_partner_sub.user_id is not null
      and v_partner_sub.status in ('active', 'grace_period')
      and (v_partner_sub.expires_at is null or v_partner_sub.expires_at > now());

    select count(*) into v_revealed_days
    from public.daily_sets ds
    where ds.pair_id = v_pair_id
      and public.is_revealed(ds.pair_id, ds.quiz_date);
  end if;

  v_is_premium := v_paid_by_me or v_paid_by_partner;

  if v_paid_by_me then
    v_active_sub := v_my_sub;
  elsif v_paid_by_partner then
    v_active_sub := v_partner_sub;
  else
    v_active_sub := v_my_sub;
  end if;

  if v_is_premium and v_pair_id is not null then
    select jsonb_build_object(
      'id', r.id,
      'analyzed_days', r.analyzed_days,
      'analyzed_answers', r.analyzed_answers,
      'model_used', r.model_used,
      'created_at', r.created_at,
      'report', r.report_json
    )
    into v_latest_report
    from public.pair_ai_reports r
    where r.pair_id = v_pair_id
    order by r.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'has_pair', v_pair_id is not null,
    'is_premium', v_is_premium,
    'paid_by_me', v_paid_by_me,
    'paid_by_partner', v_paid_by_partner,
    'status', coalesce(v_active_sub.status, 'inactive'),
    'product_id', v_active_sub.product_id,
    'expires_at', v_active_sub.expires_at,
    'will_renew', coalesce(v_active_sub.will_renew, false),
    'revealed_days_count', v_revealed_days,
    'latest_report', v_latest_report
  );
end;
$$;

revoke all on function public.get_pair_entitlement() from public, anon;
grant execute on function public.get_pair_entitlement() to authenticated;
