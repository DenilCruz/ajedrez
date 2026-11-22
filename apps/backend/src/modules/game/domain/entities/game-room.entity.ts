import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  ChessJsAdapter,
  Match,
  Move,
  Player,
  type PieceColor,
  type PromotionPiece,
  type RoomColorPreference,
  type RoomParticipantView,
  type RoomPhase,
  type RoomRole,
  type RoomStatePayload,
  type TimeControlConfig,
} from '@chess-platform/shared-domain';

export interface RoomParticipantState extends RoomParticipantView {
  sessionToken: string;
  socketId: string | null;
}

function hashPassword(password: string, saltHex: string): string {
  return scryptSync(password, saltHex, 32).toString('hex');
}

function createSessionToken(): string {
  return randomBytes(18).toString('hex');
}

/**
 * Entidad de dominio: sala privada multijugador sin cuentas.
 */
export class GameRoom {
  public readonly code: string;
  private readonly passwordSalt: string;
  private readonly passwordHash: string;

  public phase: RoomPhase = 'lobby';
  public host: RoomParticipantState;
  public guest: RoomParticipantState | null = null;
  public hostColorPreference: RoomColorPreference;
  public timeControl: TimeControlConfig | null;
  public match: Match | null = null;
  public lastTickAtMs: number | null = null;

  private constructor(params: {
    code: string;
    passwordSalt: string;
    passwordHash: string;
    host: RoomParticipantState;
    hostColorPreference: RoomColorPreference;
    timeControl: TimeControlConfig | null;
  }) {
    this.code = params.code;
    this.passwordSalt = params.passwordSalt;
    this.passwordHash = params.passwordHash;
    this.host = params.host;
    this.hostColorPreference = params.hostColorPreference;
    this.timeControl = params.timeControl;
  }

  public static create(params: {
    code: string;
    password: string;
    hostNickname?: string;
    hostSocketId: string;
    hostColorPreference: RoomColorPreference;
    timeControl: TimeControlConfig | null;
  }): GameRoom {
    const trimmedName = params.code.trim().replace(/\s+/g, ' ');
    if (trimmedName.length < 2 || trimmedName.length > 32) {
      throw new Error(
        'El nombre de la sala debe tener entre 2 y 32 caracteres.',
      );
    }

    const trimmedPassword = params.password.trim();
    if (trimmedPassword.length < 1) {
      throw new Error('La contraseña de la sala es obligatoria.');
    }

    const salt = randomBytes(12).toString('hex');
    const hash = hashPassword(trimmedPassword, salt);
    const nickname = params.hostNickname?.trim() || 'Anfitrión';

    return new GameRoom({
      code: trimmedName,
      passwordSalt: salt,
      passwordHash: hash,
      host: {
        role: 'host',
        nickname,
        color: null,
        isReady: true,
        connected: true,
        sessionToken: createSessionToken(),
        socketId: params.hostSocketId,
      },
      hostColorPreference: params.hostColorPreference,
      timeControl: params.timeControl,
    });
  }

  public verifyPassword(rawPassword: string): boolean {
    const candidateHash = Buffer.from(
      hashPassword(rawPassword.trim(), this.passwordSalt),
      'hex',
    );
    const storedHash = Buffer.from(this.passwordHash, 'hex');
    if (candidateHash.length !== storedHash.length) {
      return false;
    }
    return timingSafeEqual(candidateHash, storedHash);
  }

  public joinGuest(
    rawNickname: string | undefined,
    socketId: string,
  ): RoomParticipantState {
    if (this.phase !== 'lobby') {
      throw new Error('La partida ya comenzó en esta sala.');
    }
    if (this.guest && this.guest.connected) {
      throw new Error('La sala ya está llena.');
    }

    const nickname = rawNickname?.trim() || 'Invitado';
    this.guest = {
      role: 'guest',
      nickname,
      color: null,
      isReady: false,
      connected: true,
      sessionToken: createSessionToken(),
      socketId,
    };

    return this.guest;
  }

  public findParticipantBySocket(socketId: string): RoomParticipantState | null {
    if (this.host.socketId === socketId) return this.host;
    if (this.guest?.socketId === socketId) return this.guest;
    return null;
  }

  public findParticipantByToken(
    sessionToken: string,
  ): RoomParticipantState | null {
    if (this.host.sessionToken === sessionToken) return this.host;
    if (this.guest?.sessionToken === sessionToken) return this.guest;
    return null;
  }

  public reconnectParticipant(
    sessionToken: string,
    socketId: string,
  ): RoomParticipantState | null {
    const participant = this.findParticipantByToken(sessionToken);
    if (!participant) return null;
    participant.socketId = socketId;
    participant.connected = true;
    return participant;
  }

  public markDisconnected(socketId: string): RoomRole | null {
    const participant = this.findParticipantBySocket(socketId);
    if (!participant) return null;
    participant.connected = false;
    participant.socketId = null;
    return participant.role;
  }

  public toggleGuestReady(socketId: string): void {
    if (this.phase !== 'lobby') {
      throw new Error('Solo puedes cambiar el estado Listo en el lobby.');
    }
    if (!this.guest || this.guest.socketId !== socketId) {
      throw new Error('Solo el invitado puede marcar Listo.');
    }
    this.guest.isReady = !this.guest.isReady;
  }

  public updateConfig(
    socketId: string,
    hostColorPreference: RoomColorPreference,
    timeControl: TimeControlConfig | null,
  ): void {
    if (this.phase !== 'lobby') {
      throw new Error('Solo puedes cambiar la configuración en el lobby.');
    }
    if (this.host.socketId !== socketId) {
      throw new Error('Solo el anfitrión puede modificar la configuración.');
    }
    this.hostColorPreference = hostColorPreference;
    this.timeControl = timeControl;
  }

