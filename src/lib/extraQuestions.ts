import { MatchRule, RemoteQuestionRecord, SwipeDirection } from '../types';
import { supabase } from './supabase';
import {
  getCachedExtraQuestions,
  getExtraQuestionsSyncState,
  setCachedExtraQuestions,
  setExtraQuestionsSyncState,
} from './storage';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 通常時は24時間に1回だけ差分同期して通信量を最小化

function isValidChoices(value: unknown): value is Record<SwipeDirection, string> {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.UP === 'string' &&
    typeof obj.DOWN === 'string' &&
    typeof obj.LEFT === 'string' &&
    typeof obj.RIGHT === 'string'
  );
}

function parseRemoteRecord(raw: unknown): RemoteQuestionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.category !== 'string' ||
    typeof r.title !== 'string' ||
    !isValidChoices(r.choices)
  ) {
    return null;
  }
  const matchRule: MatchRule = r.matchRule === 'mirror_up_down' ? 'mirror_up_down' : 'exact';
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    choices: r.choices,
    matchRule,
    isActive: r.isActive !== false,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
  };
}

function mergeRecords(
  existing: RemoteQuestionRecord[],
  incoming: RemoteQuestionRecord[]
): RemoteQuestionRecord[] {
  if (incoming.length === 0) return existing;
  const map = new Map<string, RemoteQuestionRecord>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

/**
 * Supabase の extra_questions を差分同期し、最新のローカルキャッシュを返す。
 * - force = false: 前回チェックから24時間未満なら通信せずキャッシュを返す
 * - force = true : 未知の質問IDを検知した場合などに即時フル同期（p_since = null）を実行
 */
export async function syncExtraQuestions(options?: {
  force?: boolean;
  fullRefresh?: boolean;
}): Promise<RemoteQuestionRecord[]> {
  const cached = await getCachedExtraQuestions();
  if (!supabase) return cached;

  const syncState = await getExtraQuestionsSyncState();
  const nowMs = Date.now();
  const force = Boolean(options?.force);
  const fullRefresh = Boolean(options?.fullRefresh);

  if (!force && syncState.lastCheckedAt > 0 && nowMs - syncState.lastCheckedAt < SYNC_INTERVAL_MS) {
    return cached;
  }

  try {
    const pSince = fullRefresh ? null : syncState.serverCursor;
    const { data, error } = await supabase.rpc('get_extra_questions_since', {
      p_since: pSince,
    });

    if (error || !data || typeof data !== 'object') {
      return cached;
    }

    const payload = data as { server_time?: unknown; questions?: unknown };
    const rawList = Array.isArray(payload.questions) ? payload.questions : [];
    const parsedIncoming = rawList
      .map(parseRemoteRecord)
      .filter((item): item is RemoteQuestionRecord => item !== null);

    const nextRecords = fullRefresh ? parsedIncoming : mergeRecords(cached, parsedIncoming);
    const nextCursor =
      typeof payload.server_time === 'string' ? payload.server_time : syncState.serverCursor;

    await Promise.all([
      parsedIncoming.length > 0 || fullRefresh
        ? setCachedExtraQuestions(nextRecords)
        : Promise.resolve(),
      setExtraQuestionsSyncState({
        serverCursor: nextCursor,
        lastCheckedAt: nowMs,
      }),
    ]);

    return nextRecords;
  } catch {
    return cached;
  }
}
