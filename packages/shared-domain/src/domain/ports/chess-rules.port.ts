import { PieceColor } from '../value-objects/fen.vo.js';
import { PromotionPiece } from '../value-objects/move.vo.js';

export interface LegalMoveOption {
  from: string;
  to: string;
  promotion?: PromotionPiece;
  san: string;
}

export interface MoveExecutionResult {
  isValid: boolean;
  san: string;
  fenAfter: string;
  turnAfter: PieceColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isThreefoldRepetition: boolean;
  isInsufficientMaterial: boolean;
  isFiftyMoveRule: boolean;
  isGameOver: boolean;
  isCapture: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
  isPromotion: boolean;
}

/**
 * Contrato (Interface) de reglas oficiales de ajedrez.
 * Desacopla el dominio de cualquier librería concreta (ej. chess.js).
 */
export interface ChessRulesPort {
  loadFen(fen: string): void;
  reset(): void;
  getFen(): string;
  getTurn(): PieceColor;
  isValidMove(move: { from: string; to: string; promotion?: PromotionPiece }): boolean;
  applyMove(move: { from: string; to: string; promotion?: PromotionPiece }): MoveExecutionResult;
  getLegalMoves(square?: string): LegalMoveOption[];
  isCheck(): boolean;
  isCheckmate(): boolean;
  isStalemate(): boolean;
  isThreefoldRepetition(): boolean;
  isInsufficientMaterial(): boolean;
  isFiftyMoveRule(): boolean;
  isGameOver(): boolean;
  getKingSquare(color: PieceColor): string | null;
  getPgn(): string;
}
