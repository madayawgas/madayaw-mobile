import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { UserSession } from '@/types';
import { authApi } from '../api/endpoints/authApi';

const TOKEN_KEY = 'mg_session_token';
const USER_KEY = 'mg_session_user';

// Safe wrapper for Web fallback where SecureStore might not be supported
async function setSecureItem(key: string, value: string): Promise<void> {
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

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function deleteSecureItem(key: string): Promise<void> {
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

export type AuthSessionReason = 'login' | 'logout' | 'revoked';
export type AuthSessionListener = (session: UserSession | null, reason?: AuthSessionReason) => void;

const listeners = new Set<AuthSessionListener>();
let isRevoking = false;

export const authService = {
  /**
   * Subscribes to authentication session state changes.
   * Useful for root coordinators (e.g. App.js) to react to login, logout, and revocation events.
   */
  subscribe(listener: AuthSessionListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Universal login method for the mobile application.
   * Authenticates against live authApi and persists session in SecureStore.
   */
  async login(credentials: { username: string; password: string }): Promise<UserSession> {
    const authResult = await authApi.login(credentials);
    if (!authResult?.user) {
      throw new Error('Invalid authentication response structure');
    }
    const token = authResult.token || `session-${authResult.user.id}`;
    return this.saveSession(authResult.user, token);
  },

  async getStoredToken(): Promise<string | null> {
    return getSecureItem(TOKEN_KEY);
  },

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
        console.error('[AuthService] Listener error on login:', e);
      }
    });

    return session;
  },

  /**
   * Clears the current persistent session.
   * Accepts an optional reason: 'logout' (default) or 'revoked' (when 401 is received from backend).
   * Revocation calls are debounced to prevent duplicate alerts from concurrent requests.
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
        console.error('[AuthService] Listener error on clearSession:', e);
      }
    });
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await getSecureItem(TOKEN_KEY);
    return Boolean(token);
  },
};

