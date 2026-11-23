-- 機能追加: 課金ペア限定で「過去に出題された日の未回答の質問」に後から回答できる機能
-- 対象: Supabase (PostgreSQL)
--
-- 仕様:
--   1. ペアのどちらかがプレミアム課金中なら、過去日 (quiz_date < today) の daily_sets にある
--      自分の未回答の質問に対して answers を INSERT できる（今日より未来の日付・回答済み質問の上書きは不可）。
--   2. ネタバレ防止のため、過去日であっても自分がその日の全問を回答完了するまでは
--      相手の回答を SELECT / 履歴返却で伏せる（回答完了と同時に相手の回答・一致率を公開）。
--   3. 当日 (quiz_date = today) は課金有無にかかわらず双方全問完了まで相手の回答を厳密に非公開。

-- ============================================================================
-- 1. 自分が指定日の全問を回答済みか判定するヘルパー関数
-- ============================================================================

create or replace function public.is_my_day_completed(p_pair_id uuid, p_quiz_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_pair_member(p_pair_id)
    and exists (
      select 1
      from public.daily_sets ds
      where ds.pair_id = p_pair_id
        and ds.quiz_date = p_quiz_date
        and coalesce(array_length(ds.question_ids, 1), 0) > 0
        and (
          select count(distinct a.question_id)
          from public.answers a
          where a.pair_id = ds.pair_id
            and a.quiz_date = ds.quiz_date
            and a.user_id = (select auth.uid())
            and a.question_id = any(ds.question_ids)
        ) >= array_length(ds.question_ids, 1)
    );
$$;

revoke all on function public.is_my_day_completed(uuid, date) from public, anon;
grant execute on function public.is_my_day_completed(uuid, date) to authenticated;

-- ============================================================================
-- 2. 相手の回答を閲覧可能か判定するヘルパー関数を更新（ネタバレ防止対応）
--    - 双方全問完了 (is_revealed): 無料・有料問わず、今日・過去日問わず閲覧可
--    - 過去日かつ課金ペアかつ自分がその日を回答完了済み: 相手が途中回答でも閲覧可
--    - 自分が未回答の過去日・未完了の当日: 非公開（回答完了で即解放）
-- ============================================================================

create or replace function public.can_view_partner_answers(p_pair_id uuid, p_quiz_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_pair_member(p_pair_id)
    and (
      public.is_revealed(p_pair_id, p_quiz_date)
      or (
        p_quiz_date < public.today_in_pair_tz(p_pair_id)
        and public.is_pair_premium(p_pair_id)
        and public.is_my_day_completed(p_pair_id, p_quiz_date)
      )
    );
$$;

revoke all on function public.can_view_partner_answers(uuid, date) from public, anon;
grant execute on function public.can_view_partner_answers(uuid, date) to authenticated;

-- ============================================================================
-- 3. answers テーブルの INSERT RLS ポリシーを更新
--    - 無料ペア: 今日の出題のみ INSERT 可
--    - 課金ペア: 今日 または 過去日 (quiz_date < today) の既存 daily_sets への INSERT 可
--    - 未来日 / 既存回答の上書き (UPDATE/DELETE) / 他人の user_id は引き続き不可
-- ============================================================================

alter policy "answers_insert_own_today"
  on public.answers
  with check (
    user_id = (select auth.uid())
    and public.is_pair_member(pair_id)
    and (
      quiz_date = public.today_in_pair_tz(pair_id)
      or (
        quiz_date < public.today_in_pair_tz(pair_id)
        and public.is_pair_premium(pair_id)
      )
    )
    and exists (
      select 1
      from public.daily_sets ds
      where ds.pair_id = answers.pair_id
        and ds.quiz_date = answers.quiz_date
        and answers.question_id = any(ds.question_ids)
    )
  );

-- ============================================================================
-- 4. 履歴タイムライン RPC を更新
--    - 双方完了日 (今日含む) + 過去に出題された全日 (片方未回答・双方未回答含む) を返却
--    - 自分が未完了の過去日: 課金ペアには can_answer_past_day = true を返し、
--      ネタバレ防止のため answers は空配列で返却（回答完了後に相手回答・一致率を表示）
--    - 無料ペアの未完了過去日: is_locked_past_day = true, answers = [] で返却
-- ============================================================================

create or replace function public.get_pair_history(
  p_limit int default 30,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pair_id uuid;
  v_today date;
  v_is_premium boolean := false;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select pair_id into v_pair_id
  from public.pair_members
  where user_id = v_uid;

  if v_pair_id is null then
    return '[]'::jsonb;
  end if;

  v_today := public.today_in_pair_tz(v_pair_id);
  v_is_premium := public.is_pair_premium(v_pair_id);

  select coalesce(jsonb_agg(day_row), '[]'::jsonb)
  into v_result
  from (
    select
      case
        when d.is_revealed or d.is_my_completed then
          jsonb_build_object(
            'quiz_date', d.quiz_date,
            'question_ids', d.question_ids,
            'total_questions', d.total_questions,
            'my_answered_count', d.my_answered_count,
            'partner_answered_count', d.partner_answered_count,
            'is_my_completed', d.is_my_completed,
            'is_partner_completed', d.is_partner_completed,
            'is_revealed', d.is_revealed,
            'is_premium_unlocked', (
              not d.is_revealed
              and d.is_past_day
              and v_is_premium
              and d.is_my_completed
              and d.partner_answered_count > 0
            ),
            'can_answer_past_day', false,
            'is_locked_past_day', false,
            'answers', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'question_id', u.q_id,
                  'my_answer', a_me.direction,
                  'partner_answer', case
                    when d.is_revealed or (d.is_past_day and v_is_premium and d.is_my_completed)
                      then a_partner.direction
                    else null
                  end
                )
                order by u.ord
              ), '[]'::jsonb)
              from unnest(d.question_ids) with ordinality as u(q_id, ord)
              left join public.answers a_me
                on a_me.pair_id = d.pair_id
               and a_me.quiz_date = d.quiz_date
               and a_me.question_id = u.q_id
               and a_me.user_id = v_uid
              left join public.answers a_partner
                on a_partner.pair_id = d.pair_id
               and a_partner.quiz_date = d.quiz_date
               and a_partner.question_id = u.q_id
               and a_partner.user_id <> v_uid
            )
          )
        else
          -- 自分が未完了の過去日:
          --   課金ペアは can_answer_past_day = true（ネタバレ防止のため回答内容は返さない）
          --   無料ペアは is_locked_past_day = true
          jsonb_build_object(
            'quiz_date', d.quiz_date,
            'question_ids', d.question_ids,
            'total_questions', d.total_questions,
            'my_answered_count', d.my_answered_count,
            'partner_answered_count', d.partner_answered_count,
            'is_my_completed', false,
            'is_partner_completed', d.is_partner_completed,
            'is_revealed', false,
            'is_premium_unlocked', false,
            'can_answer_past_day', (d.is_past_day and v_is_premium),
            'is_locked_past_day', (d.is_past_day and not v_is_premium),
            'answers', '[]'::jsonb
          )
      end as day_row
    from (
      select
        ds.pair_id,
        ds.quiz_date,
        ds.question_ids,
        coalesce(array_length(ds.question_ids, 1), 0) as total_questions,
        (ds.quiz_date < v_today) as is_past_day,
        public.is_revealed(ds.pair_id, ds.quiz_date) as is_revealed,
        (
          select count(distinct a.question_id)
          from public.answers a
          where a.pair_id = ds.pair_id
            and a.quiz_date = ds.quiz_date
            and a.user_id = v_uid
            and a.question_id = any(ds.question_ids)
        ) as my_answered_count,
        (
          select count(distinct a.question_id)
          from public.answers a
          where a.pair_id = ds.pair_id
            and a.quiz_date = ds.quiz_date
            and a.user_id <> v_uid
            and a.question_id = any(ds.question_ids)
        ) as partner_answered_count,
        (
          coalesce(array_length(ds.question_ids, 1), 0) > 0
          and (
            select count(distinct a.question_id)
            from public.answers a
            where a.pair_id = ds.pair_id
              and a.quiz_date = ds.quiz_date
              and a.user_id = v_uid
              and a.question_id = any(ds.question_ids)
          ) >= coalesce(array_length(ds.question_ids, 1), 0)
        ) as is_my_completed,
        (
          coalesce(array_length(ds.question_ids, 1), 0) > 0
          and (
            select count(distinct a.question_id)
            from public.answers a
            where a.pair_id = ds.pair_id
              and a.quiz_date = ds.quiz_date
              and a.user_id <> v_uid
              and a.question_id = any(ds.question_ids)
          ) >= coalesce(array_length(ds.question_ids, 1), 0)
        ) as is_partner_completed
      from public.daily_sets ds
      where ds.pair_id = v_pair_id
    ) d
    where d.total_questions > 0
      and (d.is_revealed or d.is_past_day)
    order by d.quiz_date desc
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, p_offset)
  ) sub;

  return v_result;
