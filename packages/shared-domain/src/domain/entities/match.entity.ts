import { MatchEndedEvent, MatchEndReason } from '../events/match-ended.event.js';
import { MoveMadeEvent } from '../events/move-made.event.js';
import { ChessRulesPort, LegalMoveOption } from '../ports/chess-rules.port.js';
import { PieceColor } from '../value-objects/fen.vo.js';
import { Move } from '../value-objects/move.vo.js';
import { Player } from './player.entity.js';

export type MatchStatus = 'playing' | 'ended';

export interface TimeControlConfig {
  initialMs: number;
  incrementMs: number;
}

export interface MoveHistoryEntry {
  moveNumber: number;
  color: PieceColor;
  san: string;
  from: string;
  to: string;
  fenAfter: string;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
}

export interface MatchSnapshot {
  matchId: string;
  fen: string;
  turn: PieceColor;
  status: MatchStatus;
  endReason: MatchEndReason | null;
  winner: PieceColor | null;
  isCheck: boolean;
  kingInCheckSquare: string | null;
  lastMove: { from: string; to: string } | null;
  history: MoveHistoryEntry[];
  whiteTimeMs: number | null;
  blackTimeMs: number | null;
  pgn: string;
}

export interface CreateMatchProps {
  id: string;
  rules: ChessRulesPort;
  whitePlayer: Player;
  blackPlayer: Player;
  timeControl: TimeControlConfig | null;
  initialFen?: string;
}

/**
 * Aggregate Root: controla estado, turnos, relojes, reglas y ganador de la partida.
 */
export class Match {
  public readonly id: string;
  private readonly rules: ChessRulesPort;
  private readonly players: Record<PieceColor, Player>;
  private readonly timeControl: TimeControlConfig | null;

  private status: MatchStatus = 'playing';
  private endReason: MatchEndReason | null = null;
  private winner: PieceColor | null = null;
  private history: MoveHistoryEntry[] = [];
  private lastMove: { from: string; to: string } | null = null;
  private domainEvents: Array<MoveMadeEvent | MatchEndedEvent> = [];

  private constructor(props: CreateMatchProps) {
    if (props.whitePlayer.color !== 'w') {
      throw new Error(
        `White player must have color 'w', got '${String(props.whitePlayer.color)}'.`,
      );
    }
    if (props.blackPlayer.color !== 'b') {
      throw new Error(
        `Black player must have color 'b', got '${String(props.blackPlayer.color)}'.`,
      );
    }

    if (props.timeControl !== null) {
      if (
        typeof props.timeControl.initialMs !== 'number' ||
        !Number.isFinite(props.timeControl.initialMs) ||
        props.timeControl.initialMs <= 0
      ) {
        throw new Error(
          `Invalid time control initialMs: ${String(props.timeControl.initialMs)}`,
        );
      }
      if (
        typeof props.timeControl.incrementMs !== 'number' ||
        !Number.isFinite(props.timeControl.incrementMs) ||
        props.timeControl.incrementMs < 0
      ) {
        throw new Error(
          `Invalid time control incrementMs: ${String(props.timeControl.incrementMs)}`,
        );
      }
      if (
        props.whitePlayer.remainingTimeMs === null ||
        !Number.isFinite(props.whitePlayer.remainingTimeMs) ||
        props.whitePlayer.remainingTimeMs < 0 ||
        props.blackPlayer.remainingTimeMs === null ||
        !Number.isFinite(props.blackPlayer.remainingTimeMs) ||
        props.blackPlayer.remainingTimeMs < 0
      ) {
        throw new Error(
          'Timed match requires non-null finite non-negative remainingTimeMs for both players.',
        );
      }
      this.timeControl = {
        initialMs: props.timeControl.initialMs,
        incrementMs: props.timeControl.incrementMs,
      };
    } else {
      if (
        props.whitePlayer.remainingTimeMs !== null ||
        props.blackPlayer.remainingTimeMs !== null
      ) {
        throw new Error(
          'Unlimited match (timeControl: null) requires remainingTimeMs to be null for both players.',
        );
      }
      this.timeControl = null;
    }

    this.id = props.id;
    this.rules = props.rules;
    this.players = {
      w: props.whitePlayer,
      b: props.blackPlayer,
    };

    if (props.initialFen !== undefined) {
      this.rules.loadFen(props.initialFen);
    } else {
      this.rules.reset();
    }

    this.evaluateTerminalState();
  }

  public static create(props: CreateMatchProps): Match {
    return new Match(props);
  }

