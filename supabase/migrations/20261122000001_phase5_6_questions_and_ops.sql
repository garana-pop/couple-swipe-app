-- フェーズ5・6: 追加質問の差分配信（低egress）＋再出題ルール強化＋pg_cron自動削除
-- 対象: Supabase (PostgreSQL)

-- ============================================================================
-- 1. 追加質問配信テーブル（アプリ更新なしで追加する質問のみ格納）
-- ============================================================================

create table if not exists public.extra_questions (
  id text primary key check (id ~ '^[a-z0-9_-]{2,32}$'),
  category text not null check (char_length(trim(category)) between 1 and 30),
  title text not null check (char_length(trim(title)) between 1 and 120),
  choices jsonb not null check (
    jsonb_typeof(choices) = 'object'
    and choices ?& array['UP', 'DOWN', 'LEFT', 'RIGHT']
    and jsonb_typeof(choices->'UP') = 'string'
    and jsonb_typeof(choices->'DOWN') = 'string'
    and jsonb_typeof(choices->'LEFT') = 'string'
    and jsonb_typeof(choices->'RIGHT') = 'string'
  ),
  match_rule text not null default 'exact' check (match_rule in ('exact', 'mirror_up_down')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_extra_questions_updated_at
  on public.extra_questions (updated_at desc);

create or replace function public.touch_extra_questions_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_extra_questions_updated_at on public.extra_questions;
create trigger trg_extra_questions_updated_at
  before update on public.extra_questions
  for each row
  execute function public.touch_extra_questions_updated_at();

alter table public.extra_questions enable row level security;

-- 過去履歴の表示を壊さないため非アクティブ行も含めて認証済みユーザーに参照許可（書き込みは管理者のみ）
create policy "extra_questions_select_authenticated"
  on public.extra_questions for select
  to authenticated
  using (true);

revoke all on table public.extra_questions from public, anon, authenticated;
grant select on table public.extra_questions to authenticated;

-- ============================================================================
-- 2. 追加質問の差分取得 RPC（更新がなければ空配列のみ返却して egress 極小化）
-- ============================================================================

create or replace function public.get_extra_questions_since(p_since timestamptz default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
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
-- 3. 出題 RPC の強化（extra_questions 統合 ＋ 90日以上前の懐かしい再出題枠を最大1問選出）
-- ============================================================================

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
    -- 同梱プール + アクティブな追加配信質問を統合し、
    -- 90日以上前に出題された質問があれば最大1問を「懐かしい再出題枠」として混ぜ、
    -- 残りは未出題優先（足りなければ最も古い出題順）で計3問を選出する
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
      where ds.pair_id = v_pair_id
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

-- ============================================================================
-- 4. フェーズ6: pg_cron による非アクティブペアの定期自動削除（毎週月曜 03:00 JST）
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'cleanup-inactive-pairs-weekly',
  '0 18 * * 0',
  $$ select public.cleanup_inactive_pairs(180); $$
);