end;
$$;

-- ============================================================================
-- 5. get_pair_entitlement RPC を拡張
--    - past_unanswered_days_count（自分が未完了の過去日数）を追加
--    - analyzable_days_count に過去日の片方回答（自分・相手問わず）を反映
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
  v_pair_id uuid;
  v_today date;
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

  select pair_id into v_pair_id
  from public.pair_members
  where user_id = v_uid;

  if v_pair_id is not null then
    v_today := public.today_in_pair_tz(v_pair_id);

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

    select count(*) into v_past_partner_only_days
    from public.daily_sets ds
    where ds.pair_id = v_pair_id
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
    where ds.pair_id = v_pair_id
      and ds.quiz_date < v_today
      and not public.is_revealed(ds.pair_id, ds.quiz_date)
      and exists (
        select 1
        from public.answers a
        where a.pair_id = ds.pair_id
          and a.quiz_date = ds.quiz_date
          and a.question_id = any(ds.question_ids)
      );

    select count(*) into v_past_unanswered_days
    from public.daily_sets ds
    where ds.pair_id = v_pair_id
      and ds.quiz_date < v_today
      and coalesce(array_length(ds.question_ids, 1), 0) > 0
      and not public.is_my_day_completed(ds.pair_id, ds.quiz_date);
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
    'past_partner_only_days_count', v_past_partner_only_days,
    'past_unanswered_days_count', v_past_unanswered_days,
    'analyzable_days_count', v_analyzable_days,
    'latest_report', v_latest_report
  );
end;
$$;
