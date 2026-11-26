-- 多言語対応（8言語: ja / en / fr / ko / ru / th / zh-Hans / zh-Hant）＆ グローバルタイムゾーン対応
-- 対象: Supabase (PostgreSQL)

-- ============================================================================
-- 1. profiles に locale / timezone カラムを追加
-- ============================================================================

alter table public.profiles
  add column if not exists locale text not null default 'ja';

alter table public.profiles
  add column if not exists timezone text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_locale_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_locale_check
      check (locale in ('ja', 'en', 'fr', 'ko', 'ru', 'th', 'zh-Hans', 'zh-Hant'));
  end if;
end $$;

-- ============================================================================
-- 2. タイムゾーン検証ヘルパー（不正な IANA 名によるエラーを防止）
-- ============================================================================

create or replace function public.sanitize_timezone(
  p_timezone text,
  p_fallback text default 'UTC'
)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_clean text := nullif(trim(coalesce(p_timezone, '')), '');
begin
  if v_clean is not null and exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = v_clean
  ) then
    return v_clean;
  end if;
  return p_fallback;
end;
$$;

revoke all on function public.sanitize_timezone(text, text) from public, anon, authenticated;

-- ============================================================================
-- 3. 端末の言語・タイムゾーンを自動同期する RPC
-- ============================================================================

create or replace function public.upsert_profile_locale(
  p_locale text,
  p_timezone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_locale text := case
    when p_locale in ('ja', 'en', 'fr', 'ko', 'ru', 'th', 'zh-Hans', 'zh-Hant') then p_locale
    else 'en'
  end;
  v_tz text := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(coalesce(p_timezone, '')), '') is not null then
    v_tz := public.sanitize_timezone(p_timezone, null);
  end if;

  insert into public.profiles (id, locale, timezone)
  values (v_uid, v_locale, v_tz)
  on conflict (id) do update
    set locale = excluded.locale,
        timezone = coalesce(excluded.timezone, public.profiles.timezone),
        updated_at = now();

  return jsonb_build_object(
    'locale', v_locale,
    'timezone', v_tz
  );
end;
$$;

revoke all on function public.upsert_profile_locale(text, text) from public, anon;
grant execute on function public.upsert_profile_locale(text, text) to authenticated;

-- ============================================================================
-- 4. create_pair をグローバルタイムゾーン対応に拡張（既存1引数との非破壊オーバーロード）
-- ============================================================================

