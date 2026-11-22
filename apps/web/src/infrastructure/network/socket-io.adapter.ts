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

function resolveServerUrl(): string {
  const envUrl = import.meta.env?.VITE_BACKEND_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim();
  }
  return DEFAULT_SERVER_URL;
}

/**
 * Implementa MultiplayerPort usando socket.io-client.
 */
export class SocketIoAdapter implements MultiplayerPort {
  private readonly socket: Socket;

  constructor(serverUrl: string = resolveServerUrl()) {
    this.socket = io(serverUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
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
    this.socket.on('room:state', listener);
    return () => {
      this.socket.off('room:state', listener);
    };
  }

  public onRoomClosed(
    listener: (payload: { code: string; reason: string }) => void,
  ): () => void {
    this.socket.on('room:closed', listener);
    return () => {
      this.socket.off('room:closed', listener);
    };
  }

  public onConnectionChange(listener: (connected: boolean) => void): () => void {
    const onConnect = () => listener(true);
    const onDisconnect = () => listener(false);
    this.socket.on('connect', onConnect);
    this.socket.on('disconnect', onDisconnect);
    return () => {
      this.socket.off('connect', onConnect);
      this.socket.off('disconnect', onDisconnect);
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket.connected) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
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
        window.clearTimeout(timeout);
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
