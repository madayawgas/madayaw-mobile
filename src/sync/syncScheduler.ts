import { ENV } from '@/config';
import { networkSentinel } from './networkSentinel';
import { syncWorker, SyncResult } from './syncWorker';
import { syncQueueRepository } from '@/database';

export interface SyncSchedulerStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
}

type StatusListener = (status: SyncSchedulerStatus) => void;

let heartbeatTimer: any = null;
let lastSyncedAt: string | null = null;
const listeners = new Set<StatusListener>();

async function getStatusSnapshot(): Promise<SyncSchedulerStatus> {
  const pendingCount = await syncQueueRepository.getPendingCount();
  return {
    isOnline: networkSentinel.isOnline(),
    isSyncing: syncWorker.isBusy(),
    pendingCount,
    lastSyncedAt,
  };
}

async function notifyListeners(): Promise<void> {
  const status = await getStatusSnapshot();
  listeners.forEach((l) => {
    try {
      l(status);
    } catch (e) {
      console.error('[SyncScheduler] Listener error:', e);
    }
  });
}

export const syncScheduler = {
  /**
   * Starts the Tri-Trigger Sync Engine:
   * 1. Network Sentinel transition listener
   * 2. 30-60s interval heartbeat
   */
  start(): () => void {
    // 1. Initialize Network Sentinel
    const unsubSentinel = networkSentinel.init(() => {
      syncScheduler.syncNow();
    });

    networkSentinel.subscribe(() => {
      notifyListeners();
    });

    // 2. Start Polling Heartbeat Interval
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      if (networkSentinel.isOnline() && !syncWorker.isBusy()) {
        const pending = await syncQueueRepository.getPendingCount();
        if (pending > 0) {
          console.log(`[SyncScheduler] Polling heartbeat detected ${pending} pending mutations.`);
          await syncScheduler.syncNow();
        }
      }
    }, ENV.SYNC_INTERVAL_MS);

    notifyListeners();

    return () => {
      unsubSentinel();
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };
  },

  /**
   * Trigger 3: Manual "Sync Now" button invocation
   */
  async syncNow(): Promise<SyncResult> {
    notifyListeners();
    const result = await syncWorker.runSyncCycle();
    if (result.synced > 0) {
      lastSyncedAt = new Date().toISOString();
    }
    notifyListeners();
    return result;
  },

  subscribe(listener: StatusListener): () => void {
    listeners.add(listener);
    getStatusSnapshot().then(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async getStatus(): Promise<SyncSchedulerStatus> {
    return getStatusSnapshot();
  },
};
