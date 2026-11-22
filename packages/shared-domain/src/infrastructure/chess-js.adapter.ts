import { Chess, Move as ChessJsMove } from 'chess.js';
import {
  ChessRulesPort,
  LegalMoveOption,
  MoveExecutionResult,
} from '../domain/ports/chess-rules.port.js';
import { PieceColor } from '../domain/value-objects/fen.vo.js';
import { PromotionPiece } from '../domain/value-objects/move.vo.js';

/**
 * Implementa ChessRulesPort usando chess.js sin exponer detalles internos de la librería.
 */
export class ChessJsAdapter implements ChessRulesPort {
  readonly #chess: Chess;

  constructor(initialFen?: string) {
    this.#chess = initialFen !== undefined ? new Chess(initialFen.trim()) : new Chess();
  }

  public loadFen(fen: string): void {
    this.#chess.load(fen.trim());
  }

  public reset(): void {
    this.#chess.reset();
  }

  public getFen(): string {
    return this.#chess.fen();
  }

  public getTurn(): PieceColor {
    return this.#chess.turn() as PieceColor;
  }

  public isValidMove(move: {
    from: string;
    to: string;
    promotion?: PromotionPiece;
  }): boolean {
    if (!move.from || !move.to) {
      return false;
    }
    const legal = this.#chess.moves({
      square: move.from as ChessJsMove['from'],
      verbose: true,
    });
    return legal.some(
      (candidate) =>
        candidate.from === move.from &&
        candidate.to === move.to &&
        candidate.promotion === move.promotion,
    );
  }

  public applyMove(move: {
    from: string;
    to: string;
    promotion?: PromotionPiece;
  }): MoveExecutionResult {
    if (!this.isValidMove(move)) {
      return this.createInvalidMoveResult();
    }

    try {
      const applied = this.#chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });

      return {
        isValid: true,
        san: applied.san,
        fenAfter: this.#chess.fen(),
        turnAfter: this.getTurn(),
        isCheck: this.isCheck(),
        isCheckmate: this.isCheckmate(),
        isStalemate: this.isStalemate(),
        isThreefoldRepetition: this.isThreefoldRepetition(),
        isInsufficientMaterial: this.isInsufficientMaterial(),
        isFiftyMoveRule: this.isFiftyMoveRule(),
        isGameOver: this.isGameOver(),
        isCapture: Boolean(applied.captured),
        isCastle: applied.isKingsideCastle() || applied.isQueensideCastle(),
        isEnPassant: applied.isEnPassant(),
        isPromotion: applied.isPromotion(),
      };
    } catch {
      return this.createInvalidMoveResult();
    }
  }

  public getLegalMoves(square?: string): LegalMoveOption[] {
    if (square !== undefined && square.length === 0) {
      return [];
    }
    const verboseMoves = square
      ? this.#chess.moves({ square: square as ChessJsMove['from'], verbose: true })
      : this.#chess.moves({ verbose: true });

    return verboseMoves.map((m) => ({
      from: m.from,
      to: m.to,
      promotion: m.promotion as PromotionPiece | undefined,
      san: m.san,
    }));
  }

  public isCheck(): boolean {
    return this.#chess.isCheck();
  }

  public isCheckmate(): boolean {
    return this.#chess.isCheckmate();
  }

  public isStalemate(): boolean {
    return this.#chess.isStalemate();
  }

  public isThreefoldRepetition(): boolean {
    return this.#chess.isThreefoldRepetition();
  }

  public isInsufficientMaterial(): boolean {
    return this.#chess.isInsufficientMaterial();
  }

  public isFiftyMoveRule(): boolean {
    return this.#chess.isDrawByFiftyMoves();
  }

  public isGameOver(): boolean {
    return this.#chess.isGameOver();
  }

  public getKingSquare(color: PieceColor): string | null {
    const board = this.#chess.board();
    for (const row of board) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === color) {
          return cell.square;
        }
      }
    }
    return null;
  }

  public getPgn(): string {
    return this.#chess.pgn();
  }

  private createInvalidMoveResult(): MoveExecutionResult {
    return {
      isValid: false,
      san: '',
      fenAfter: this.getFen(),
      turnAfter: this.getTurn(),
      isCheck: this.isCheck(),
      isCheckmate: this.isCheckmate(),
      isStalemate: this.isStalemate(),
      isThreefoldRepetition: this.isThreefoldRepetition(),
      isInsufficientMaterial: this.isInsufficientMaterial(),
      isFiftyMoveRule: this.isFiftyMoveRule(),
      isGameOver: this.isGameOver(),
      isCapture: false,
      isCastle: false,
      isEnPassant: false,
      isPromotion: false,
    };
  }
}