create or replace function public.create_pair(
  p_display_name text,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pair public.pairs;
  v_code text;
  v_tries int := 0;
  v_profile_tz text;
  v_effective_tz text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select timezone into v_profile_tz
  from public.profiles
  where id = v_uid;

  v_effective_tz := public.sanitize_timezone(
    coalesce(nullif(trim(coalesce(p_timezone, '')), ''), v_profile_tz),
    'Asia/Tokyo'
  );

  insert into public.profiles (id, display_name, timezone)
  values (v_uid, coalesce(nullif(trim(coalesce(p_display_name, '')), ''), 'あなた'), v_effective_tz)
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), public.profiles.display_name),
        timezone = coalesce(v_effective_tz, public.profiles.timezone),
        updated_at = now();

  if exists (select 1 from public.pair_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_PAIR';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_invite_code();
    begin
      insert into public.pairs (invite_code, invite_expires_at, timezone)
      values (v_code, now() + interval '7 days', v_effective_tz)
      returning * into v_pair;
      exit;
    exception when unique_violation then
      if v_tries >= 10 then
        raise exception 'FAILED_TO_GENERATE_CODE';
      end if;
    end;
  end loop;

  insert into public.pair_members (pair_id, user_id)
  values (v_pair.id, v_uid);

  return jsonb_build_object(
    'pair_id', v_pair.id,
    'invite_code', v_pair.invite_code,
    'invite_expires_at', v_pair.invite_expires_at,
    'timezone', v_pair.timezone
  );
end;
$$;

revoke all on function public.create_pair(text, text) from public, anon;
grant execute on function public.create_pair(text, text) to authenticated;

create or replace function public.create_pair(
  p_display_name text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.create_pair(p_display_name, null::text);
$$;

revoke all on function public.create_pair(text) from public, anon;
grant execute on function public.create_pair(text) to authenticated;

-- ============================================================================
-- 5. get_pair_state の未ペア時 today_date を profiles.timezone 対応に拡張
-- ============================================================================

create or replace function public.get_pair_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_name text;
  v_my_tz text;
  v_pair public.pairs;
  v_partner_id uuid;
  v_partner_name text;
  v_today date;
  v_pair_start_date date;
  v_is_premium boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select display_name, timezone into v_my_name, v_my_tz
  from public.profiles
  where id = v_uid;

  select p.* into v_pair
  from public.pair_members pm
  join public.pairs p on p.id = pm.pair_id
  where pm.user_id = v_uid;

  if v_pair.id is null then
    select exists (
      select 1
      from public.user_subscriptions us
      where us.user_id = v_uid
        and us.status in ('active', 'grace_period')
        and (us.expires_at is null or us.expires_at > now())
    ) into v_is_premium;

    return jsonb_build_object(
      'has_pair', false,
      'is_pair_connected', false,
      'my_name', coalesce(v_my_name, 'あなた'),
      'partner_name', null,
      'pair_id', null,
      'invite_code', null,
      'invite_expires_at', null,
      'today_date', (now() AT TIME ZONE public.sanitize_timezone(v_my_tz, 'Asia/Tokyo'))::date,
      'pair_start_date', null,
      'is_premium', v_is_premium
    );
  end if;

  select pm.user_id, pr.display_name
    into v_partner_id, v_partner_name
  from public.pair_members pm
  left join public.profiles pr on pr.id = pm.user_id
  where pm.pair_id = v_pair.id
    and pm.user_id <> v_uid
  limit 1;

  v_today := public.today_in_pair_tz(v_pair.id);
  v_is_premium := public.is_pair_premium(v_pair.id);
  v_pair_start_date := least(
    v_today,
    (v_pair.created_at AT TIME ZONE coalesce(v_pair.timezone, 'Asia/Tokyo'))::date,
    coalesce(
      (select min(ds.quiz_date) from public.daily_sets ds where ds.pair_id = v_pair.id),
      v_today
    )
  );

  return jsonb_build_object(
    'has_pair', true,
    'is_pair_connected', v_partner_id is not null,
    'my_name', coalesce(v_my_name, 'あなた'),
    'partner_name', coalesce(v_partner_name, 'パートナー'),
    'pair_id', v_pair.id,
    'invite_code', v_pair.invite_code,
    'invite_expires_at', v_pair.invite_expires_at,
    'today_date', v_today,
    'pair_start_date', v_pair_start_date,
    'is_premium', v_is_premium
  );
end;
$$;

revoke all on function public.get_pair_state() from public, anon;
grant execute on function public.get_pair_state() to authenticated;

-- ============================================================================
-- 6. extra_questions に多言語 translations JSONB カラムを追加
-- ============================================================================

alter table public.extra_questions
  add column if not exists translations jsonb not null default '{}'::jsonb;

create or replace function public.get_extra_questions_since(p_since timestamptz default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'server_time', now(),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', eq.id,
          'category', eq.category,
          'title', eq.title,
          'choices', eq.choices,
          'translations', eq.translations,
          'matchRule', eq.match_rule,
          'isActive', eq.is_active,
          'updatedAt', eq.updated_at
        )
        order by eq.updated_at asc, eq.id asc
      )
      from public.extra_questions eq
      where p_since is null or eq.updated_at > p_since
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_extra_questions_since(timestamptz) from public, anon;
grant execute on function public.get_extra_questions_since(timestamptz) to authenticated;

-- ============================================================================
-- 7. pair_ai_reports に locale カラムと複合インデックスを追加 + get_pair_entitlement 拡張
-- ============================================================================

alter table public.pair_ai_reports
  add column if not exists locale text not null default 'ja';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pair_ai_reports_locale_check'
      and conrelid = 'public.pair_ai_reports'::regclass
  ) then
    alter table public.pair_ai_reports
      add constraint pair_ai_reports_locale_check
      check (locale in ('ja', 'en', 'fr', 'ko', 'ru', 'th', 'zh-Hans', 'zh-Hant'));
  end if;
end $$;

create index if not exists idx_pair_ai_reports_pair_locale_created
  on public.pair_ai_reports (pair_id, locale, created_at desc);

