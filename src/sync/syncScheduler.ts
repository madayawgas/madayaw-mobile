import { ENV } from '@/config';
import { networkSentinel } from './networkSentinel';
import { syncWorker, SyncResult } from './syncWorker';
import { syncQueueRepository } from '@/database';
import { authService } from '@/services/authService';
import { driverRealtimeManager } from '@/realtime';

export interface SyncSchedulerStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  quarantinedCount: number;
  lastSyncedAt: string | null;
  activeUserId?: string | null;
}

type StatusListener = (status: SyncSchedulerStatus) => void;

let heartbeatTimer: any = null;
let lastSyncedAt: string | null = null;
let activeUserId: string | null = null;
const listeners = new Set<StatusListener>();

async function getStatusSnapshot(): Promise<SyncSchedulerStatus> {
  if (!activeUserId) {
    const session = await authService.getSession();
    if (session?.id) {
      activeUserId = session.id;
    }
  }

  const [pendingCount, quarantinedCount] = await Promise.all([
    syncQueueRepository.getPendingCount(activeUserId),
    syncQueueRepository.getQuarantinedCount(activeUserId),
  ]);

  return {
    isOnline: networkSentinel.isOnline(),
    isSyncing: syncWorker.isBusy(),
    pendingCount,
    quarantinedCount,
    lastSyncedAt,
    activeUserId,
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
   * Updates the active authenticated user context.
   * Scopes pending item counts and sync triggers strictly to this user.
   */
  setActiveUser(userId: string | null): void {
    activeUserId = userId;
    notifyListeners();
    if (userId && networkSentinel.isOnline()) {
      console.log(`[SyncScheduler] Active user set to ${userId}. Triggering user-scoped sync.`);
      syncScheduler.syncNow(userId);
    }
  },

  /**
   * Starts the Tri-Trigger Sync Engine:
   * 1. Network Sentinel transition listener (triggers sync immediately on offline -> online recovery)
   * 2. 30-60s interval heartbeat
   */
  start(): () => void {
    // 0. Self-heal any orphaned 'PROCESSING' rows left over from app kill/termination
    syncQueueRepository.resetProcessingItems().catch((err) => {
      console.warn('[SyncScheduler] Self-healing reset of processing items warning:', err);
    });

    // 1. Initialize Network Sentinel transition callback
    const unsubSentinel = networkSentinel.init(() => {
      console.log('[SyncScheduler] Trigger 1: Backend connection recovered. Executing automatic syncNow.');
      syncScheduler.syncNow();
    });

    networkSentinel.subscribe(() => {
      notifyListeners();
    });

    // 2. Start Polling Heartbeat Interval (strictly gated on active session)
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      if (syncWorker.isBusy()) return;

      const session = await authService.getSession();
      if (!session || !session.token) {
        return; // No active session, do not poll or sync
      }

      const targetUserId = activeUserId || session.id;
      const pending = await syncQueueRepository.getPendingCount(targetUserId);
      if (pending > 0) {
        let isOnline = networkSentinel.isOnline();
        if (!isOnline) {
          isOnline = await networkSentinel.checkOnline();
        }
        if (isOnline) {
          console.log(`[SyncScheduler] Trigger 2: Polling heartbeat detected ${pending} pending mutations for user ${targetUserId}.`);
          await syncScheduler.syncNow(targetUserId);
        }
      }
    }, ENV.SYNC_INTERVAL_MS);

    // 3. Initialize Frontline Real-Time WebSocket coordinator
    driverRealtimeManager.init();

    notifyListeners();

    return () => {
      unsubSentinel();
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      driverRealtimeManager.destroy();
    };
  },

  /**
   * Trigger 3: Manual "Sync Now" button invocation
   */
  async syncNow(userId?: string): Promise<SyncResult> {
    notifyListeners();

    // 1. Session verification invariant: Do NOT sync without an authenticated session!
    const session = await authService.getSession();
    if (!session || !session.token) {
      console.log('[SyncScheduler] syncNow skipped: No active authenticated session.');
      notifyListeners();
      return { attempted: 0, synced: 0, failed: 0 };
    }

    const targetUserId = userId || activeUserId || session.id;

    // 2. Verify actual backend reachability before executing
    let isOnline = networkSentinel.isOnline();
    if (!isOnline) {
      isOnline = await networkSentinel.checkOnline();
    }

    if (!isOnline) {
      console.log('[SyncScheduler] syncNow halted: backend is offline.');
      notifyListeners();
      return { attempted: 0, synced: 0, failed: 0, offline: true };
    }

    const result = await syncWorker.runSyncCycle(25, targetUserId);
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
