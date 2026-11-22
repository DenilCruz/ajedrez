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

export interface MultiplayerPort {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  createRoom(payload: CreateRoomPayload): Promise<RoomSessionAck>;
  joinRoom(payload: JoinRoomPayload): Promise<RoomSessionAck>;
  reconnectRoom(payload: ReconnectRoomPayload): Promise<RoomSessionAck>;
  toggleReady(code: string): Promise<RoomActionAck>;
  updateConfig(payload: UpdateRoomConfigPayload): Promise<RoomActionAck>;
  startMatch(code: string): Promise<RoomActionAck>;
  sendMove(payload: RoomMovePayload): Promise<RoomActionAck>;
  resign(code: string): Promise<RoomActionAck>;
  returnToLobby(code: string): Promise<RoomActionAck>;
  leaveRoom(code: string): Promise<RoomActionAck>;
  onRoomState(listener: (room: RoomStatePayload) => void): () => void;
  onRoomClosed(
    listener: (payload: { code: string; reason: string }) => void,
  ): () => void;
  onConnectionChange(listener: (connected: boolean) => void): () => void;
}
