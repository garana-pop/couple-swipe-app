-- パートナー再連携ワンタイムコード（再インストール・機種変更時の安全引き継ぎ）
-- 仕様:
--   - 2人連携中の片方（生きている端末）が発行可能（何度でも再発行可、再発行時は旧未使用コードを自動無効化）
--   - 有効期限 5 分間・1 回限り使用可能（使用直後に used_at を記録して再利用を防止）
--   - 既存の固定招待コードでは満員ペア（2人）へ絶対に参加できない制約を維持
--   - 再連携完了時に旧パートナー枠の pair_members / answers / 表示名 等を 1 トランザクションで安全に移行

-- ============================================================================
-- 1. 再連携ワンタイムコードテーブル
-- ============================================================================

create table if not exists public.pair_relink_codes (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  code text not null unique,
  issued_by_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (issued_by_user_id <> target_user_id)
);

create index if not exists idx_pair_relink_codes_pair_created
  on public.pair_relink_codes (pair_id, created_at desc);

create index if not exists idx_pair_relink_codes_issued_by
  on public.pair_relink_codes (issued_by_user_id);

create index if not exists idx_pair_relink_codes_target_user
  on public.pair_relink_codes (target_user_id);

create index if not exists idx_pair_relink_codes_used_by
  on public.pair_relink_codes (used_by_user_id)
  where used_by_user_id is not null;

create index if not exists idx_pair_relink_codes_active_expires
  on public.pair_relink_codes (expires_at)
  where used_at is null;

alter table public.pair_relink_codes enable row level security;

-- クライアントからの直接参照・改ざんを完全禁止（SECURITY DEFINER RPC 専用）
revoke all on table public.pair_relink_codes from public, anon, authenticated;

-- ============================================================================
-- 2. パートナー再連携コード発行・再発行 RPC（5分有効・1回限り）
-- ============================================================================

create or replace function public.issue_pair_relink_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid;
  v_target_uid uuid;
  v_code text;
  v_expires timestamptz := now() + interval '5 minutes';
  v_tries int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select pm.pair_id
    into v_pair_id
  from public.pair_members pm
  where pm.user_id = v_uid;

  if v_pair_id is null then
    raise exception 'NOT_IN_PAIR';
  end if;

  -- ペア行をロックして同時再発行・同時再連携の競合を防止
  perform 1
  from public.pairs p
  where p.id = v_pair_id
  for update;

  -- 発行者の「もう片方のパートナー」を一意に特定
  select pm.user_id
    into v_target_uid
  from public.pair_members pm
  where pm.pair_id = v_pair_id
    and pm.user_id <> v_uid
  order by pm.joined_at desc
  limit 1;

  if v_target_uid is null then
    raise exception 'PARTNER_NOT_CONNECTED';
  end if;

  -- 既存の未使用コードは即座に失効（再発行時に旧コードが同時有効にならないようにする）
  update public.pair_relink_codes
  set expires_at = now() - interval '1 second'
  where pair_id = v_pair_id
    and used_at is null
    and expires_at > now();

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_invite_code();

    if exists (select 1 from public.pairs where invite_code = v_code) then
      if v_tries >= 10 then
        raise exception 'FAILED_TO_GENERATE_CODE';
      end if;
      continue;
    end if;

    begin
      insert into public.pair_relink_codes (
        pair_id,
        code,
        issued_by_user_id,
        target_user_id,
        expires_at
      )
      values (
        v_pair_id,
        v_code,
        v_uid,
        v_target_uid,
        v_expires
      );
      exit;
    exception when unique_violation then
      if v_tries >= 10 then
        raise exception 'FAILED_TO_GENERATE_CODE';
      end if;
    end;
  end loop;

  update public.pairs
  set last_active_at = now()
  where id = v_pair_id;

  return jsonb_build_object(
    'pair_id', v_pair_id,
    'relink_code', v_code,
    'expires_at', v_expires,
    'expires_in_seconds', 300
  );
end;
$$;

revoke all on function public.issue_pair_relink_code() from public, anon;
grant execute on function public.issue_pair_relink_code() to authenticated;

