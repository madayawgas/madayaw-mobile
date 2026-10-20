import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { ENV } from '@/config';
import { authService } from '@/services/authService';
import { networkSentinel } from '@/sync/networkSentinel';

export interface RealtimeEnvelope<T = any> {
  event: string;
  data: T;
  meta?: {
    timestamp: string;
    version: string;
  };
}

export type RealtimeEventHandler<T = any> = (data: T, envelope: RealtimeEnvelope<T>) => void;
export type ConnectionStateListener = (isConnected: boolean) => void;

class SocketClient {
  private socket: Socket | null = null;
  private currentToken: string | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private listeners: Map<string, Set<RealtimeEventHandler>> = new Map();
  private stateListeners: Set<ConnectionStateListener> = new Set();
  private initialized: boolean = false;

  private getSocketUrl(): string {
    return ENV.API_URL.replace(/\/api\/?$/, '');
  }

  /**
   * Initializes reactive lifecycle bindings:
   * 1. Listens to authService session changes (login/logout/revoked).
   * 2. Listens to networkSentinel offline/online transitions.
   */
  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Reactive Session State
    authService.subscribe((session, reason) => {
      if (session && session.token) {
        if (session.token !== this.currentToken || !this.isConnected) {
          this.connect(session.token);
        }
      } else {
        this.disconnect(reason === 'logout' ? 'User logged out' : 'Session invalidated');
      }
    });

    // 2. Network Recovery
    networkSentinel.onOnlineTransition(() => {
      if (this.currentToken && !this.isConnected && !this.isConnecting) {
        console.log('[SocketClient] Network restored. Re-establishing socket connection...');
        this.connect(this.currentToken);
      }
    });

    // 3. Network Offline Drop
    networkSentinel.subscribe((isOnline) => {
      if (!isOnline && this.socket && this.isConnected) {
        console.log('[SocketClient] Device offline in dead zone. Closing socket transport.');
        this.socket.disconnect();
        this.setConnectedState(false);
      }
    });

    // Initial session check
    authService.getSession().then((session) => {
      if (session?.token && networkSentinel.isOnline()) {
        this.connect(session.token);
      }
    }).catch((err) => {
      console.warn('[SocketClient] Failed to check initial session:', err);
    });
  }

  /**
   * Connect to backend Socket.IO server with Bearer auth token
   */
  public connect(token: string): void {
    if (!token) {
      console.warn('[SocketClient] Cannot connect without authentication token.');
      return;
    }

    // Reuse existing healthy socket if token matches
    if (this.socket && this.isConnected && this.currentToken === token) {
      return;
    }

    this.currentToken = token;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const socketUrl = this.getSocketUrl();
    console.log(`[SocketClient] Connecting to Socket.IO at ${socketUrl}...`);
    this.isConnecting = true;

    try {
      this.socket = io(socketUrl, {
        transports: ['polling', 'websocket'],
        extraHeaders: {
          Authorization: `Bearer ${token}`,
          ...(Platform.OS !== 'web' ? { Origin: 'https://madayawgas.vercel.app' } : {}),
        },
        auth: {
          token,
        },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        autoConnect: true,
      });

      this.socket.on('connect', () => {
        console.log(`[SocketClient] Connected successfully (ID: ${this.socket?.id}).`);
        this.isConnecting = false;
        this.setConnectedState(true);
      });

      this.socket.on('disconnect', (reason) => {
        console.log(`[SocketClient] Disconnected: ${reason}`);
        this.isConnecting = false;
        this.setConnectedState(false);
      });

      this.socket.on('connect_error', (err) => {
        console.warn(`[SocketClient] Connection error:`, err.message);
        this.isConnecting = false;
        this.setConnectedState(false);

        // Check if unauthorized handshake rejection
        if (err.message && err.message.toLowerCase().includes('unauthorized')) {
          console.warn('[SocketClient] Handshake unauthorized. Clearing invalid session.');
          authService.clearSession('revoked');
        }
      });

      // Bind all registered event listeners to socket
      this.listeners.forEach((handlers, event) => {
        this.bindSocketEvent(event);
      });

      // Global security event: Session revoked by server
      this.socket.on('AUTH_SESSION_REVOKED', (rawEnvelope: any) => {
        const envelope = this.normalizeEnvelope('AUTH_SESSION_REVOKED', rawEnvelope);
        console.warn('[SocketClient] Received AUTH_SESSION_REVOKED:', envelope.data);
        this.disconnect('Session revoked by server');
        authService.clearSession('revoked');
      });
    } catch (e) {
      console.error('[SocketClient] Exception establishing socket:', e);
      this.isConnecting = false;
      this.setConnectedState(false);
    }
  }

  /**
   * Disconnects the socket cleanly
   */
  public disconnect(reason?: string): void {
    if (reason) {
      console.log(`[SocketClient] Disconnecting: ${reason}`);
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
    this.isConnecting = false;
    this.setConnectedState(false);
  }

  /**
   * Subscribes a listener to a specific standardized application event
   */
  public on<T = any>(event: string, handler: RealtimeEventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
      if (this.socket) {
        this.bindSocketEvent(event);
      }
    }

    const handlers = this.listeners.get(event)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
        if (this.socket) {
          this.socket.off(event);
        }
      }
    };
  }

  /**
   * Binds incoming socket event to dispatch to all registered handlers
   */
  private bindSocketEvent(event: string): void {
    if (!this.socket) return;
    this.socket.off(event);
    this.socket.on(event, (raw: any) => {
      const envelope = this.normalizeEnvelope(event, raw);
      this.dispatchToListeners(event, envelope.data, envelope);
    });
  }

  /**
   * Normalizes incoming raw payloads into standard RealtimeEnvelope
   */
  private normalizeEnvelope<T = any>(event: string, raw: any): RealtimeEnvelope<T> {
    if (raw && typeof raw === 'object' && raw.event && raw.data !== undefined) {
      return raw as RealtimeEnvelope<T>;
    }
    return {
      event,
      data: (raw?.data !== undefined ? raw.data : raw) as T,
      meta: raw?.meta || {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
  }

  /**
   * Dispatches an event to local subscribers
   */
  private dispatchToListeners(event: string, data: any, envelope: RealtimeEnvelope): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    handlers.forEach((handler) => {
      try {
        handler(data, envelope);
      } catch (err) {
        console.error(`[SocketClient] Error in handler for event ${event}:`, err);
      }
    });
  }

  /**
   * Simulates an incoming real-time event for testing, development, and mock mode
   */
  public simulateEvent<T = any>(event: string, data: T): void {
    const envelope: RealtimeEnvelope<T> = {
      event,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0',
      },
    };
    console.log(`[SocketClient] Simulated event: ${event}`, data);
    this.dispatchToListeners(event, data, envelope);
  }

  /**
   * Subscribe to connection status changes
   */
  public subscribeConnection(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.isConnected);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setConnectedState(state: boolean): void {
    if (this.isConnected !== state) {
      this.isConnected = state;
      this.stateListeners.forEach((l) => {
        try {
          l(state);
        } catch (err) {
          console.error('[SocketClient] Error notifying state listener:', err);
        }
      });
    }
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}

export const socketClient = new SocketClient();
