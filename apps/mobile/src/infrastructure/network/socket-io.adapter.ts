import { NativeModules } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  ReconnectRoomPayload,
  RoomActionAck,
  RoomMovePayload,
  RoomSessionAck,
  RoomStatePayload,
  UpdateRoomConfigPayload,
} from '@chess-platform/shared-domain';
import type { MultiplayerPort } from '../../domain/ports/multiplayer.port';

const DEFAULT_SERVER_URL = 'http://localhost:3000';
const ACK_TIMEOUT_MS = 6_000;

function resolveInitialUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim();
  }

  try {
    const scriptURL = (
      NativeModules as { SourceCode?: { scriptURL?: string } }
    )?.SourceCode?.scriptURL;
    if (typeof scriptURL === 'string') {
      const match = scriptURL.match(/^https?:\/\/([^/:]+)/);
      const host = match?.[1];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:3000`;
      }
    }
  } catch {
    // Fallback to DEFAULT_SERVER_URL
  }

  return DEFAULT_SERVER_URL;
}

/**
 * Conexión al backend NestJS usando socket.io-client.
 */
export class SocketIoAdapter implements MultiplayerPort {
  private serverUrl: string;
  private socket: Socket;
  private roomStateListeners = new Set<(room: RoomStatePayload) => void>();
  private roomClosedListeners = new Set<
    (payload: { code: string; reason: string }) => void
  >();
  private connectionListeners = new Set<(connected: boolean) => void>();

  constructor(initialUrl: string = resolveInitialUrl()) {
    this.serverUrl = initialUrl;
    this.socket = this.createSocket(initialUrl);
  }

  private createSocket(url: string): Socket {
    const sock = io(url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    sock.on('room:state', (room: RoomStatePayload) => {
      for (const listener of this.roomStateListeners) {
        listener(room);
      }
    });

    sock.on('room:closed', (payload: { code: string; reason: string }) => {
      for (const listener of this.roomClosedListeners) {
        listener(payload);
      }
    });

    sock.on('connect', () => {
      for (const listener of this.connectionListeners) {
        listener(true);
      }
    });

    sock.on('disconnect', () => {
      for (const listener of this.connectionListeners) {
        listener(false);
      }
    });

    return sock;
  }

  public setServerUrl(url: string): void {
    const cleaned = url.trim();
    if (!cleaned || cleaned === this.serverUrl) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.serverUrl = cleaned;
    this.socket = this.createSocket(cleaned);
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  public disconnect(): void {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  public isConnected(): boolean {
    return this.socket.connected;
  }

  public createRoom(payload: CreateRoomPayload): Promise<RoomSessionAck> {
    return this.emitWithAck<RoomSessionAck>('room:create', payload);
  }

  public joinRoom(payload: JoinRoomPayload): Promise<RoomSessionAck> {
    return this.emitWithAck<RoomSessionAck>('room:join', payload);
  }

  public reconnectRoom(payload: ReconnectRoomPayload): Promise<RoomSessionAck> {
    return this.emitWithAck<RoomSessionAck>('room:reconnect', payload);
  }

  public toggleReady(code: string): Promise<RoomActionAck> {
    return this.emitWithAck<RoomActionAck>('room:toggle_ready', { code });
  }

  public updateConfig(payload: UpdateRoomConfigPayload): Promise<RoomActionAck> {
    return this.emitWithAck<RoomActionAck>('room:update_config', payload);
  }

  public startMatch(code: string): Promise<RoomActionAck> {
    return this.emitWithAck<RoomActionAck>('room:start_match', { code });
  }

  public sendMove(payload: RoomMovePayload): Promise<RoomActionAck> {
    return this.emitWithAck<RoomActionAck>('room:move', payload);
  }

  public resign(code: string): Promise<RoomActionAck> {
    return this.emitWithAck<RoomActionAck>('room:resign', { code });
  }

  public returnToLobby(code: string): Promise<RoomActionAck> {
    return this.emitWithAck<RoomActionAck>('room:return_to_lobby', { code });
  }

  public leaveRoom(code: string): Promise<RoomActionAck> {
    return this.emitWithAck<RoomActionAck>('room:leave', { code });
  }

  public onRoomState(listener: (room: RoomStatePayload) => void): () => void {
    this.roomStateListeners.add(listener);
    return () => {
      this.roomStateListeners.delete(listener);
    };
  }

  public onRoomClosed(
    listener: (payload: { code: string; reason: string }) => void,
  ): () => void {
    this.roomClosedListeners.add(listener);
    return () => {
      this.roomClosedListeners.delete(listener);
    };
  }

  public onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket.connected) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('No se pudo conectar al servidor multijugador.'));
      }, ACK_TIMEOUT_MS);

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onConnectError = () => {
        cleanup();
        reject(new Error('Error de conexión con el servidor multijugador.'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onConnectError);
      };

      this.socket.on('connect', onConnect);
      this.socket.on('connect_error', onConnectError);
      this.socket.connect();
    });
  }

  private async emitWithAck<T extends { ok: boolean; error?: string }>(
    event: string,
    payload: unknown,
  ): Promise<T> {
    try {
      await this.ensureConnected();
      const response = (await this.socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck(event, payload)) as T;
      return response;
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Tiempo de espera agotado al comunicarse con el servidor.',
      } as T;
    }
  }
}
