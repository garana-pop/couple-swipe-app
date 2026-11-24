-- 機能追加: 回答カレンダー用サマリー RPC、過去日オンデマンド出題（課金限定）、ペア開始日ベースの未回答日数集計
-- 対象: Supabase (PostgreSQL)

-- ============================================================================
-- 1. get_pair_state RPC を拡張
--    - pair_start_date（ペア作成日と最古出題日の早い方）を追加
--    - is_premium（ペア共有プレミアム状態）を追加
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

  select display_name into v_my_name
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
      'today_date', (now() AT TIME ZONE 'Asia/Tokyo')::date,
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
-- 2. 回答カレンダー用の軽量日別サマリー RPC
--    - 回答内容（direction）は一切返さず、完了状態・回答数のみ全期間分を返却
-- ============================================================================

create or replace function public.get_pair_calendar_summary()
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
  v_is_premium boolean := false;
  v_member_count int := 0;
  v_days jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select p.* into v_pair
  from public.pair_members pm
  join public.pairs p on p.id = pm.pair_id
  where pm.user_id = v_uid;

  if v_pair.id is null then
    return jsonb_build_object(
      'has_pair', false,
      'pair_start_date', null,
      'today_date', (now() AT TIME ZONE 'Asia/Tokyo')::date,
      'is_premium', false,
      'days', '[]'::jsonb
    );
  end if;

  v_today := public.today_in_pair_tz(v_pair.id);
  v_is_premium := public.is_pair_premium(v_pair.id);

  select count(*) into v_member_count
  from public.pair_members pm
  where pm.pair_id = v_pair.id;

  v_pair_start_date := least(
    v_today,
    (v_pair.created_at AT TIME ZONE coalesce(v_pair.timezone, 'Asia/Tokyo'))::date,
    coalesce(
      (select min(ds.quiz_date) from public.daily_sets ds where ds.pair_id = v_pair.id),
      v_today
    )
  );

  with my_ans as (
    select a.quiz_date, count(distinct a.question_id) as cnt
    from public.answers a
    join public.daily_sets ds
      on ds.pair_id = a.pair_id
     and ds.quiz_date = a.quiz_date
    where a.pair_id = v_pair.id
      and a.user_id = v_uid
      and a.question_id = any(ds.question_ids)
    group by a.quiz_date
  ),
  partner_ans as (
    select a.quiz_date, count(distinct a.question_id) as cnt
    from public.answers a
    join public.daily_sets ds
      on ds.pair_id = a.pair_id
     and ds.quiz_date = a.quiz_date
    where a.pair_id = v_pair.id
      and a.user_id <> v_uid
      and a.question_id = any(ds.question_ids)
    group by a.quiz_date
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'quiz_date', ds.quiz_date,
      'total_questions', coalesce(array_length(ds.question_ids, 1), 0),
      'my_answered_count', coalesce(ma.cnt, 0),
      'partner_answered_count', coalesce(pa.cnt, 0),
      'is_my_completed', (
        coalesce(array_length(ds.question_ids, 1), 0) > 0
        and coalesce(ma.cnt, 0) >= coalesce(array_length(ds.question_ids, 1), 0)
      ),
      'is_partner_completed', (
        v_member_count >= 2
        and coalesce(array_length(ds.question_ids, 1), 0) > 0
        and coalesce(pa.cnt, 0) >= coalesce(array_length(ds.question_ids, 1), 0)
      ),
      'is_revealed', (
        v_member_count >= 2
        and coalesce(array_length(ds.question_ids, 1), 0) > 0
        and coalesce(ma.cnt, 0) >= coalesce(array_length(ds.question_ids, 1), 0)
        and coalesce(pa.cnt, 0) >= coalesce(array_length(ds.question_ids, 1), 0)
      )
    )
    order by ds.quiz_date desc
  ), '[]'::jsonb)
  into v_days
  from public.daily_sets ds
  left join my_ans ma on ma.quiz_date = ds.quiz_date
  left join partner_ans pa on pa.quiz_date = ds.quiz_date
  where ds.pair_id = v_pair.id
    and coalesce(array_length(ds.question_ids, 1), 0) > 0;

  return jsonb_build_object(
    'has_pair', true,
    'pair_start_date', v_pair_start_date,
    'today_date', v_today,
    'is_premium', v_is_premium,
    'days', v_days
  );
end;
$$;

revoke all on function public.get_pair_calendar_summary() from public, anon;
grant execute on function public.get_pair_calendar_summary() to authenticated;