create or replace function public.get_pair_entitlement(p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pair public.pairs;
  v_today date;
  v_pair_start_date date;
  v_my_sub public.user_subscriptions;
  v_partner_sub public.user_subscriptions;
  v_active_sub public.user_subscriptions;
  v_paid_by_me boolean := false;
  v_paid_by_partner boolean := false;
  v_is_premium boolean := false;
  v_revealed_days int := 0;
  v_past_partner_only_days int := 0;
  v_past_any_partial_days int := 0;
  v_past_unanswered_days int := 0;
  v_analyzable_days int := 0;
  v_target_locale text;
  v_latest_report jsonb := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_locale in ('ja', 'en', 'fr', 'ko', 'ru', 'th', 'zh-Hans', 'zh-Hant') then
    v_target_locale := p_locale;
  else
    select locale into v_target_locale
    from public.profiles
    where id = v_uid;
    v_target_locale := coalesce(v_target_locale, 'ja');
  end if;

  select * into v_my_sub
  from public.user_subscriptions
  where user_id = v_uid;

  v_paid_by_me :=
    v_my_sub.user_id is not null
    and v_my_sub.status in ('active', 'grace_period')
    and (v_my_sub.expires_at is null or v_my_sub.expires_at > now());

  select p.* into v_pair
  from public.pair_members pm
  join public.pairs p on p.id = pm.pair_id
  where pm.user_id = v_uid;

  if v_pair.id is not null then
    v_today := public.today_in_pair_tz(v_pair.id);
    v_pair_start_date := least(
      v_today,
      (v_pair.created_at AT TIME ZONE coalesce(v_pair.timezone, 'Asia/Tokyo'))::date,
      coalesce(
        (select min(ds.quiz_date) from public.daily_sets ds where ds.pair_id = v_pair.id),
        v_today
      )
    );

    select us.* into v_partner_sub
    from public.pair_members pm
    join public.user_subscriptions us on us.user_id = pm.user_id
    where pm.pair_id = v_pair.id
      and pm.user_id <> v_uid
    limit 1;

    v_paid_by_partner :=
      v_partner_sub.user_id is not null
      and v_partner_sub.status in ('active', 'grace_period')
      and (v_partner_sub.expires_at is null or v_partner_sub.expires_at > now());

    select count(*) into v_revealed_days
    from public.daily_sets ds
    where ds.pair_id = v_pair.id
      and public.is_revealed(ds.pair_id, ds.quiz_date);

    select count(*) into v_past_partner_only_days
    from public.daily_sets ds
    where ds.pair_id = v_pair.id
      and ds.quiz_date < v_today
      and not public.is_revealed(ds.pair_id, ds.quiz_date)
      and exists (
        select 1
        from public.answers a
        where a.pair_id = ds.pair_id
          and a.quiz_date = ds.quiz_date
          and a.user_id <> v_uid
          and a.question_id = any(ds.question_ids)
      );

    select count(*) into v_past_any_partial_days
    from public.daily_sets ds
    where ds.pair_id = v_pair.id
      and ds.quiz_date < v_today
      and not public.is_revealed(ds.pair_id, ds.quiz_date)
      and exists (
        select 1
        from public.answers a
        where a.pair_id = ds.pair_id
          and a.quiz_date = ds.quiz_date
          and a.question_id = any(ds.question_ids)
      );

    with my_completed_dates as (
      select ds.quiz_date
      from public.daily_sets ds
      join public.answers a
        on a.pair_id = ds.pair_id
       and a.quiz_date = ds.quiz_date
       and a.user_id = v_uid
       and a.question_id = any(ds.question_ids)
      where ds.pair_id = v_pair.id
        and ds.quiz_date < v_today
        and coalesce(array_length(ds.question_ids, 1), 0) > 0
      group by ds.quiz_date, ds.question_ids
      having count(distinct a.question_id) >= array_length(ds.question_ids, 1)
    )
    select count(*)
    into v_past_unanswered_days
    from pg_catalog.generate_series(0, (v_today - v_pair_start_date) - 1) as gs(off)
    where not exists (
      select 1
      from my_completed_dates m
      where m.quiz_date = v_pair_start_date + gs.off
    );
  end if;

  v_is_premium := v_paid_by_me or v_paid_by_partner;
  v_analyzable_days :=
    case
      when v_is_premium then v_revealed_days + v_past_any_partial_days
      else v_revealed_days
    end;

  if v_paid_by_me then
    v_active_sub := v_my_sub;
  elsif v_paid_by_partner then
    v_active_sub := v_partner_sub;
  else
    v_active_sub := v_my_sub;
  end if;

  if v_is_premium and v_pair.id is not null then
    select jsonb_build_object(
      'id', r.id,
      'locale', r.locale,
      'analyzed_days', r.analyzed_days,
      'analyzed_answers', r.analyzed_answers,
      'model_used', r.model_used,
      'created_at', r.created_at,
      'report', r.report_json
    )
    into v_latest_report
    from public.pair_ai_reports r
    where r.pair_id = v_pair.id
      and r.locale = v_target_locale
      and coalesce(r.report_json->>'reportType', 'compatibility') <> 'breakup_reflection'
    order by r.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'has_pair', v_pair.id is not null,
    'is_premium', v_is_premium,
    'paid_by_me', v_paid_by_me,
    'paid_by_partner', v_paid_by_partner,
    'status', coalesce(v_active_sub.status, 'inactive'),
    'product_id', v_active_sub.product_id,
    'expires_at', v_active_sub.expires_at,
    'will_renew', coalesce(v_active_sub.will_renew, false),
    'pair_start_date', v_pair_start_date,
    'revealed_days_count', v_revealed_days,
    'past_partner_only_days_count', v_past_partner_only_days,
    'past_unanswered_days_count', v_past_unanswered_days,
    'analyzable_days_count', v_analyzable_days,
    'latest_report', v_latest_report
  );
end;
$$;

revoke all on function public.get_pair_entitlement(text) from public, anon;
grant execute on function public.get_pair_entitlement(text) to authenticated;

create or replace function public.get_pair_entitlement()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_pair_entitlement(null::text);
$$;

revoke all on function public.get_pair_entitlement() from public, anon;
grant execute on function public.get_pair_entitlement() to authenticated;
