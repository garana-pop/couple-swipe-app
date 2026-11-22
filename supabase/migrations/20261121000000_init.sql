-- ふたりスワイプ (Couple Swipe App) 初期スキーマ
-- 対象: Supabase (PostgreSQL)

-- ============================================================================
-- 1. テーブル定義
-- ============================================================================

-- ユーザープロフィール（匿名認証からGoogle連携への昇格時もID・表示名を維持）
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'あなた',
  expo_push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ペア本体
create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  invite_expires_at timestamptz not null default (now() + interval '7 days'),
  timezone text not null default 'Asia/Tokyo',
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_pairs_last_active_at
  on public.pairs (last_active_at);

-- ペアとユーザーの対応（user_id UNIQUE 制約で 1ユーザー1ペアに制限）
create table if not exists public.pair_members (
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (pair_id, user_id)
);

-- 招待コード推測対策の試行ログ
create table if not exists public.pair_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_pair_join_attempts_user_time
  on public.pair_join_attempts (user_id, attempted_at desc);

-- 日ごとの出題セット（サーバー確定の日付とペアIDに対して1日1レコード）
create table if not exists public.daily_sets (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  quiz_date date not null,
  question_ids text[] not null,
  created_at timestamptz not null default now(),
  unique (pair_id, quiz_date)
);

-- 回答（1問1行、UPDATE / DELETE 禁止で改ざん・後出し変更を防止）
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  quiz_date date not null,
  question_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('UP', 'DOWN', 'LEFT', 'RIGHT')),
  created_at timestamptz not null default now(),
  unique (pair_id, quiz_date, question_id, user_id)
);

create index if not exists idx_answers_pair_date
  on public.answers (pair_id, quiz_date);

create index if not exists idx_answers_pair_question_date
  on public.answers (pair_id, question_id, quiz_date desc);

create index if not exists idx_answers_user_id
  on public.answers (user_id);

-- ============================================================================
-- 2. ヘルパー関数（RLS・日付・公開判定）
-- ============================================================================

-- ペアの基準タイムゾーンにおける「今日」の日付を返す（初期値 Asia/Tokyo）
create or replace function public.today_in_pair_tz(p_pair_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (
    now() AT TIME ZONE coalesce(
      (select timezone from public.pairs where id = p_pair_id),
      'Asia/Tokyo'
    )
  )::date;
$$;

-- 呼び出しユーザーが指定ペアのメンバーかどうか
create or replace function public.is_pair_member(p_pair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = p_pair_id
      and pm.user_id = (select auth.uid())
  );
$$;

-- 指定ペア・日付の両者の全問回答が完了しているか（相手が答えるまで隠す判定）
create or replace function public.is_revealed(p_pair_id uuid, p_quiz_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total int;
  v_member_count int;
  v_completed_members int;
begin
  if not public.is_pair_member(p_pair_id) then
    return false;
  end if;

  select coalesce(array_length(ds.question_ids, 1), 0)
    into v_total
  from public.daily_sets ds
  where ds.pair_id = p_pair_id
    and ds.quiz_date = p_quiz_date;

  if v_total is null or v_total <= 0 then
    return false;
  end if;

  select count(*)
    into v_member_count
  from public.pair_members pm
  where pm.pair_id = p_pair_id;

  if v_member_count < 2 then
    return false;
  end if;

  select count(*)
    into v_completed_members
  from (
    select a.user_id
    from public.answers a
    join public.daily_sets ds
      on ds.pair_id = a.pair_id
     and ds.quiz_date = a.quiz_date
    where a.pair_id = p_pair_id
      and a.quiz_date = p_quiz_date
      and a.question_id = any(ds.question_ids)
    group by a.user_id
    having count(distinct a.question_id) >= v_total
  ) sub;

  return v_completed_members >= 2;
end;
$$;

-- 招待コード生成用（紛らわしい 0/O/1/I/L を除外した8文字）
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  i int;
begin
  v_bytes := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    v_code := v_code || substr(v_chars, (get_byte(v_bytes, i) % length(v_chars)) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- ============================================================================
-- 3. Row Level Security (RLS)
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.pair_join_attempts enable row level security;
alter table public.daily_sets enable row level security;
alter table public.answers enable row level security;

-- profiles: 自分自身 または 同じペアの相手のみ閲覧可能、更新は自分のみ
create policy "profiles_select_self_or_partner"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.pair_members pm_me
      join public.pair_members pm_partner on pm_me.pair_id = pm_partner.pair_id
      where pm_me.user_id = (select auth.uid())
        and pm_partner.user_id = profiles.id
    )
  );

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- pairs: 所属メンバーのみ参照可能（作成・更新・削除は RPC 経由）
create policy "pairs_select_member"
  on public.pairs for select
  to authenticated
  using (public.is_pair_member(id));

-- pair_members: 同じペアのメンバーのみ参照可能
create policy "pair_members_select_member"
  on public.pair_members for select
  to authenticated
  using (public.is_pair_member(pair_id));

-- daily_sets: 所属ペアの出題のみ参照可能
create policy "daily_sets_select_member"
  on public.daily_sets for select
  to authenticated
  using (public.is_pair_member(pair_id));

-- answers:
--   SELECT: 自分の回答、または両者全問完了後（is_revealed = true）のペアの回答のみ
--   INSERT: 本人の今日の出題に対する回答のみ
--   UPDATE / DELETE: ポリシーを作成しない（回答変更不可）
create policy "answers_select_self_or_revealed"
  on public.answers for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.is_pair_member(pair_id)
      and public.is_revealed(pair_id, quiz_date)
    )
  );

