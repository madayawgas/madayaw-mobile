import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { UserSession } from '@/types';

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

export const authService = {
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
    return session;
  },

  async clearSession(): Promise<void> {
    await deleteSecureItem(TOKEN_KEY);
    await deleteSecureItem(USER_KEY);
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await getSecureItem(TOKEN_KEY);
    return Boolean(token);
  },
};