-- ============================================================================
-- 3. join_pair RPC 更新（通常招待コード＋5分ワンタイム再連携コード対応）
-- ============================================================================

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
  v_relink public.pair_relink_codes;
  v_old_name text;
  v_req_name text;
  v_final_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.pair_members where user_id = v_uid) then
    raise exception 'ALREADY_IN_PAIR';
  end if;

  -- 15分以内に5回以上の試行はレート制限（通常招待コード・再連携コード共通）
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

  v_req_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_req_name is not null and char_length(v_req_name) > 20 then
    v_req_name := left(v_req_name, 20);
  end if;

  -- 1) 通常の招待コード（空き枠のあるペアへの参加）を確認
  select * into v_pair
  from public.pairs
  where invite_code = v_clean_code
  for update;

  if v_pair.id is not null then
    insert into public.profiles (id, display_name)
    values (v_uid, coalesce(v_req_name, 'あなた'))
    on conflict (id) do update
      set display_name = coalesce(v_req_name, profiles.display_name),
          updated_at = now();

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
      'timezone', v_pair.timezone,
      'relinked', false
    );
  end if;

  -- 2) パートナー再連携ワンタイムコード（5分有効・1回限り）を確認
  select * into v_relink
  from public.pair_relink_codes
  where code = v_clean_code
  for update;

  if v_relink.id is null then
    raise exception 'INVITE_CODE_NOT_FOUND';
  end if;

  if v_relink.used_at is not null then
    raise exception 'RELINK_CODE_USED';
  end if;

  if v_relink.expires_at < now() then
    raise exception 'RELINK_CODE_EXPIRED';
  end if;

  if v_relink.issued_by_user_id = v_uid then
    raise exception 'CANNOT_RELINK_SELF';
  end if;

  select * into v_pair
  from public.pairs
  where id = v_relink.pair_id
  for update;

  if v_pair.id is null then
    raise exception 'RELINK_PAIR_CHANGED';
  end if;

  -- 発行者・移行対象の2人が依然として同一ペアに所属していることを検証
  if not exists (
    select 1 from public.pair_members
    where pair_id = v_pair.id and user_id = v_relink.issued_by_user_id
  ) or not exists (
    select 1 from public.pair_members
    where pair_id = v_pair.id and user_id = v_relink.target_user_id
  ) then
    raise exception 'RELINK_PAIR_CHANGED';
  end if;

  -- 1回限り使用済みに確定（同一ペアの他未使用コードも無効化）
  update public.pair_relink_codes
  set used_at = now(),
      used_by_user_id = v_uid
  where id = v_relink.id;

  update public.pair_relink_codes
  set expires_at = now() - interval '1 second'
  where pair_id = v_pair.id
    and id <> v_relink.id
    and used_at is null
    and expires_at > now();

  -- 旧パートナー枠の表示名を（新端末が初期名「あなた」の場合に）引き継ぐ
  select display_name into v_old_name
  from public.profiles
  where id = v_relink.target_user_id;

  if v_req_name is not null and v_req_name <> 'あなた' then
    v_final_name := v_req_name;
  elsif nullif(trim(coalesce(v_old_name, '')), '') is not null then
    v_final_name := trim(v_old_name);
  else
    v_final_name := 'あなた';
  end if;

  insert into public.profiles (id, display_name)
  values (v_uid, v_final_name)
  on conflict (id) do update
    set display_name = case
          when profiles.display_name = 'あなた' or trim(profiles.display_name) = '' then v_final_name
          else profiles.display_name
        end,
        updated_at = now();

  -- 旧端末の不要なプッシュ通知トークンをクリア
  update public.profiles
  set expo_push_token = null,
      updated_at = now()
  where id = v_relink.target_user_id;

  -- ペア内の過去回答・通知ログ・AIレポート作成者を新ユーザーIDへ移行
  update public.answers
  set user_id = v_uid
  where pair_id = v_pair.id
    and user_id = v_relink.target_user_id;

  update public.push_notification_logs
  set sender_id = v_uid
  where pair_id = v_pair.id
    and sender_id = v_relink.target_user_id;

  update public.pair_ai_reports
  set generated_by = v_uid
  where pair_id = v_pair.id
    and generated_by = v_relink.target_user_id;

  -- ペアメンバー枠を付け替え（joined_at・ペア開始日は維持）
  update public.pair_members
  set user_id = v_uid
  where pair_id = v_pair.id
    and user_id = v_relink.target_user_id;

  update public.pairs
  set last_active_at = now()
  where id = v_pair.id;

  return jsonb_build_object(
    'pair_id', v_pair.id,
    'invite_code', v_pair.invite_code,
    'timezone', v_pair.timezone,
    'relinked', true
  );
end;
$$;

revoke all on function public.join_pair(text, text) from public, anon;
grant execute on function public.join_pair(text, text) to authenticated;