create policy "answers_insert_own_today"
  on public.answers for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_pair_member(pair_id)
    and quiz_date = public.today_in_pair_tz(pair_id)
    and exists (
      select 1
      from public.daily_sets ds
      where ds.pair_id = answers.pair_id
        and ds.quiz_date = answers.quiz_date
        and answers.question_id = any(ds.question_ids)
    )
  );

-- ============================================================================
-- 4. RPC 関数
-- ============================================================================

-- プロフィール初期化・表示名更新
create or replace function public.upsert_profile(p_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_name := nullif(trim(p_display_name), '');
  if v_name is null then
    v_name := 'あなた';
  end if;
  if char_length(v_name) > 20 then
    v_name := left(v_name, 20);
  end if;

  insert into public.profiles (id, display_name, updated_at)
  values (v_uid, v_name, now())
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

-- ペア作成（既にペア所属中の場合はエラー）
create or replace function public.create_pair(p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair public.pairs;
  v_code text;
  v_tries int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- プロフィール確保
  insert into public.profiles (id, display_name)
  values (v_uid, coalesce(nullif(trim(p_display_name), ''), 'あなた'))
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(p_display_name), ''), profiles.display_name),
        updated_at = now();

  if exists (select 1 from public.pair_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_PAIR';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_invite_code();
    begin
      insert into public.pairs (invite_code, invite_expires_at)
      values (v_code, now() + interval '7 days')
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

-- 招待コード再発行（有効期限切れやリセット用）
create or replace function public.regenerate_invite_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid;
  v_code text;
  v_expires timestamptz := now() + interval '7 days';
  v_tries int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select pair_id into v_pair_id
  from public.pair_members
  where user_id = v_uid;

  if v_pair_id is null then
    raise exception 'NOT_IN_PAIR';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_invite_code();
    begin
      update public.pairs
      set invite_code = v_code,
          invite_expires_at = v_expires,
          last_active_at = now()
      where id = v_pair_id;
      exit;
    exception when unique_violation then
      if v_tries >= 10 then
        raise exception 'FAILED_TO_GENERATE_CODE';
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'pair_id', v_pair_id,
    'invite_code', v_code,
    'invite_expires_at', v_expires
  );
end;
$$;

