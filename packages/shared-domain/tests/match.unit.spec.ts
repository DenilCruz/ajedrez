import { describe, it, expect, vi } from 'vitest';
import { Match, TimeControlConfig } from '../src/domain/entities/match.entity';
import { Player } from '../src/domain/entities/player.entity';
import { MatchEndedEvent, MatchEndReason } from '../src/domain/events/match-ended.event';
import { MoveMadeEvent } from '../src/domain/events/move-made.event';
import { ChessRulesPort, MoveExecutionResult } from '../src/domain/ports/chess-rules.port';
import { Move } from '../src/domain/value-objects/move.vo';
import { PieceColor } from '../src/domain/value-objects/fen.vo';

function createMockRules(overrides: Partial<ChessRulesPort> = {}): ChessRulesPort {
  return {
    loadFen: vi.fn(),
    reset: vi.fn(),
    getFen: vi.fn(() => 'start-fen'),
    getTurn: vi.fn(() => 'w'),
    isValidMove: vi.fn(() => true),
    applyMove: vi.fn(
      (): MoveExecutionResult => ({
        isValid: true,
        san: 'e4',
        fenAfter: 'fen-after',
        turnAfter: 'b',
        isCheck: false,
        isCheckmate: false,
        isStalemate: false,
        isThreefoldRepetition: false,
        isInsufficientMaterial: false,
        isFiftyMoveRule: false,
        isGameOver: false,
        isCapture: false,
        isCastle: false,
        isEnPassant: false,
        isPromotion: false,
      }),
    ),
    getLegalMoves: vi.fn(() => [{ from: 'e2', to: 'e4', san: 'e4' }]),
    isCheck: vi.fn(() => false),
    isCheckmate: vi.fn(() => false),
    isStalemate: vi.fn(() => false),
    isThreefoldRepetition: vi.fn(() => false),
    isInsufficientMaterial: vi.fn(() => false),
    isFiftyMoveRule: vi.fn(() => false),
    isGameOver: vi.fn(() => false),
    getKingSquare: vi.fn(() => 'e1'),
    getPgn: vi.fn(() => ''),
    ...overrides,
  };
}

function createPlayers(timeMs: number | null = 180_000) {
  return {
    whitePlayer: Player.create({
      id: 'w1',
      name: 'White',
      color: 'w',
      remainingTimeMs: timeMs,
      isAi: false,
    }),
    blackPlayer: Player.create({
      id: 'b1',
      name: 'Black',
      color: 'b',
      remainingTimeMs: timeMs,
      isAi: false,
    }),
  };
}

