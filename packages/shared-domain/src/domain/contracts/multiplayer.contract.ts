import type { MatchSnapshot, TimeControlConfig } from '../entities/match.entity.js';
import type { PieceColor } from '../value-objects/fen.vo.js';
import type { PromotionPiece } from '../value-objects/move.vo.js';

export type RoomColorPreference = 'w' | 'b' | 'random';
export type RoomPhase = 'lobby' | 'playing' | 'ended';
export type RoomRole = 'host' | 'guest';

export interface RoomParticipantView {
  role: RoomRole;
  nickname: string;
  color: PieceColor | null;
  isReady: boolean;
  connected: boolean;
}

export interface RoomStatePayload {
  code: string;
  phase: RoomPhase;
  host: RoomParticipantView;
  guest: RoomParticipantView | null;
  hostColorPreference: RoomColorPreference;
  timeControl: TimeControlConfig | null;
  match: MatchSnapshot | null;
}

export interface CreateRoomPayload {
  code?: string;
  password: string;
  nickname?: string;
  hostColorPreference: RoomColorPreference;
  timeControl: TimeControlConfig | null;
}

export interface JoinRoomPayload {
  code: string;
  password: string;
  nickname?: string;
}

export interface ReconnectRoomPayload {
  code: string;
  sessionToken: string;
}

export interface UpdateRoomConfigPayload {
  code: string;
  hostColorPreference: RoomColorPreference;
  timeControl: TimeControlConfig | null;
}

export interface RoomMovePayload {
  code: string;
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

export interface RoomSessionAck {
  ok: boolean;
  error?: string;
  room?: RoomStatePayload;
  sessionToken?: string;
  role?: RoomRole;
}

export interface RoomActionAck {
  ok: boolean;
  error?: string;
  room?: RoomStatePayload;
}
