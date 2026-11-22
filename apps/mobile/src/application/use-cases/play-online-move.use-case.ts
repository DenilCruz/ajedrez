import {
  Move,
  type PromotionPiece,
  type RoomActionAck,
} from '@chess-platform/shared-domain';
import type { MultiplayerPort } from '../../domain/ports/multiplayer.port';

export interface PlayOnlineMoveParams {
  code: string;
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

/**
 * Caso de uso: valida formato de jugada y la envía al servidor por Socket.io.
 */
export class PlayOnlineMoveUseCase {
  private readonly multiplayer: MultiplayerPort;

  constructor(multiplayer: MultiplayerPort) {
    this.multiplayer = multiplayer;
  }

  public execute(params: PlayOnlineMoveParams): Promise<RoomActionAck> {
    const move = Move.create({
      from: params.from,
      to: params.to,
      promotion: params.promotion,
    });
    return this.multiplayer.sendMove({
      code: params.code,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
  }
}