  public startMatch(socketId: string, nowMs: number = Date.now()): void {
    if (this.phase !== 'lobby') {
      throw new Error('La partida ya está en curso.');
    }
    if (this.host.socketId !== socketId) {
      throw new Error('Solo el anfitrión puede iniciar la partida.');
    }
    if (!this.guest || !this.guest.connected) {
      throw new Error('Falta que tu amigo se una a la sala.');
    }
    if (!this.guest.isReady) {
      throw new Error('Tu amigo debe marcar Listo primero.');
    }

    const hostColor: PieceColor =
      this.hostColorPreference === 'random'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : this.hostColorPreference;
    const guestColor: PieceColor = hostColor === 'w' ? 'b' : 'w';

    this.host.color = hostColor;
    this.guest.color = guestColor;

    const initialTimeMs = this.timeControl ? this.timeControl.initialMs : null;
    const whiteParticipant = hostColor === 'w' ? this.host : this.guest;
    const blackParticipant = hostColor === 'b' ? this.host : this.guest;

    const whitePlayer = new Player({
      id: whiteParticipant.role,
      name: whiteParticipant.nickname,
      color: 'w',
      remainingTimeMs: initialTimeMs,
      isAi: false,
    });

    const blackPlayer = new Player({
      id: blackParticipant.role,
      name: blackParticipant.nickname,
      color: 'b',
      remainingTimeMs: initialTimeMs,
      isAi: false,
    });

    this.match = Match.create({
      id: `room-${this.code.toString()}-${nowMs}`,
      rules: new ChessJsAdapter(),
      whitePlayer,
      blackPlayer,
      timeControl: this.timeControl,
    });

    this.phase = 'playing';
    this.lastTickAtMs = nowMs;
  }

  public makeMove(
    socketId: string,
    from: string,
    to: string,
    promotion?: PromotionPiece,
    nowMs: number = Date.now(),
  ): void {
    if (this.phase !== 'playing' || !this.match) {
      throw new Error('No hay una partida activa.');
    }

    const participant = this.findParticipantBySocket(socketId);
    if (!participant || !participant.color) {
      throw new Error('No perteneces a esta partida.');
    }

    this.syncClock(nowMs);
    if (this.phase !== 'playing') {
      return;
    }

    const snapBefore = this.match.getSnapshot();
    if (snapBefore.turn !== participant.color) {
      throw new Error('No es tu turno.');
    }

    this.match.playMove(Move.create({ from, to, promotion }));
    this.lastTickAtMs = nowMs;

    if (this.match.getSnapshot().status === 'ended') {
      this.phase = 'ended';
    }
  }

  public resign(socketId: string): void {
    if (this.phase !== 'playing' || !this.match) {
      throw new Error('No hay una partida activa.');
    }

    const participant = this.findParticipantBySocket(socketId);
    if (!participant || !participant.color) {
      throw new Error('No perteneces a esta partida.');
    }

    this.match.resign(participant.color);
    this.phase = 'ended';
    this.lastTickAtMs = null;
  }

  public forfeitDisconnected(role: RoomRole): boolean {
    if (this.phase !== 'playing' || !this.match) {
      return false;
    }
    const participant = role === 'host' ? this.host : this.guest;
    if (!participant || participant.connected || !participant.color) {
      return false;
    }
    this.match.resign(participant.color);
    this.phase = 'ended';
    this.lastTickAtMs = null;
    return true;
  }

  public syncClock(nowMs: number = Date.now()): boolean {
    if (!this.match || this.phase !== 'playing' || this.timeControl === null) {
      this.lastTickAtMs = nowMs;
      return false;
    }

    if (this.match.getSnapshot().history.length === 0) {
      this.lastTickAtMs = nowMs;
      return false;
    }

    const prevMs = this.lastTickAtMs ?? nowMs;
    const elapsed = Math.max(0, nowMs - prevMs);
    this.lastTickAtMs = nowMs;
    if (elapsed === 0) {
      return false;
    }

    this.match.tickClock(elapsed);
    if (this.match.getSnapshot().status === 'ended') {
      this.phase = 'ended';
      this.lastTickAtMs = null;
      return true;
    }
    return false;
  }

  public returnToLobby(socketId: string): void {
    const participant = this.findParticipantBySocket(socketId);
    if (!participant) {
      throw new Error('No perteneces a esta sala.');
    }
    if (this.phase !== 'ended') {
      throw new Error('La partida aún no ha terminado.');
    }

    this.phase = 'lobby';
    this.match = null;
    this.lastTickAtMs = null;
    this.host.color = null;
    this.host.isReady = true;
    if (this.guest) {
      this.guest.color = null;
      this.guest.isReady = false;
    }
  }

  public toPayload(): RoomStatePayload {
    return {
      code: this.code.toString(),
      phase: this.phase,
      host: {
        role: this.host.role,
        nickname: this.host.nickname,
        color: this.host.color,
        isReady: this.host.isReady,
        connected: this.host.connected,
      },
      guest: this.guest
        ? {
            role: this.guest.role,
            nickname: this.guest.nickname,
            color: this.guest.color,
            isReady: this.guest.isReady,
            connected: this.guest.connected,
          }
        : null,
      hostColorPreference: this.hostColorPreference,
      timeControl: this.timeControl,
      match: this.match ? this.match.getSnapshot() : null,
    };
  }
}
