import { ENV } from '@/config';
import { authService } from '@/services/authService';
import { networkSentinel } from '@/sync/networkSentinel';
import { ApiResponse } from '@/types';

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  skipAuth?: boolean;
}

/**
 * Universal API Client for MadayawGas Mobile.
 * Automatically injects Bearer token from SecureStore, handles timeouts,
 * and intercepts 401 Unauthorized for online revocation handling.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const url = `${ENV.API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const timeoutMs = options.timeoutMs || Math.min(ENV.API_TIMEOUT_MS, 6000);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (!options.skipAuth) {
      const token = await authService.getStoredToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(url, {
      ...options,
      credentials: options.credentials || 'include',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // Online revocation handler: clear session ONLY if revoked on backend (401 with active token)
      if (response.status === 401 && !options.skipAuth) {
        const storedToken = await authService.getStoredToken();
        if (storedToken) {
          console.warn(`[ApiClient] Received 401 with active token. Session revoked on backend.`);
          await authService.clearSession();
        }
      }

      throw new ApiError(
        data?.message || `HTTP ${response.status}: Request failed`,
        response.status,
        data
      );
    }

    return data as ApiResponse<T>;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (
      error.name === 'AbortError' ||
      error.message?.includes('canceled') ||
      error.message?.includes('cancelled')
    ) {
      networkSentinel.reportNetworkFailure();
      throw new ApiError(`Network request timeout or offline (${timeoutMs}ms)`, 408);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    networkSentinel.reportNetworkFailure();
    throw new ApiError(error.message || 'Network request failed', 0);
  }
}

/**
 * Helper to simulate network latency in mock mode
 */
export const delay = (ms: number = ENV.SIMULATE_NETWORK_DELAY_MS): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
