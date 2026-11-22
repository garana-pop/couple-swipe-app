import { Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// Web で OAuth ポップアップ/リダイレクトから復帰した際のセッション完了処理
WebBrowser.maybeCompleteAuthSession();

function parseRedirectParams(url: string): Record<string, string> {
  const result: Record<string, string> = {};
  const [withoutHash, hashPart] = url.split('#');
  const queryIndex = withoutHash.indexOf('?');
  const queryPart = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';

  for (const segment of [queryPart, hashPart ?? '']) {
    if (!segment) continue;
    for (const pair of segment.split('&')) {
      if (!pair) continue;
      const eqIdx = pair.indexOf('=');
      const rawKey = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
      const rawVal = eqIdx >= 0 ? pair.slice(eqIdx + 1) : '';
      try {
        const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
        const val = decodeURIComponent(rawVal.replace(/\+/g, ' '));
        if (key) result[key] = val;
      } catch {
        if (rawKey) result[rawKey] = rawVal;
      }
    }
  }

  return result;
}

export interface AccountAuthInfo {
  isAnonymous: boolean;
  email: string | null;
  isGoogleLinked: boolean;
}

export function extractAccountAuthInfo(user: User | null | undefined): AccountAuthInfo {
  if (!user) {
    return { isAnonymous: true, email: null, isGoogleLinked: false };
  }
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const hasGoogle = identities.some((identity) => identity.provider === 'google');
  const isAnonymous = Boolean(user.is_anonymous) && !hasGoogle && !user.email;
  return {
    isAnonymous,
    email: user.email ?? null,
    isGoogleLinked: hasGoogle,
  };
}

export function getAuthRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/settings`;
  }
  return makeRedirectUri({
    scheme: 'couple-swipe-app',
    path: 'auth/callback',
  });
}

function formatOAuthError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes('manual linking') || lower.includes('manual_linking')) {
    return 'Supabase の Auth 設定で「Enable Manual Linking」を ON にしてください。';
  }
  if (lower.includes('provider is not enabled') || lower.includes('unsupported provider')) {
    return 'Supabase の Authentication > Providers で Google ログインを有効にしてください。';
  }
  if (
    lower.includes('identity_already_exists') ||
    lower.includes('already linked') ||
    lower.includes('already registered')
  ) {
    return 'この Google アカウントは既に別のデータに紐づいています。機種変更後のデータ復元は下の「既存データを復元」ボタンをお試しください。';
  }
  return `Google 認証に失敗しました（${rawMessage}）。`;
}

/**
 * OAuth リダイレクト URL から PKCE code または access_token を受け取り、セッションを確定する
 */
export async function completeAuthFromUrl(
  url: string
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return { ok: false, error: 'Supabase が未設定です。' };
  }

  const params = parseRedirectParams(url);
  if (params.error || params.error_description || params.error_code) {
    return {
      ok: false,
      error: formatOAuthError(
        params.error_description ?? params.error_code ?? params.error ?? 'unknown_error'
      ),
    };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return { ok: false, error: formatOAuthError(error.message) };
    }
    return { ok: true };
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) {
      return { ok: false, error: formatOAuthError(error.message) };
    }
    return { ok: true };
  }

  // linkIdentity 完了時に既にセッションが更新されているケースを確認
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    return { ok: true };
  }

  return { ok: false, error: '認証情報の受け取りに失敗しました。もう一度お試しください。' };
}

/**
 * 7-3: 現在の匿名アカウントに Google を紐づけて永続アカウントへ昇格する（ペア・履歴を維持）
 */
export async function linkGoogleIdentity(): Promise<{
  ok: boolean;
  redirecting?: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  if (!supabase) {
    return { ok: false, error: 'Supabase が未設定です。' };
  }

  const redirectTo = getAuthRedirectUrl();
  const isWeb = Platform.OS === 'web';

  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: !isWeb,
    },
  });

  if (error) {
    return { ok: false, error: formatOAuthError(error.message) };
  }

  if (isWeb) {
    return { ok: true, redirecting: true };
  }

  if (!data?.url) {
    return { ok: false, error: 'Google 認証 URL の取得に失敗しました。' };
  }

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type === 'cancel' || res.type === 'dismiss') {
    return { ok: false, cancelled: true };
  }
  if (res.type !== 'success' || !res.url) {
    return { ok: false, error: 'Google 連携が中断されました。' };
  }

  const completed = await completeAuthFromUrl(res.url);
  if (!completed.ok) return completed;

  // 最新のユーザー情報（identities / email）を反映
  await supabase.auth.refreshSession();
  return { ok: true };
}

/**
 * 7-3: 機種変更後の新端末などで、既に Google 連携済みの既存アカウントへログインしてデータを復元する
 */
export async function signInWithGoogleAccount(): Promise<{
  ok: boolean;
  redirecting?: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  if (!supabase) {
    return { ok: false, error: 'Supabase が未設定です。' };
  }

  const redirectTo = getAuthRedirectUrl();
  const isWeb = Platform.OS === 'web';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: !isWeb,
    },
  });

  if (error) {
    return { ok: false, error: formatOAuthError(error.message) };
  }

  if (isWeb) {
    return { ok: true, redirecting: true };
  }

  if (!data?.url) {
    return { ok: false, error: 'Google ログイン URL の取得に失敗しました。' };
  }

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type === 'cancel' || res.type === 'dismiss') {
    return { ok: false, cancelled: true };
  }
  if (res.type !== 'success' || !res.url) {
    return { ok: false, error: 'Google ログインが中断されました。' };
  }

  return completeAuthFromUrl(res.url);
}
