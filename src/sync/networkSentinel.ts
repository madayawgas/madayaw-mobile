import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { ENV } from '@/config';

export type NetworkStatusListener = (isOnline: boolean, state: NetInfoState) => void;

const BACKEND_HEALTH_URL = ENV.API_URL.replace(/\/api\/?$/, '') + '/health';
const ONLINE_PROBE_INTERVAL_MS = 15000; // 15 seconds while online
const OFFLINE_PROBE_INTERVAL_MS = 5000; // 5 seconds while offline for rapid recovery detection
const PROBE_TIMEOUT_MS = 2500; // 2.5s quick timeout

// Configure NetInfo to target our backend /health endpoint
try {
  NetInfo.configure({
    reachabilityUrl: BACKEND_HEALTH_URL,
    reachabilityTest: async (response) => response.status === 200,
    reachabilityShortTimeout: 2000,
    reachabilityLongTimeout: 6000,
    reachabilityRequestTimeout: 2500,
  });
} catch (e) {
  console.warn('[NetworkSentinel] NetInfo configuration skipped:', e);
}

let isCurrentlyOnline = false;
let isProbing = false;
let heartbeatTimer: any = null;
const listeners = new Set<NetworkStatusListener>();
const transitionCallbacks = new Set<() => void>();
let isInitialized = false;

/**
 * Actively probes backend /health with a fast timeout.
 * Does not rely on generic WAN internet reachability.
 */
export async function probeBackendHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(BACKEND_HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status === 200;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

function notifyAllListeners(isOnline: boolean, state?: NetInfoState) {
  const s = state || ({ isConnected: isOnline, isInternetReachable: isOnline } as NetInfoState);
  listeners.forEach((listener) => {
    try {
      listener(isOnline, s);
    } catch (e) {
      console.error('[NetworkSentinel] Error in listener:', e);
    }
  });
}

/**
 * Updates reachability state and schedules adaptive heartbeat.
 */
function updateReachabilityState(isOnline: boolean, state?: NetInfoState) {
  const wasOffline = !isCurrentlyOnline;
  const changed = isCurrentlyOnline !== isOnline;

  isCurrentlyOnline = isOnline;

  if (changed) {
    console.log(`[NetworkSentinel] State changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    notifyAllListeners(isOnline, state);

    if (wasOffline && isOnline) {
      console.log('[NetworkSentinel] Backend connection restored. Triggering online transition callbacks.');
      transitionCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.error('[NetworkSentinel] Error in transition callback:', err);
        }
      });
    }
  }

  scheduleHeartbeat(isOnline ? ONLINE_PROBE_INTERVAL_MS : OFFLINE_PROBE_INTERVAL_MS);
}

function scheduleHeartbeat(delayMs: number) {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(async () => {
    if (isProbing) return;
    isProbing = true;
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        updateReachabilityState(false, netState);
      } else {
        const alive = await probeBackendHealth();
        updateReachabilityState(alive, netState);
      }
    } catch {
      updateReachabilityState(false);
    } finally {
      isProbing = false;
    }
  }, delayMs);
}

function setupSentinel() {
  if (isInitialized) return;
  isInitialized = true;

  // 1. Listen for device network interface events (Wi-Fi / Cellular toggle)
  NetInfo.addEventListener(async (state) => {
    if (!state.isConnected) {
      updateReachabilityState(false, state);
      return;
    }

    // When connection is up, actively verify backend health
    const alive = await probeBackendHealth();
    updateReachabilityState(alive, state);
  });

  // 2. Listen for app foregrounding to immediately re-check backend reachability
  AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      networkSentinel.checkOnline().catch(() => {});
    }
  });

  // 3. Immediate initial check on startup
  NetInfo.fetch().then(async (state) => {
    if (!state.isConnected) {
      updateReachabilityState(false, state);
    } else {
      const alive = await probeBackendHealth();
      updateReachabilityState(alive, state);
    }
  }).catch(() => {
    updateReachabilityState(false);
  });
}

// Auto-initialize immediately on module import
setupSentinel();

export const networkSentinel = {
  /**
   * Registers a callback for offline -> online transition.
   */
  init(onTransitionToOnline?: () => void): () => void {
    setupSentinel();
    if (onTransitionToOnline) {
      transitionCallbacks.add(onTransitionToOnline);
    }
    return () => {
      if (onTransitionToOnline) {
        transitionCallbacks.delete(onTransitionToOnline);
      }
    };
  },

  isOnline(): boolean {
    return isCurrentlyOnline;
  },

  /**
   * Immediately probes backend health and updates state.
   */
  async checkOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      if (!state.isConnected) {
        updateReachabilityState(false, state);
        return false;
      }
      const alive = await probeBackendHealth();
      updateReachabilityState(alive, state);
      return alive;
    } catch {
      updateReachabilityState(false);
      return false;
    }
  },

  /**
   * Called by API client or media service when a network request fails
   * due to connection refusal, timeout, or unreachable host.
   * Immediately drops the sentinel into offline mode and triggers rapid recovery probing.
   */
  reportNetworkFailure(): void {
    if (isCurrentlyOnline) {
      console.warn('[NetworkSentinel] Network failure reported from active operation. Dropping to OFFLINE.');
      updateReachabilityState(false);
    }
  },

  getHealthUrl(): string {
    return BACKEND_HEALTH_URL;
  },

  subscribe(listener: NetworkStatusListener): () => void {
    listeners.add(listener);
    // Immediately notify subscriber with current reachability
    listener(isCurrentlyOnline, { isConnected: isCurrentlyOnline, isInternetReachable: isCurrentlyOnline } as NetInfoState);
    // Also trigger an asynchronous probe to update if needed
    networkSentinel.checkOnline().catch(() => {});
    return () => {
      listeners.delete(listener);
    };
  },
};