-- 招待コードでペア参加（試行回数制限・有効期限・2人上限・1人1ペア制約）
create or replace function public.join_pair(p_invite_code text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_code text;
  v_recent_attempts int;
  v_pair public.pairs;
  v_member_count int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- プロフィール確保
  insert into public.profiles (id, display_name)
  values (v_uid, coalesce(nullif(trim(p_display_name), ''), 'あなた'))
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(p_display_name), ''), profiles.display_name),
        updated_at = now();

  if exists (select 1 from public.pair_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_PAIR';
  end if;

  -- 15分以内に5回以上の試行はレート制限
  select count(*)
    into v_recent_attempts
  from public.pair_join_attempts
  where user_id = v_uid
    and attempted_at > now() - interval '15 minutes';

  if v_recent_attempts >= 5 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  insert into public.pair_join_attempts (user_id) values (v_uid);

  -- ハイフンや空白を除去し大文字化
  v_clean_code := upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_clean_code) < 6 then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select * into v_pair
  from public.pairs
  where invite_code = v_clean_code
  for update;

  if v_pair.id is null then
    raise exception 'INVITE_CODE_NOT_FOUND';
  end if;

  if v_pair.invite_expires_at < now() then
    raise exception 'INVITE_CODE_EXPIRED';
  end if;

  select count(*) into v_member_count
  from public.pair_members
  where pair_id = v_pair.id;

  if v_member_count >= 2 then
    raise exception 'PAIR_IS_FULL';
  end if;

  insert into public.pair_members (pair_id, user_id)
  values (v_pair.id, v_uid);

  update public.pairs
  set last_active_at = now()
  where id = v_pair.id;

  return jsonb_build_object(
    'pair_id', v_pair.id,
    'invite_code', v_pair.invite_code,
    'timezone', v_pair.timezone
  );
end;
$$;

-- ペア解除（誤って2人とも新規作成した際のリカバリ用）
create or replace function public.leave_pair()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid;
  v_remaining int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select pair_id into v_pair_id
  from public.pair_members
  where user_id = v_uid;

  if v_pair_id is null then
    return;
  end if;

  delete from public.pair_members
  where user_id = v_uid;

  select count(*) into v_remaining
  from public.pair_members
  where pair_id = v_pair_id;

  if v_remaining = 0 then
    delete from public.pairs where id = v_pair_id;
  end if;
end;
$$;

