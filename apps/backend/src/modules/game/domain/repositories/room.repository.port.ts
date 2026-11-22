import type { GameRoom } from '../entities/game-room.entity.js';

export const ROOM_REPOSITORY = Symbol('ROOM_REPOSITORY');

/**
 * Puerto para gestionar salas activas en memoria o almacenamiento distribuido.
 */
export interface RoomRepositoryPort {
  save(room: GameRoom): void;
  findByCode(code: string): GameRoom | null;
  findBySocketId(socketId: string): GameRoom | null;
  findAllPlaying(): GameRoom[];
  delete(code: string): void;
}
