import { apiClient, ApiError } from '../client';
import { LoginRequest, LoginResponseData } from '@/types';

export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginResponseData> {
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
    try {
      await apiClient('/users/logout', { method: 'POST' });
    } catch (e) {
      console.warn('Backend logout call failed:', e);
    }
  },
};