  public playMove(move: Move): MoveMadeEvent {
    if (this.status === 'ended') {
      throw new Error('Cannot play a move: the match has already ended.');
    }

    const movingColor = this.rules.getTurn();
    const result = this.rules.applyMove({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });

    if (!result.isValid) {
      throw new Error(`Illegal move: ${move.from} -> ${move.to}`);
    }

    if (this.timeControl && this.history.length > 0) {
      this.players[movingColor].addIncrement(this.timeControl.incrementMs);
    }

    const moveNumber = Math.floor(this.history.length / 2) + 1;
    this.history.push({
      moveNumber,
      color: movingColor,
      san: result.san,
      from: move.from,
      to: move.to,
      fenAfter: result.fenAfter,
      isCapture: result.isCapture,
      isCheck: result.isCheck,
      isCheckmate: result.isCheckmate,
    });
    this.lastMove = { from: move.from, to: move.to };

    const moveEvent = new MoveMadeEvent({
      matchId: this.id,
      move,
      san: result.san,
      fenAfter: result.fenAfter,
      turnAfter: result.turnAfter,
      isCheck: result.isCheck,
      isCapture: result.isCapture,
      isCastle: result.isCastle,
      isEnPassant: result.isEnPassant,
      isPromotion: result.isPromotion,
    });
    this.domainEvents.push(moveEvent);

    if (result.isCheckmate) {
      this.finishMatch('checkmate', movingColor);
    } else if (result.isStalemate) {
      this.finishMatch('stalemate', null);
    } else if (result.isThreefoldRepetition) {
      this.finishMatch('threefold_repetition', null);
    } else if (result.isInsufficientMaterial) {
      this.finishMatch('insufficient_material', null);
    } else if (result.isFiftyMoveRule) {
      this.finishMatch('fifty_move_rule', null);
    }

    return moveEvent;
  }

  public tickClock(elapsedMs: number): MatchEndedEvent | null {
    if (
      this.status === 'ended' ||
      !this.timeControl ||
      this.history.length === 0 ||
      !Number.isFinite(elapsedMs) ||
      elapsedMs <= 0
    ) {
      return null;
    }

    const activeColor = this.rules.getTurn();
    const activePlayer = this.players[activeColor];
    activePlayer.deductTime(elapsedMs);

    if (activePlayer.hasTimedOut()) {
      const opponentColor: PieceColor = activeColor === 'w' ? 'b' : 'w';
      return this.finishMatch('timeout', opponentColor);
    }

    return null;
  }

  public resign(color: PieceColor): MatchEndedEvent {
    if (this.status === 'ended') {
      throw new Error('Cannot resign: the match has already ended.');
    }
    if (color !== 'w' && color !== 'b') {
      throw new Error(`Invalid resigning player color: "${String(color)}"`);
    }
    const winner: PieceColor = color === 'w' ? 'b' : 'w';
    return this.finishMatch('resignation', winner);
  }

  public getLegalMoves(square?: string): LegalMoveOption[] {
    if (this.status === 'ended') return [];
    return this.rules.getLegalMoves(square);
  }

  public getTurn(): PieceColor {
    return this.rules.getTurn();
  }

  public getFen(): string {
    return this.rules.getFen();
  }

  public getStatus(): MatchStatus {
    return this.status;
  }

  public getSnapshot(): MatchSnapshot {
    const turn = this.rules.getTurn();
    const isCheck = this.rules.isCheck();
    return {
      matchId: this.id,
      fen: this.rules.getFen(),
      turn,
      status: this.status,
      endReason: this.endReason,
      winner: this.winner,
      isCheck,
      kingInCheckSquare: isCheck ? this.rules.getKingSquare(turn) : null,
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      history: this.history.map((entry) => ({ ...entry })),
      whiteTimeMs: this.players.w.remainingTimeMs,
      blackTimeMs: this.players.b.remainingTimeMs,
      pgn: this.rules.getPgn(),
    };
  }

  public pullDomainEvents(): Array<MoveMadeEvent | MatchEndedEvent> {
    const events = [...this.domainEvents];
    this.domainEvents = [];
    return events;
  }

  private evaluateTerminalState(): void {
    if (this.rules.isCheckmate()) {
      const winner: PieceColor = this.rules.getTurn() === 'w' ? 'b' : 'w';
      this.finishMatch('checkmate', winner);
    } else if (this.rules.isStalemate()) {
      this.finishMatch('stalemate', null);
    } else if (this.rules.isThreefoldRepetition()) {
      this.finishMatch('threefold_repetition', null);
    } else if (this.rules.isInsufficientMaterial()) {
      this.finishMatch('insufficient_material', null);
    } else if (this.rules.isFiftyMoveRule()) {
      this.finishMatch('fifty_move_rule', null);
    }
  }

  private finishMatch(reason: MatchEndReason, winner: PieceColor | null): MatchEndedEvent {
    this.status = 'ended';
    this.endReason = reason;
    this.winner = winner;
    const endedEvent = new MatchEndedEvent({
      matchId: this.id,
      reason,
      winner,
    });
    this.domainEvents.push(endedEvent);
    return endedEvent;
  }
}