-- 現在のユーザー・ペア・パートナー状態を一括取得
create or replace function public.get_pair_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_my_name text;
  v_pair public.pairs;
  v_partner_id uuid;
  v_partner_name text;
  v_today date;
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
    return jsonb_build_object(
      'has_pair', false,
      'is_pair_connected', false,
      'my_name', coalesce(v_my_name, 'あなた'),
      'partner_name', null,
      'pair_id', null,
      'invite_code', null,
      'invite_expires_at', null,
      'today_date', (now() AT TIME ZONE 'Asia/Tokyo')::date
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

  return jsonb_build_object(
    'has_pair', true,
    'is_pair_connected', v_partner_id is not null,
    'my_name', coalesce(v_my_name, 'あなた'),
    'partner_name', coalesce(v_partner_name, 'パートナー'),
    'pair_id', v_pair.id,
    'invite_code', v_pair.invite_code,
    'invite_expires_at', v_pair.invite_expires_at,
    'today_date', v_today
  );
end;
$$;

-- 今日の出題セットを取得または作成（最初に開いた人が作成、既にあれば取得）
create or replace function public.get_or_create_daily_set(p_question_pool text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid;
  v_today date;
  v_set public.daily_sets;
  v_selected text[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select pair_id into v_pair_id
  from public.pair_members
  where user_id = v_uid;

  if v_pair_id is null then
    raise exception 'NOT_IN_PAIR';
  end if;

  v_today := public.today_in_pair_tz(v_pair_id);

  select * into v_set
  from public.daily_sets
  where pair_id = v_pair_id
    and quiz_date = v_today;

  if v_set.id is null then
    -- 未出題を優先し、足りなければ最終出題日が古いもの（90日以上前を優先）から3問選出
    with pool as (
      select q_id
      from unnest(p_question_pool) as q_id
    ),
    last_asked as (
      select a_q.q_id, max(ds.quiz_date) as last_date
      from public.daily_sets ds
      cross join lateral unnest(ds.question_ids) as a_q(q_id)
      where ds.pair_id = v_pair_id
      group by a_q.q_id
    ),
    ranked as (
      select
        p.q_id,
        case
          when la.last_date is null then 0
          when la.last_date <= v_today - 90 then 1
          else 2
        end as priority,
        la.last_date
      from pool p
      left join last_asked la on la.q_id = p.q_id
      order by priority asc, la.last_date asc nulls first, random()
      limit 3
    )
    select array_agg(q_id) into v_selected from ranked;

    if v_selected is null or array_length(v_selected, 1) = 0 then
      raise exception 'EMPTY_QUESTION_POOL';
    end if;

    insert into public.daily_sets (pair_id, quiz_date, question_ids)
    values (v_pair_id, v_today, v_selected)
    on conflict (pair_id, quiz_date) do nothing;

    select * into v_set
    from public.daily_sets
    where pair_id = v_pair_id
      and quiz_date = v_today;
  end if;

  update public.pairs
  set last_active_at = now()
  where id = v_pair_id;

  return jsonb_build_object(
    'id', v_set.id,
    'pair_id', v_set.pair_id,
    'quiz_date', v_set.quiz_date,
    'question_ids', v_set.question_ids
  );
end;
$$;

-- 待機画面用ステータス（相手の回答数のみ返し、回答内容は返さない）
create or replace function public.get_day_status(p_quiz_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid;
  v_date date;
  v_question_ids text[];
  v_total int := 0;
  v_my_count int := 0;
  v_partner_count int := 0;
  v_partner_connected boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select pair_id into v_pair_id
  from public.pair_members
  where user_id = v_uid;

  if v_pair_id is null then
    return jsonb_build_object(
      'has_pair', false,
      'partner_connected', false,
      'quiz_date', null,
      'total_questions', 0,
      'my_answered_count', 0,
      'partner_answered_count', 0,
      'is_my_completed', false,
      'is_partner_completed', false,
      'is_revealed', false
    );
  end if;

  v_date := coalesce(p_quiz_date, public.today_in_pair_tz(v_pair_id));

  select exists (
    select 1 from public.pair_members
    where pair_id = v_pair_id and user_id <> v_uid
  ) into v_partner_connected;

  select question_ids into v_question_ids
  from public.daily_sets
  where pair_id = v_pair_id and quiz_date = v_date;

  v_total := coalesce(array_length(v_question_ids, 1), 0);

  if v_total > 0 then
    select count(distinct question_id) into v_my_count
    from public.answers
    where pair_id = v_pair_id
      and quiz_date = v_date
      and user_id = v_uid
      and question_id = any(v_question_ids);

    select count(distinct question_id) into v_partner_count
    from public.answers
    where pair_id = v_pair_id
      and quiz_date = v_date
      and user_id <> v_uid
      and question_id = any(v_question_ids);
  end if;

  return jsonb_build_object(
    'has_pair', true,
    'partner_connected', v_partner_connected,
    'quiz_date', v_date,
    'total_questions', v_total,
    'my_answered_count', v_my_count,
    'partner_answered_count', v_partner_count,
    'is_my_completed', (v_total > 0 and v_my_count >= v_total),
    'is_partner_completed', (v_partner_connected and v_total > 0 and v_partner_count >= v_total),
    'is_revealed', public.is_revealed(v_pair_id, v_date)
  );
end;
$$;

-- 再出題時の「過去の自分の回答・相手の回答」を取得（公開済みの過去日のみ）
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
    select distinct on (a_me.question_id)
      jsonb_build_object(
        'question_id', a_me.question_id,
        'quiz_date', a_me.quiz_date,
        'my_answer', a_me.direction,
        'partner_answer', a_partner.direction
      ) as item
    from public.answers a_me
    join public.answers a_partner
      on a_partner.pair_id = a_me.pair_id
     and a_partner.quiz_date = a_me.quiz_date
     and a_partner.question_id = a_me.question_id
     and a_partner.user_id <> a_me.user_id
    where a_me.pair_id = v_pair_id
      and a_me.user_id = v_uid
      and a_me.quiz_date < v_cutoff
      and a_me.question_id = any(p_question_ids)
      and public.is_revealed(v_pair_id, a_me.quiz_date)
    order by a_me.question_id, a_me.quiz_date desc
  ) sub;

  return v_result;
end;
$$;

-- 履歴タイムライン画面用：公開済みの過去出題と両者の回答を取得
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

  select coalesce(jsonb_agg(day_row), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'quiz_date', ds.quiz_date,
      'question_ids', ds.question_ids,
      'answers', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'question_id', q_id,
            'my_answer', a_me.direction,
            'partner_answer', a_partner.direction
          )
          order by ord
        ), '[]'::jsonb)
        from unnest(ds.question_ids) with ordinality as u(q_id, ord)
        left join public.answers a_me
          on a_me.pair_id = ds.pair_id
         and a_me.quiz_date = ds.quiz_date
         and a_me.question_id = u.q_id
         and a_me.user_id = v_uid
        left join public.answers a_partner
          on a_partner.pair_id = ds.pair_id
         and a_partner.quiz_date = ds.quiz_date
         and a_partner.question_id = u.q_id
         and a_partner.user_id <> v_uid
      )
    ) as day_row
    from public.daily_sets ds
    where ds.pair_id = v_pair_id
      and public.is_revealed(ds.pair_id, ds.quiz_date)
    order by ds.quiz_date desc
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, p_offset)
  ) sub;

  return v_result;
