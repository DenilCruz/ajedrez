import { PieceColor } from '../value-objects/fen.vo.js';

export type MatchEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'threefold_repetition'
  | 'insufficient_material'
  | 'fifty_move_rule'
  | 'timeout'
  | 'resignation';

export interface MatchEndedEventProps {
  matchId: string;
  reason: MatchEndReason;
  winner: PieceColor | null;
  occurredAt?: Date;
}

/**
 * Evento de dominio emitido en jaque mate, tablas, rendición o tiempo agotado.
 */
export class MatchEndedEvent {
  public readonly matchId: string;
  public readonly reason: MatchEndReason;
  public readonly winner: PieceColor | null;
  public readonly occurredAt: Date;

  constructor(props: MatchEndedEventProps) {
    this.matchId = props.matchId;
    this.reason = props.reason;
    this.winner = props.winner;
    this.occurredAt = props.occurredAt ? new Date(props.occurredAt.getTime()) : new Date();
  }
}
