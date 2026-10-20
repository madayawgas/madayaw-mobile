/**
 * Application environment configuration
 * Statically reads EXPO_PUBLIC_* variables for Expo bundle-time inlining.
 */


const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

export const ENV = {
  // Backend base URL
  API_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api',

  // Network request timeout (default: 10 seconds)
  API_TIMEOUT_MS: parseNumber(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, 10000),

  // Sync polling heartbeat interval (default: 30 seconds)
  SYNC_INTERVAL_MS: parseNumber(process.env.EXPO_PUBLIC_SYNC_INTERVAL_MS, 30000),

  // Application environment ('development' | 'staging' | 'production')
  APP_ENV: (process.env.EXPO_PUBLIC_APP_ENV || 'development') as 'development' | 'staging' | 'production',

  // Operational route zone ID
  DEFAULT_ZONE_ID: process.env.EXPO_PUBLIC_DEFAULT_ZONE_ID || '7b8f9e6a-5432-41a9-83bc-9d0e12345678',
} as const;

export type AppConfig = typeof ENV;
