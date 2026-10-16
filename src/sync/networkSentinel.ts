import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type NetworkStatusListener = (isOnline: boolean, state: NetInfoState) => void;

let isCurrentlyOnline = false;
const listeners = new Set<NetworkStatusListener>();
let unsubscribeNetInfo: (() => void) | null = null;

export const networkSentinel = {
  /**
   * Initializes the network listener.
   */
  init(onTransitionToOnline?: () => void): () => void {
    if (unsubscribeNetInfo) {
      return unsubscribeNetInfo;
    }

    unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      const wasOffline = !isCurrentlyOnline;
      isCurrentlyOnline = isOnline;

      listeners.forEach((listener) => {
        try {
          listener(isOnline, state);
        } catch (e) {
          console.error('[NetworkSentinel] Error in listener:', e);
        }
      });

      // Trigger 1: Network Sentinel Transition (Offline -> Online)
      if (wasOffline && isOnline) {
        console.log('[NetworkSentinel] Network transitioned to ONLINE. Triggering sync.');
        onTransitionToOnline?.();
      }
    });

    // Check initial state
    NetInfo.fetch().then((state) => {
      isCurrentlyOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    });

    return () => {
      if (unsubscribeNetInfo) {
        unsubscribeNetInfo();
        unsubscribeNetInfo = null;
      }
    };
  },

  isOnline(): boolean {
    return isCurrentlyOnline;
  },

  subscribe(listener: NetworkStatusListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
