-- 機能追加: 課金ペア限定で「自分が未回答だった過去日の相手の回答」を閲覧＆AI診断に含める
-- 対象: Supabase (PostgreSQL)

-- ============================================================================
-- 1. 相手の回答を閲覧可能か判定するヘルパー関数
--    - 双方全問回答完了 (is_revealed): 無料・有料問わず、今日・過去日問わず閲覧可
--    - 過去日 (quiz_date < today) かつ ペアが課金済み (is_pair_premium): 自分未回答でも閲覧可
--    - 今日 (quiz_date >= today): 後出し防止のため課金済みでも双方完了まで非公開
-- ============================================================================

create or replace function public.can_view_partner_answers(p_pair_id uuid, p_quiz_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_pair_member(p_pair_id)
    and (
      public.is_revealed(p_pair_id, p_quiz_date)
      or (
        p_quiz_date < public.today_in_pair_tz(p_pair_id)
        and public.is_pair_premium(p_pair_id)
      )
    );
$$;

revoke all on function public.can_view_partner_answers(uuid, date) from public, anon;
grant execute on function public.can_view_partner_answers(uuid, date) to authenticated;

-- ============================================================================
-- 2. answers テーブルの SELECT RLS ポリシーを更新
-- ============================================================================

alter policy "answers_select_self_or_revealed"
  on public.answers
  using (
    user_id = (select auth.uid())
    or public.can_view_partner_answers(pair_id, quiz_date)
  );

-- ============================================================================
-- 3. 再出題時の過去比較 RPC を更新
--    - 課金ペアなら、過去日に自分が未回答でも相手の過去回答を返却する
-- ============================================================================

create or replace function public.get_past_question_history(
  p_question_ids text[],
  p_before_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid;
  v_cutoff date;
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

  v_cutoff := coalesce(p_before_date, public.today_in_pair_tz(v_pair_id));

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_result
  from (
    select distinct on (a_partner.question_id)
      jsonb_build_object(
        'question_id', a_partner.question_id,
        'quiz_date', a_partner.quiz_date,
        'my_answer', a_me.direction,
        'partner_answer', a_partner.direction
      ) as item
    from public.answers a_partner
    left join public.answers a_me
      on a_me.pair_id = a_partner.pair_id
     and a_me.quiz_date = a_partner.quiz_date
     and a_me.question_id = a_partner.question_id
     and a_me.user_id = v_uid
    where a_partner.pair_id = v_pair_id
      and a_partner.user_id <> v_uid
      and a_partner.quiz_date < v_cutoff
      and a_partner.question_id = any(p_question_ids)
      and public.can_view_partner_answers(v_pair_id, a_partner.quiz_date)
    order by a_partner.question_id, a_partner.quiz_date desc
  ) sub;

  return v_result;
end;
$$;

-- ============================================================================
-- 4. 履歴タイムライン RPC を更新
--    - 双方完了日 (is_revealed = true): 無料・有料ともに全回答返却
--    - 過去日かつ未完了で相手に回答がある場合:
--      * 課金ペア: is_premium_unlocked = true として相手の回答を含めて返却
--      * 無料ペア: is_locked_past_day = true として件数のみ返却（回答内容は秘匿）
-- ============================================================================

create or replace function public.get_pair_history(
  p_limit int default 30,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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
        when d.is_revealed or (d.is_past_day and v_is_premium) then
          jsonb_build_object(
            'quiz_date', d.quiz_date,
            'question_ids', d.question_ids,
            'is_revealed', d.is_revealed,
            'is_premium_unlocked', (not d.is_revealed and d.is_past_day and v_is_premium),
            'is_locked_past_day', false,
            'partner_answered_count', d.partner_answered_count,
            'answers', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'question_id', u.q_id,
                  'my_answer', a_me.direction,
                  'partner_answer', a_partner.direction
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
          -- 無料ペアの過去未回答日: 相手の回答内容は一切返さず、件数とロック状態のみ返す
          jsonb_build_object(
            'quiz_date', d.quiz_date,
            'question_ids', d.question_ids,
            'is_revealed', false,
            'is_premium_unlocked', false,
            'is_locked_past_day', true,
            'partner_answered_count', d.partner_answered_count,
            'answers', '[]'::jsonb
          )
      end as day_row
    from (
      select
        ds.pair_id,
        ds.quiz_date,
        ds.question_ids,
        (ds.quiz_date < v_today) as is_past_day,
        public.is_revealed(ds.pair_id, ds.quiz_date) as is_revealed,
        (
          select count(distinct a.question_id)
          from public.answers a
          where a.pair_id = ds.pair_id
            and a.quiz_date = ds.quiz_date
            and a.user_id <> v_uid
            and a.question_id = any(ds.question_ids)
        ) as partner_answered_count
      from public.daily_sets ds
      where ds.pair_id = v_pair_id
    ) d
    where d.is_revealed
       or (d.is_past_day and d.partner_answered_count > 0)
    order by d.quiz_date desc
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, p_offset)
  ) sub;

  return v_result;
end;
$$;

-- ============================================================================
-- 5. get_pair_entitlement RPC を拡張
--    - 未回答の過去日（相手に回答あり）の日数と AI 分析対象日数を返却
-- ============================================================================

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
  v_today date;
  v_my_sub public.user_subscriptions;
  v_partner_sub public.user_subscriptions;
  v_active_sub public.user_subscriptions;
  v_paid_by_me boolean := false;
  v_paid_by_partner boolean := false;
  v_is_premium boolean := false;
  v_revealed_days int := 0;
  v_past_partner_only_days int := 0;
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
  end if;

  v_is_premium := v_paid_by_me or v_paid_by_partner;
  v_analyzable_days :=
    case
      when v_is_premium then v_revealed_days + v_past_partner_only_days
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
    'analyzable_days_count', v_analyzable_days,
    'latest_report', v_latest_report
  );
end;
$$;
