import { PieceColor } from '../value-objects/fen.vo.js';
import { Move } from '../value-objects/move.vo.js';

export interface MoveMadeEventProps {
  matchId: string;
  move: Move;
  san: string;
  fenAfter: string;
  turnAfter: PieceColor;
  isCheck: boolean;
  isCapture: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
  isPromotion: boolean;
  occurredAt?: Date;
}

/**
 * Evento de dominio emitido cuando se ejecuta una jugada válida.
 */
export class MoveMadeEvent {
  public readonly matchId: string;
  public readonly move: Move;
  public readonly san: string;
  public readonly fenAfter: string;
  public readonly turnAfter: PieceColor;
  public readonly isCheck: boolean;
  public readonly isCapture: boolean;
  public readonly isCastle: boolean;
  public readonly isEnPassant: boolean;
  public readonly isPromotion: boolean;
  public readonly occurredAt: Date;

  constructor(props: MoveMadeEventProps) {
    this.matchId = props.matchId;
    this.move = props.move;
    this.san = props.san;
    this.fenAfter = props.fenAfter;
    this.turnAfter = props.turnAfter;
    this.isCheck = props.isCheck;
    this.isCapture = props.isCapture;
    this.isCastle = props.isCastle;
    this.isEnPassant = props.isEnPassant;
    this.isPromotion = props.isPromotion;
    this.occurredAt = props.occurredAt ? new Date(props.occurredAt.getTime()) : new Date();
  }
}
