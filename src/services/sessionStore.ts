import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { UserSession } from '@/types';

export const TOKEN_KEY = 'mg_session_token';
export const USER_KEY = 'mg_session_user';

export type AuthSessionReason = 'login' | 'logout' | 'revoked';
export type AuthSessionListener = (session: UserSession | null, reason?: AuthSessionReason) => void;

const listeners = new Set<AuthSessionListener>();
let isRevoking = false;

// Safe wrapper for Web fallback where SecureStore might not be supported
export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // fallback
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch {
      // fallback
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const sessionStore = {
  /**
   * Subscribes to authentication session state changes.
   */
  subscribe(listener: AuthSessionListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Retrieves the stored auth Bearer token.
   */
  async getStoredToken(): Promise<string | null> {
    return getSecureItem(TOKEN_KEY);
  },

  /**
   * Retrieves the parsed cached UserSession.
   */
  async getSession(): Promise<UserSession | null> {
    try {
      const userJson = await getSecureItem(USER_KEY);
      const token = await getSecureItem(TOKEN_KEY);
      if (!userJson || !token) return null;

      const user = JSON.parse(userJson);
      return {
        ...user,
        token,
      };
    } catch (e) {
      console.warn('Failed to parse cached session:', e);
      return null;
    }
  },

  /**
   * Persists user and token into SecureStore and broadcasts to subscribers.
   */
  async saveSession(user: Omit<UserSession, 'token' | 'savedAt'>, token: string): Promise<UserSession> {
    const session: UserSession = {
      ...user,
      token,
      savedAt: new Date().toISOString(),
    };

    await setSecureItem(TOKEN_KEY, token);
    await setSecureItem(USER_KEY, JSON.stringify(session));

    listeners.forEach((listener) => {
      try {
        listener(session, 'login');
      } catch (e) {
        console.error('[SessionStore] Listener error on login:', e);
      }
    });

    return session;
  },

  /**
   * Clears the current persistent session.
   * Debounces revocation events to prevent alert spamming from concurrent requests.
   */
  async clearSession(reason: AuthSessionReason = 'logout'): Promise<void> {
    if (reason === 'revoked') {
      if (isRevoking) return;
      isRevoking = true;
      setTimeout(() => {
        isRevoking = false;
      }, 3000);
    }

    await deleteSecureItem(TOKEN_KEY);
    await deleteSecureItem(USER_KEY);

    listeners.forEach((listener) => {
      try {
        listener(null, reason);
      } catch (e) {
        console.error('[SessionStore] Listener error on clearSession:', e);
      }
    });
  },

  /**
   * Checks if an authentication token exists in storage.
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await getSecureItem(TOKEN_KEY);
    return Boolean(token);
  },
};
