import { randomBytes } from 'node:crypto';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  ReconnectRoomPayload,
  RoomActionAck,
  RoomMovePayload,
  RoomRole,
  RoomSessionAck,
  UpdateRoomConfigPayload,
} from '@chess-platform/shared-domain';
import { GameRoom } from '../../domain/entities/game-room.entity.js';
import {
  ROOM_REPOSITORY,
  type RoomRepositoryPort,
} from '../../domain/repositories/room.repository.port.js';

const DISCONNECT_GRACE_MS = 30_000;
const CLOCK_TICK_INTERVAL_MS = 500;

function generateRandomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GameGateway
  implements OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private clockInterval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ROOM_REPOSITORY)
    private readonly roomRepo: RoomRepositoryPort,
  ) {}

  public onModuleInit(): void {
    this.clockInterval = setInterval(() => {
      const nowMs = Date.now();
      for (const room of this.roomRepo.findAllPlaying()) {
        const timedOut = room.syncClock(nowMs);
        if (timedOut) {
          this.broadcastRoomState(room);
        }
      }
    }, CLOCK_TICK_INTERVAL_MS);
  }

  public onModuleDestroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }

  public handleDisconnect(client: Socket): void {
    const room = this.roomRepo.findBySocketId(client.id);
    if (!room) return;

    const role = room.markDisconnected(client.id);
    if (!role) return;

    const roomKey = room.code;
    this.broadcastRoomState(room);

    const timerKey = `${roomKey}:${role}`;
    const existing = this.disconnectTimers.get(timerKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(timerKey);
      const currentRoom = this.roomRepo.findByCode(roomKey);
      if (!currentRoom) return;

      const participant =
        role === 'host' ? currentRoom.host : currentRoom.guest;
      if (!participant || participant.connected) return;

      if (currentRoom.phase === 'playing') {
        const forfeited = currentRoom.forfeitDisconnected(role);
        if (forfeited) {
          this.broadcastRoomState(currentRoom);
        }
      } else if (currentRoom.phase === 'lobby') {
        if (role === 'guest') {
          currentRoom.guest = null;
          this.broadcastRoomState(currentRoom);
        } else {
          this.server
            .to(roomKey)
            .emit('room:closed', { code: roomKey, reason: 'El anfitrión salió de la sala.' });
          this.roomRepo.delete(roomKey);
        }
      }
    }, DISCONNECT_GRACE_MS);

    this.disconnectTimers.set(timerKey, timer);
  }

  @SubscribeMessage('room:create')
  public handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CreateRoomPayload,
  ): RoomSessionAck {
    try {
      const requestedName = payload.code?.trim().replace(/\s+/g, ' ');
      let roomName: string;

      if (requestedName) {
        if (this.roomRepo.findByCode(requestedName)) {
          return {
            ok: false,
            error: `Ya existe una sala llamada "${requestedName}".`,
          };
        }
        roomName = requestedName;
      } else {
        let candidate = `Sala-${generateRandomRoomCode()}`;
        while (this.roomRepo.findByCode(candidate)) {
          candidate = `Sala-${generateRandomRoomCode()}`;
        }
        roomName = candidate;
      }

      const room = GameRoom.create({
        code: roomName,
        password: payload.password,
        hostNickname: payload.nickname,
        hostSocketId: client.id,
        hostColorPreference: payload.hostColorPreference ?? 'w',
        timeControl: payload.timeControl ?? null,
      });

      this.roomRepo.save(room);
      void client.join(room.code);

      return {
        ok: true,
        room: room.toPayload(),
        sessionToken: room.host.sessionToken,
        role: 'host',
      };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error al crear la sala.',
      };
    }
  }

  @SubscribeMessage('room:join')
  public handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): RoomSessionAck {
    try {
      const roomName = payload.code?.trim().replace(/\s+/g, ' ');
      if (!roomName) {
        return { ok: false, error: 'Ingresa el nombre de la sala.' };
      }

      const room = this.roomRepo.findByCode(roomName);
      if (!room) {
        return { ok: false, error: 'No se encontró ninguna sala con ese nombre.' };
      }

      if (!room.verifyPassword(payload.password ?? '')) {
        return { ok: false, error: 'Contraseña incorrecta.' };
      }

      const guest = room.joinGuest(payload.nickname, client.id);
      this.clearDisconnectTimer(room.code, 'guest');
      void client.join(room.code);
      this.broadcastRoomState(room);

      return {
        ok: true,
        room: room.toPayload(),
        sessionToken: guest.sessionToken,
        role: 'guest',
      };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error al unirse a la sala.',
      };
    }
  }

  @SubscribeMessage('room:reconnect')
  public handleReconnectRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ReconnectRoomPayload,
  ): RoomSessionAck {
    const roomName = payload.code?.trim().replace(/\s+/g, ' ');
    if (!roomName || !payload.sessionToken) {
      return { ok: false, error: 'Sesión inválida.' };
    }

    const room = this.roomRepo.findByCode(roomName);
    if (!room) {
      return { ok: false, error: 'La sala ya no existe.' };
    }

    const participant = room.reconnectParticipant(
      payload.sessionToken,
      client.id,
    );
    if (!participant) {
      return { ok: false, error: 'Token de sesión expirado o inválido.' };
    }

    this.clearDisconnectTimer(room.code, participant.role);
    void client.join(room.code);
    this.broadcastRoomState(room);

    return {
      ok: true,
      room: room.toPayload(),
      sessionToken: participant.sessionToken,
      role: participant.role,
    };
  }

  @SubscribeMessage('room:toggle_ready')
  public handleToggleReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string },
  ): RoomActionAck {
    try {
      const room = this.requireRoom(payload.code);
      room.toggleGuestReady(client.id);
      this.broadcastRoomState(room);
      return { ok: true, room: room.toPayload() };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'No se pudo cambiar Listo.',
      };
    }
  }

  @SubscribeMessage('room:update_config')
  public handleUpdateConfig(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UpdateRoomConfigPayload,
  ): RoomActionAck {
    try {
      const room = this.requireRoom(payload.code);
      room.updateConfig(
        client.id,
        payload.hostColorPreference,
        payload.timeControl,
      );
      this.broadcastRoomState(room);
      return { ok: true, room: room.toPayload() };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error al actualizar configuración.',
      };
    }
  }

  @SubscribeMessage('room:start_match')
  public handleStartMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string },
  ): RoomActionAck {
    try {
      const room = this.requireRoom(payload.code);
      room.startMatch(client.id, Date.now());
      this.broadcastRoomState(room);
      return { ok: true, room: room.toPayload() };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'No se pudo iniciar la partida.',
      };
    }
  }

  @SubscribeMessage('room:move')
  public handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RoomMovePayload,
  ): RoomActionAck {
    try {
      const room = this.requireRoom(payload.code);
      room.makeMove(
        client.id,
        payload.from,
        payload.to,
        payload.promotion,
        Date.now(),
      );
      this.broadcastRoomState(room);
      return { ok: true, room: room.toPayload() };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Jugada inválida.',
      };
    }
  }

  @SubscribeMessage('room:resign')
  public handleResign(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string },
  ): RoomActionAck {
    try {
      const room = this.requireRoom(payload.code);
      room.resign(client.id);
      this.broadcastRoomState(room);
      return { ok: true, room: room.toPayload() };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'No se pudo rendir.',
      };
    }
  }

  @SubscribeMessage('room:return_to_lobby')
  public handleReturnToLobby(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string },
  ): RoomActionAck {
    try {
      const room = this.requireRoom(payload.code);
      room.returnToLobby(client.id);
      this.broadcastRoomState(room);
      return { ok: true, room: room.toPayload() };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'No se pudo volver a la sala.',
      };
    }
  }

  @SubscribeMessage('room:leave')
  public handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string },
  ): RoomActionAck {
    const roomName = payload.code?.trim().replace(/\s+/g, ' ');
    const room = roomName ? this.roomRepo.findByCode(roomName) : null;
    if (!room) return { ok: true };

    const participant = room.findParticipantBySocket(client.id);
    if (!participant) return { ok: true };

    void client.leave(room.code);
    this.clearDisconnectTimer(room.code, participant.role);

    if (participant.role === 'host') {
      this.server
        .to(room.code)
        .emit('room:closed', { code: room.code, reason: 'El anfitrión cerró la sala.' });
      this.roomRepo.delete(room.code);
    } else {
      if (room.phase === 'playing') {
        room.resign(client.id);
      }
      room.guest = null;
      this.broadcastRoomState(room);
    }

    return { ok: true };
  }

  private requireRoom(code: string): GameRoom {
    const room = this.roomRepo.findByCode(code);
    if (!room) {
      throw new Error('La sala no existe o ha expirado.');
    }
    return room;
  }

  private broadcastRoomState(room: GameRoom): void {
    this.server.to(room.code.toString()).emit('room:state', room.toPayload());
  }

  private clearDisconnectTimer(code: string, role: RoomRole): void {
    const timerKey = `${code}:${role}`;
    const timer = this.disconnectTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(timerKey);
    }
  }
}
