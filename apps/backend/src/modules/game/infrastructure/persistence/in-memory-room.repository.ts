import { Injectable } from '@nestjs/common';
import type { GameRoom } from '../../domain/entities/game-room.entity.js';
import type { RoomRepositoryPort } from '../../domain/repositories/room.repository.port.js';

@Injectable()
export class InMemoryRoomRepository implements RoomRepositoryPort {
  private readonly rooms = new Map<string, GameRoom>();

  private normalizeKey(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  public save(room: GameRoom): void {
    this.rooms.set(this.normalizeKey(room.code), room);
  }

  public findByCode(code: string): GameRoom | null {
    return this.rooms.get(this.normalizeKey(code)) ?? null;
  }

  public findBySocketId(socketId: string): GameRoom | null {
    for (const room of this.rooms.values()) {
      if (room.findParticipantBySocket(socketId)) {
        return room;
      }
    }
    return null;
  }

  public findAllPlaying(): GameRoom[] {
    const active: GameRoom[] = [];
    for (const room of this.rooms.values()) {
      if (room.phase === 'playing') {
        active.push(room);
      }
    }
    return active;
  }

  public delete(code: string): void {
    this.rooms.delete(this.normalizeKey(code));
  }
}
