import { describe, it, expect } from 'vitest';
import { Match, TimeControlConfig } from '../src/domain/entities/match.entity';
import { Player } from '../src/domain/entities/player.entity';
import { MatchEndedEvent } from '../src/domain/events/match-ended.event';
import { MoveMadeEvent } from '../src/domain/events/move-made.event';
import { Move } from '../src/domain/value-objects/move.vo';
import { ChessJsAdapter } from '../src/infrastructure/chess-js.adapter';

function createMatch(
  timeControl: TimeControlConfig | null = null,
  initialFen?: string,
): Match {
  const initialMs = timeControl ? timeControl.initialMs : null;
  return Match.create({
    id: 'match-int-1',
    rules: new ChessJsAdapter(),
    whitePlayer: Player.create({
      id: 'white',
      name: 'Blancas',
      color: 'w',
      remainingTimeMs: initialMs,
      isAi: false,
    }),
    blackPlayer: Player.create({
      id: 'black',
      name: 'Negras',
      color: 'b',
      remainingTimeMs: initialMs,
      isAi: false,
    }),
    timeControl,
    initialFen,
  });
}

describe('Match + ChessJsAdapter Integration', () => {
  it('records SAN history, special move flags, and MoveMadeEvent via pullDomainEvents()', () => {
    const match = createMatch();
    match.playMove(Move.fromUci('e2e4'));
    match.playMove(Move.fromUci('a7a6'));
    match.playMove(Move.fromUci('e4e5'));
    match.playMove(Move.fromUci('d7d5'));
    const epEvent = match.playMove(Move.fromUci('e5d6'));

    expect(epEvent.san).toBe('exd6');
    expect(epEvent.isEnPassant).toBe(true);
    expect(epEvent.isCapture).toBe(true);

    const events = match.pullDomainEvents();
    expect(events).toHaveLength(5);
    expect(events.every((e) => e instanceof MoveMadeEvent)).toBe(true);
    expect(match.pullDomainEvents()).toEqual([]);

    const snap = match.getSnapshot();
    expect(snap.history.map((h) => h.san)).toEqual(['e4', 'a6', 'e5', 'd5', 'exd6']);
    expect(snap.lastMove).toEqual({ from: 'e5', to: 'd6' });
    expect(snap.pgn).toContain('1. e4 a6 2. e5 d5 3. exd6');
  });

  it("handles Fool's Mate checkmate and emits MoveMadeEvent + MatchEndedEvent", () => {
    const match = createMatch();
    match.playMove(Move.fromUci('f2f3'));
    match.playMove(Move.fromUci('e7e5'));
    match.playMove(Move.fromUci('g2g4'));
    match.playMove(Move.fromUci('d8h4'));

    const snap = match.getSnapshot();
    expect(snap.status).toBe('ended');
    expect(snap.endReason).toBe('checkmate');
    expect(snap.winner).toBe('b');
    expect(snap.isCheck).toBe(true);
    expect(snap.kingInCheckSquare).toBe('e1');
    expect(snap.history.at(-1)?.san).toBe('Qh4#');
    expect(snap.history.at(-1)?.isCheckmate).toBe(true);

    const events = match.pullDomainEvents();
    expect(events).toHaveLength(5);
    const lastEvent = events.at(-1);
    expect(lastEvent).toBeInstanceOf(MatchEndedEvent);
    expect((lastEvent as MatchEndedEvent).reason).toBe('checkmate');
    expect((lastEvent as MatchEndedEvent).winner).toBe('b');

    expect(() => match.playMove(Move.fromUci('e2e4'))).toThrow();
  });

  it('handles resignation and emits MatchEndedEvent', () => {
    const match = createMatch();
    const ended = match.resign('w');
    expect(ended.reason).toBe('resignation');
    expect(ended.winner).toBe('b');
    expect(match.getStatus()).toBe('ended');
    expect(match.getLegalMoves()).toEqual([]);
  });

  describe('4 Official Draw Rules', () => {
    it('1. Stalemate', () => {
      const match = createMatch(null, '7k/5K2/8/6Q1/8/8/8/8 w - - 0 1');
      match.playMove(Move.fromUci('g5g6'));

      const snap = match.getSnapshot();
      expect(snap.status).toBe('ended');
      expect(snap.endReason).toBe('stalemate');
      expect(snap.winner).toBeNull();
      expect(snap.isCheck).toBe(false);

      const ended = match.pullDomainEvents().at(-1) as MatchEndedEvent;
      expect(ended.reason).toBe('stalemate');
      expect(ended.winner).toBeNull();
    });

    it('2. Threefold Repetition', () => {
      const match = createMatch();
      const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
      for (const uci of [...cycle, ...cycle]) {
        match.playMove(Move.fromUci(uci));
      }

      const snap = match.getSnapshot();
      expect(snap.status).toBe('ended');
      expect(snap.endReason).toBe('threefold_repetition');
      expect(snap.winner).toBeNull();
    });

    it('3. Insufficient Material (K vs K, K+N vs K, K+B vs K, same-color bishops) and negative opposite-color bishops', () => {
      const insufficientFens = [
        '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', // K vs K after Kxe2
        '4k3/8/8/8/8/2N5/4r3/4K3 w - - 0 1', // K+N vs K after Kxe2
        '4k3/8/8/8/8/2B5/4r3/4K3 w - - 0 1', // K+B vs K after Kxe2
        '4kb2/8/8/8/8/8/4r3/2B1K3 w - - 0 1', // same-color bishops after Kxe2
      ];

      for (const fen of insufficientFens) {
        const m = createMatch(null, fen);
        m.playMove(Move.fromUci('e1e2'));
        expect(m.getStatus()).toBe('ended');
        expect(m.getSnapshot().endReason).toBe('insufficient_material');
        expect(m.getSnapshot().winner).toBeNull();
      }

      // Opposite-color bishops (c1 dark, g8 light) must keep playing
      const opposite = createMatch(null, '4k1b1/8/8/8/8/8/4r3/2B1K3 w - - 0 1');
      opposite.playMove(Move.fromUci('e1e2'));
      expect(opposite.getStatus()).toBe('playing');
      expect(opposite.getSnapshot().endReason).toBeNull();
    });

    it('4. 50-Move Rule and pawn-move halfmove reset', () => {
      const drawMatch = createMatch(null, '4k3/8/8/8/8/8/8/4K2R w - - 99 60');
      drawMatch.playMove(Move.fromUci('h1h2'));
      expect(drawMatch.getStatus()).toBe('ended');
      expect(drawMatch.getSnapshot().endReason).toBe('fifty_move_rule');
      expect(drawMatch.getSnapshot().winner).toBeNull();

      const resetMatch = createMatch(null, '4k3/8/8/8/8/8/4P3/4K3 w - - 99 60');
      resetMatch.playMove(Move.fromUci('e2e3'));
      expect(resetMatch.getStatus()).toBe('playing');
      expect(resetMatch.getSnapshot().endReason).toBeNull();
    });
  });

  describe('Time Control', () => {
    it('skips clock tick before move 1, deducts active player, increments from ply 1+, and ends on timeout at 0ms', () => {
      const match = createMatch({ initialMs: 180_000, incrementMs: 2_000 });

      // Pre-move-1 tick is ignored
      expect(match.tickClock(30_000)).toBeNull();
      expect(match.getSnapshot().whiteTimeMs).toBe(180_000);
      expect(match.getSnapshot().blackTimeMs).toBe(180_000);

      // Ply 0 (White's 1st move): no increment for White
      match.playMove(Move.fromUci('e2e4'));
      expect(match.getSnapshot().whiteTimeMs).toBe(180_000);

      // Black thinks 1.5s, then plays (Ply 1 -> +2s increment)
      expect(match.tickClock(1_500)).toBeNull();
      expect(match.getSnapshot().blackTimeMs).toBe(178_500);
      match.playMove(Move.fromUci('e7e5'));
      expect(match.getSnapshot().blackTimeMs).toBe(180_500);

      // White thinks 5s, then plays (Ply 2 -> +2s increment)
      expect(match.tickClock(5_000)).toBeNull();
      expect(match.getSnapshot().whiteTimeMs).toBe(175_000);
      match.playMove(Move.fromUci('g1f3'));
      expect(match.getSnapshot().whiteTimeMs).toBe(177_000);

      // Black runs out of time exactly at 0ms -> White wins on timeout
      const timeoutEvent = match.tickClock(180_500);
      expect(timeoutEvent).toBeInstanceOf(MatchEndedEvent);
      expect(timeoutEvent?.reason).toBe('timeout');
      expect(timeoutEvent?.winner).toBe('w');
      expect(match.getStatus()).toBe('ended');
      expect(match.getSnapshot().blackTimeMs).toBe(0);
    });

    it('never ticks or times out when timeControl is null', () => {
      const match = createMatch(null);
      match.playMove(Move.fromUci('e2e4'));
      expect(match.tickClock(1_000_000)).toBeNull();
      expect(match.getSnapshot().whiteTimeMs).toBeNull();
      expect(match.getSnapshot().blackTimeMs).toBeNull();
      expect(match.getStatus()).toBe('playing');
    });
  });
});
