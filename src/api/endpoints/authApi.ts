import { apiClient, delay } from '../client';
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

  async verifySession(): Promise<boolean> {
    if (ENV.USE_MOCK) {
      await delay(100);
      return true;
    }

    try {
      const res = await apiClient<any>('/users/me', { method: 'GET' });
      return res.status === 'success';
    } catch {
      return false;
    }
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