end;
$$;

-- アカウント・データ削除（Google Play 審査要件対応）
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.leave_pair();
  delete from public.answers where user_id = v_uid;
  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- 長期間非アクティブなペアの定期削除（service_role / pg_cron 専用）
create or replace function public.cleanup_inactive_pairs(p_inactive_days int default 180)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.pairs
  where last_active_at < now() - make_interval(days => p_inactive_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_inactive_pairs(int) from public;
revoke all on function public.cleanup_inactive_pairs(int) from anon;
revoke all on function public.cleanup_inactive_pairs(int) from authenticated;

-- ============================================================================
-- 5. 最小権限（テーブル・関数のアクセス制御）
-- ============================================================================

-- 未認証（anon）からはテーブル・RPC ともに直接アクセス不可
revoke all on table
  public.profiles,
  public.pairs,
  public.pair_members,
  public.pair_join_attempts,
  public.daily_sets,
  public.answers
  from public, anon;

-- 認証済み（匿名サインイン含む）へ必要最小限のテーブル権限のみ付与
revoke all on table
  public.profiles,
  public.pairs,
  public.pair_members,
  public.pair_join_attempts,
  public.daily_sets,
  public.answers
  from authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.pairs to authenticated;
grant select on table public.pair_members to authenticated;
grant select on table public.daily_sets to authenticated;
grant select, insert on table public.answers to authenticated;

-- 内部専用ヘルパーはクライアントから直接呼び出し不可
revoke all on function public.generate_invite_code() from public, anon, authenticated;

-- RLS ヘルパー・アプリ用 RPC は認証済みロールのみ実行可能
revoke all on function public.today_in_pair_tz(uuid) from public, anon;
grant execute on function public.today_in_pair_tz(uuid) to authenticated;

revoke all on function public.is_pair_member(uuid) from public, anon;
grant execute on function public.is_pair_member(uuid) to authenticated;

revoke all on function public.is_revealed(uuid, date) from public, anon;
grant execute on function public.is_revealed(uuid, date) to authenticated;

revoke all on function public.upsert_profile(text) from public, anon;
grant execute on function public.upsert_profile(text) to authenticated;

revoke all on function public.create_pair(text) from public, anon;
grant execute on function public.create_pair(text) to authenticated;

revoke all on function public.regenerate_invite_code() from public, anon;
grant execute on function public.regenerate_invite_code() to authenticated;

revoke all on function public.join_pair(text, text) from public, anon;
grant execute on function public.join_pair(text, text) to authenticated;

revoke all on function public.leave_pair() from public, anon;
grant execute on function public.leave_pair() to authenticated;

revoke all on function public.get_pair_state() from public, anon;
grant execute on function public.get_pair_state() to authenticated;

revoke all on function public.get_or_create_daily_set(text[]) from public, anon;
grant execute on function public.get_or_create_daily_set(text[]) to authenticated;

revoke all on function public.get_day_status(date) from public, anon;
grant execute on function public.get_day_status(date) to authenticated;

revoke all on function public.get_past_question_history(text[], date) from public, anon;
grant execute on function public.get_past_question_history(text[], date) to authenticated;

revoke all on function public.get_pair_history(int, int) from public, anon;
grant execute on function public.get_pair_history(int, int) to authenticated;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