describe('Match Unit Tests (Decoupled from chess.js via Mock ChessRulesPort)', () => {
  it('calls reset() when initialFen is omitted and loadFen() when provided (including empty string)', () => {
    const rules1 = createMockRules();
    const players1 = createPlayers(null);
    Match.create({
      id: 'm1',
      rules: rules1,
      ...players1,
      timeControl: null,
    });
    expect(rules1.reset).toHaveBeenCalledTimes(1);
    expect(rules1.loadFen).not.toHaveBeenCalled();

    const rules2 = createMockRules();
    const players2 = createPlayers(null);
    Match.create({
      id: 'm2',
      rules: rules2,
      ...players2,
      timeControl: null,
      initialFen: '',
    });
    expect(rules2.loadFen).toHaveBeenCalledWith('');
    expect(rules2.reset).not.toHaveBeenCalled();
  });

  it('validates player colors and timeControl / remainingTimeMs consistency', () => {
    const wrongWhite = Player.create({
      id: 'w',
      name: 'Wrong',
      color: 'b',
      remainingTimeMs: null,
      isAi: false,
    });
    const black = Player.create({
      id: 'b',
      name: 'Black',
      color: 'b',
      remainingTimeMs: null,
      isAi: false,
    });

    expect(() =>
      Match.create({
        id: 'm',
        rules: createMockRules(),
        whitePlayer: wrongWhite,
        blackPlayer: black,
        timeControl: null,
      }),
    ).toThrow();

    const white = Player.create({
      id: 'w',
      name: 'White',
      color: 'w',
      remainingTimeMs: 180_000,
      isAi: false,
    });
    // timeControl null with non-null player clock -> throw
    expect(() =>
      Match.create({
        id: 'm',
        rules: createMockRules(),
        whitePlayer: white,
        blackPlayer: Player.create({
          id: 'b',
          name: 'Black',
          color: 'b',
          remainingTimeMs: 180_000,
          isAi: false,
        }),
        timeControl: null,
      }),
    ).toThrow();

    // timed match with null player clock -> throw
    expect(() =>
      Match.create({
        id: 'm',
        rules: createMockRules(),
        ...createPlayers(null),
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      }),
    ).toThrow();

    // invalid initialMs / incrementMs -> throw
    const badTimeControls: TimeControlConfig[] = [
      { initialMs: 0, incrementMs: 0 },
      { initialMs: -1000, incrementMs: 0 },
      { initialMs: Number.NaN, incrementMs: 0 },
      { initialMs: Number.POSITIVE_INFINITY, incrementMs: 0 },
      { initialMs: 180_000, incrementMs: -1 },
      { initialMs: 180_000, incrementMs: Number.NaN },
    ];
    for (const tc of badTimeControls) {
      expect(() =>
        Match.create({
          id: 'm',
          rules: createMockRules(),
          ...createPlayers(180_000),
          timeControl: tc,
        }),
      ).toThrow();
    }
  });

  it('defensively copies timeControl so external mutations do not affect Match', () => {
    const tc: TimeControlConfig = { initialMs: 180_000, incrementMs: 2_000 };
    const rules = createMockRules();
    const match = Match.create({
      id: 'm',
      rules,
      ...createPlayers(180_000),
      timeControl: tc,
    });

    tc.incrementMs = 999_999;
    match.playMove(Move.fromUci('e2e4')); // ply 0 -> no increment
    vi.mocked(rules.getTurn).mockReturnValue('b');
    match.playMove(Move.fromUci('e7e5')); // ply 1 -> +2000ms
    expect(match.getSnapshot().blackTimeMs).toBe(182_000);
  });

  it('initializes ended state and MatchEndedEvent when initialFen is already terminal', () => {
    const mateRules = createMockRules({
      isCheckmate: vi.fn(() => true),
      getTurn: vi.fn(() => 'w'),
    });
    const mateMatch = Match.create({
      id: 'm-mate',
      rules: mateRules,
      ...createPlayers(null),
      timeControl: null,
      initialFen: 'mate-fen',
    });

    expect(mateMatch.getStatus()).toBe('ended');
    expect(mateMatch.getLegalMoves()).toEqual([]);
    expect(mateMatch.tickClock(1000)).toBeNull();
    expect(() => mateMatch.playMove(Move.fromUci('e2e4'))).toThrow();
    expect(() => mateMatch.resign('w')).toThrow();

    const snap = mateMatch.getSnapshot();
    expect(snap.endReason).toBe('checkmate');
    expect(snap.winner).toBe('b');

    const events = mateMatch.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(MatchEndedEvent);
    expect((events[0] as MatchEndedEvent).reason).toBe('checkmate');
    expect((events[0] as MatchEndedEvent).winner).toBe('b');

    const drawFlags: Array<{
      override: Partial<ChessRulesPort>;
      expectedReason: MatchEndReason;
    }> = [
      { override: { isStalemate: vi.fn(() => true) }, expectedReason: 'stalemate' },
      {
        override: { isThreefoldRepetition: vi.fn(() => true) },
        expectedReason: 'threefold_repetition',
      },
      {
        override: { isInsufficientMaterial: vi.fn(() => true) },
        expectedReason: 'insufficient_material',
      },
      { override: { isFiftyMoveRule: vi.fn(() => true) }, expectedReason: 'fifty_move_rule' },
    ];

    for (const item of drawFlags) {
      const m = Match.create({
        id: 'm-draw',
        rules: createMockRules(item.override),
        ...createPlayers(null),
        timeControl: null,
        initialFen: 'draw-fen',
      });
      expect(m.getStatus()).toBe('ended');
      expect(m.getSnapshot().endReason).toBe(item.expectedReason);
      expect(m.getSnapshot().winner).toBeNull();
    }
  });

  it('delegates playMove to ChessRulesPort, tracks moveNumber, emits & drains events, and rejects illegal moves', () => {
    let turn: PieceColor = 'w';
    const rules = createMockRules({
      getTurn: vi.fn(() => turn),
      applyMove: vi.fn((m) => {
        if (m.from === 'a1') {
          return {
            isValid: false,
            san: '',
            fenAfter: 'same',
            turnAfter: turn,
            isCheck: false,
            isCheckmate: false,
            isStalemate: false,
            isThreefoldRepetition: false,
            isInsufficientMaterial: false,
            isFiftyMoveRule: false,
            isGameOver: false,
            isCapture: false,
            isCastle: false,
            isEnPassant: false,
            isPromotion: false,
          };
        }
        turn = turn === 'w' ? 'b' : 'w';
        return {
          isValid: true,
          san: `${m.from}-${m.to}`,
          fenAfter: `fen-${m.to}`,
          turnAfter: turn,
          isCheck: false,
          isCheckmate: false,
          isStalemate: false,
          isThreefoldRepetition: false,
          isInsufficientMaterial: false,
          isFiftyMoveRule: false,
          isGameOver: false,
          isCapture: false,
          isCastle: false,
          isEnPassant: false,
          isPromotion: false,
        };
      }),
    });

    const match = Match.create({
      id: 'm-play',
      rules,
      ...createPlayers(null),
      timeControl: null,
    });

    expect(() => match.playMove(Move.fromUci('a1a2'))).toThrow();

    const ev1 = match.playMove(Move.fromUci('e2e4'));
    expect(ev1).toBeInstanceOf(MoveMadeEvent);
    match.playMove(Move.fromUci('e7e5'));
    match.playMove(Move.fromUci('g1f3'));
    match.playMove(Move.fromUci('b8c6'));

    const snap = match.getSnapshot();
    expect(snap.history.map((h) => h.moveNumber)).toEqual([1, 1, 2, 2]);
    expect(snap.history.map((h) => h.color)).toEqual(['w', 'b', 'w', 'b']);

    // Mutating snapshot.history must not mutate Match internal history
    snap.history[0].san = 'CORRUPTED';
    snap.history.pop();
    const freshSnap = match.getSnapshot();
    expect(freshSnap.history).toHaveLength(4);
    expect(freshSnap.history[0].san).toBe('e2-e4');

    const pulled = match.pullDomainEvents();
    expect(pulled).toHaveLength(4);
    expect(match.pullDomainEvents()).toEqual([]);
  });

  it('validates resign(color), handles double resign, and clones event occurredAt Date', () => {
    const match = Match.create({
      id: 'm-resign',
      rules: createMockRules(),
      ...createPlayers(null),
      timeControl: null,
    });

    expect(() => match.resign('x' as PieceColor)).toThrow();
    expect(match.getStatus()).toBe('playing');

    const ended = match.resign('w');
    expect(ended.reason).toBe('resignation');
    expect(ended.winner).toBe('b');
    expect(match.getStatus()).toBe('ended');
    expect(() => match.resign('b')).toThrow();

    const sourceDate = new Date(1_700_000_000_000);
    const ev = new MatchEndedEvent({
      matchId: 'm',
      reason: 'resignation',
      winner: 'b',
      occurredAt: sourceDate,
    });
    sourceDate.setFullYear(2099);
    expect(ev.occurredAt.getTime()).toBe(1_700_000_000_000);
  });

  it('gates tickClock on history.length > 0, finite positive elapsedMs, and emits timeout event at 0ms', () => {
    let turn: PieceColor = 'w';
    const rules = createMockRules({
      getTurn: vi.fn(() => turn),
      applyMove: vi.fn(() => {
        turn = 'b';
        return {
          isValid: true,
          san: 'e4',
          fenAfter: 'fen-after',
          turnAfter: 'b',
          isCheck: false,
          isCheckmate: false,
          isStalemate: false,
          isThreefoldRepetition: false,
          isInsufficientMaterial: false,
          isFiftyMoveRule: false,
          isGameOver: false,
          isCapture: false,
          isCastle: false,
          isEnPassant: false,
          isPromotion: false,
        };
      }),
    });

    const match = Match.create({
      id: 'm-clock',
      rules,
      ...createPlayers(10_000),
      timeControl: { initialMs: 10_000, incrementMs: 0 },
    });

    // No tick before first move
    expect(match.tickClock(5_000)).toBeNull();
    expect(match.getSnapshot().whiteTimeMs).toBe(10_000);

    match.playMove(Move.fromUci('e2e4'));

    // Invalid / non-positive elapsedMs ignored
    expect(match.tickClock(0)).toBeNull();
    expect(match.tickClock(-100)).toBeNull();
    expect(match.tickClock(Number.NaN)).toBeNull();
    expect(match.tickClock(Number.POSITIVE_INFINITY)).toBeNull();
    expect(match.getSnapshot().blackTimeMs).toBe(10_000);

    // Timeout at 0ms
    const timeoutEvent = match.tickClock(10_000);
    expect(timeoutEvent).toBeInstanceOf(MatchEndedEvent);
    expect(timeoutEvent?.reason).toBe('timeout');
    expect(timeoutEvent?.winner).toBe('w');
    expect(match.getStatus()).toBe('ended');
    expect(match.getSnapshot().blackTimeMs).toBe(0);
    expect(match.tickClock(1_000)).toBeNull();
  });

  it('includes kingInCheckSquare in getSnapshot() only when isCheck is true', () => {
    const checkRules = createMockRules({
      getTurn: vi.fn(() => 'b'),
      isCheck: vi.fn(() => true),
      getKingSquare: vi.fn(() => 'e8'),
    });
    const match = Match.create({
      id: 'm-check',
      rules: checkRules,
      ...createPlayers(null),
      timeControl: null,
    });
    const snap = match.getSnapshot();
    expect(snap.isCheck).toBe(true);
    expect(snap.kingInCheckSquare).toBe('e8');
  });
});