-- ============================================================================
-- 3. 過去の未回答日用出題セット取得・作成 RPC（新規作成はプレミアムペア限定）
--    - 誰もアプリを開かなかった過去日でも、ペア作成日以降〜昨日までであれば
--      課金ユーザーはカレンダーから遡って3問を生成・回答できる
-- ============================================================================

create or replace function public.get_or_create_past_daily_set(
  p_quiz_date date,
  p_question_pool text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pair public.pairs;
  v_today date;
  v_pair_start_date date;
  v_set public.daily_sets;
  v_selected text[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select p.* into v_pair
  from public.pair_members pm
  join public.pairs p on p.id = pm.pair_id
  where pm.user_id = v_uid;

  if v_pair.id is null then
    raise exception 'NOT_IN_PAIR';
  end if;

  v_today := public.today_in_pair_tz(v_pair.id);
  v_pair_start_date := least(
    v_today,
    (v_pair.created_at AT TIME ZONE coalesce(v_pair.timezone, 'Asia/Tokyo'))::date,
    coalesce(
      (select min(ds.quiz_date) from public.daily_sets ds where ds.pair_id = v_pair.id),
      v_today
    )
  );

  if p_quiz_date is null or p_quiz_date >= v_today or p_quiz_date < v_pair_start_date then
    raise exception 'INVALID_PAST_DATE';
  end if;

  select * into v_set
  from public.daily_sets
  where pair_id = v_pair.id
    and quiz_date = p_quiz_date;

  if v_set.id is null then
    if not public.is_pair_premium(v_pair.id) then
      raise exception 'PREMIUM_REQUIRED';
    end if;

    with pool as (
      select distinct q_id
      from (
        select unnest(coalesce(p_question_pool, array[]::text[])) as q_id
        union
        select id as q_id from public.extra_questions where is_active = true
      ) combined
      where q_id is not null and q_id <> ''
    ),
    last_asked as (
      select a_q.q_id, max(ds.quiz_date) as last_date
      from public.daily_sets ds
      cross join lateral unnest(ds.question_ids) as a_q(q_id)
      where ds.pair_id = v_pair.id
      group by a_q.q_id
    ),
    nostalgic_pick as (
      select p.q_id
      from pool p
      join last_asked la on la.q_id = p.q_id
      where la.last_date <= v_today - 90
      order by la.last_date asc, random()
      limit 1
    ),
    primary_picks as (
      select p.q_id
      from pool p
      left join last_asked la on la.q_id = p.q_id
      where p.q_id not in (select q_id from nostalgic_pick)
      order by
        case
          when la.last_date is null then 0
          when la.last_date <= v_today - 90 then 1
          else 2
        end asc,
        la.last_date asc nulls first,
        random()
      limit (3 - (select count(*) from nostalgic_pick))
    ),
    final_picks as (
      select q_id from primary_picks
      union all
      select q_id from nostalgic_pick
    )
    select array_agg(q_id order by random()) into v_selected from final_picks;

    if v_selected is null or array_length(v_selected, 1) = 0 then
      raise exception 'EMPTY_QUESTION_POOL';
    end if;

    insert into public.daily_sets (pair_id, quiz_date, question_ids)
    values (v_pair.id, p_quiz_date, v_selected)
    on conflict (pair_id, quiz_date) do nothing;

    select * into v_set
    from public.daily_sets
    where pair_id = v_pair.id
      and quiz_date = p_quiz_date;
  end if;

  update public.pairs
  set last_active_at = now()
  where id = v_pair.id;

  return jsonb_build_object(
    'id', v_set.id,
    'pair_id', v_set.pair_id,
    'quiz_date', v_set.quiz_date,
    'question_ids', v_set.question_ids
  );
end;
$$;

revoke all on function public.get_or_create_past_daily_set(date, text[]) from public, anon;
grant execute on function public.get_or_create_past_daily_set(date, text[]) to authenticated;

-- ============================================================================
-- 4. get_pair_entitlement RPC を更新
--    - past_unanswered_days_count をペア開始日〜昨日の全未回答日数と一致させる
--    - pair_start_date を返却に追加
-- ============================================================================

create or replace function public.get_pair_entitlement()
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
      'analyzed_days', r.analyzed_days,
      'analyzed_answers', r.analyzed_answers,
      'model_used', r.model_used,
      'created_at', r.created_at,
      'report', r.report_json
    )
    into v_latest_report
    from public.pair_ai_reports r
    where r.pair_id = v_pair.id
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

revoke all on function public.get_pair_entitlement() from public, anon;
grant execute on function public.get_pair_entitlement() to authenticated;
