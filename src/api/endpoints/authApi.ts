import { apiClient, delay, ApiError } from '../client';
import { ENV } from '@/config';
import { LoginRequest, LoginResponseData } from '@/types';
import { MOCK_SEED_USERS } from '../mockData';

export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginResponseData> {
    if (ENV.USE_MOCK) {
      await delay();
      const mockRecord = MOCK_SEED_USERS[credentials.username];
      if (mockRecord && mockRecord.password === credentials.password) {
        return mockRecord.response;
      }
      throw new Error('Invalid username or password');
    }

    const res = await apiClient<LoginResponseData>('/users/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      skipAuth: true,
    });
    return res.data;
  },

  /**
   * Validates the active session against the backend.
   * Differentiates explicit 401 Unauthorized (revoked/expired) from network timeouts (offline).
   * - 'valid': Backend accepted session and returned 200 OK.
   * - 'revoked': Backend explicitly rejected the session with 401 Unauthorized.
   * - 'offline': Backend unreachable or request timed out; user can proceed offline with cached session.
   */
  async validateSession(): Promise<'valid' | 'revoked' | 'offline'> {
    if (ENV.USE_MOCK) {
      await delay(100);
      return 'valid';
    }

    try {
      const res = await apiClient<any>('/users/me', {
        method: 'GET',
        timeoutMs: 2500, // Quick timeout to never block app launch
      });
      return res?.status === 'success' ? 'valid' : 'revoked';
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        return 'revoked';
      }
      return 'offline';
    }
  },

  async verifySession(): Promise<boolean> {
    const status = await this.validateSession();
    return status === 'valid';
  },


  async logout(): Promise<void> {
    if (ENV.USE_MOCK) {
      await delay(100);
      return;
    }

    try {
      await apiClient('/users/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Backend logout call failed:', e);
    }
  },
};
