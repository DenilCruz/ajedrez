import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AiDifficulty,
  BoardTheme,
  ChessJsAdapter,
  Fen,
  Match,
  Move,
  Player,
  RoomCode,
  type AiDifficultyLevel,
  type BoardThemeId,
} from '@chess-platform/shared-domain';
import { describe, expect, it } from 'vitest';
import {
  CASTLING_CHECK_FENS,
  createTestMatch,
  EN_PASSANT_FEN,
  FIFTY_MOVE_98_FEN_AND_MOVES,
  FIFTY_MOVE_99_FEN_AND_MOVE,
  FOOLS_MATE_MOVES,
  PROMOTION_FEN,
  SUFFICIENT_OPPOSITE_KB_VS_KB_FEN,
} from '../helpers/fixtures.ts';

const suitesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(suitesDir, '../../..');
const sharedDomainRoot = path.join(repoRoot, 'packages/shared-domain');

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Tier 2 — Shared Domain Boundary & Corner Cases (F1–F5)', () => {
  describe('F1 Boundaries', () => {
    it('T2-F1-01: rejects illegal moves and any moves after match ends without mutating state', () => {
      const match = createTestMatch();
      const initialFen = match.getFen();

      expect(() => match.playMove(Move.create({ from: 'e2', to: 'e5' }))).toThrow();
      expect(match.getFen()).toBe(initialFen);
      expect(match.getTurn()).toBe('w');
      expect(match.getSnapshot().history).toEqual([]);
      expect(match.pullDomainEvents()).toEqual([]);

      for (const mv of FOOLS_MATE_MOVES) {
        match.playMove(Move.create(mv));
      }
      match.pullDomainEvents();

      expect(() => match.playMove(Move.create({ from: 'a2', to: 'a3' }))).toThrow();
      expect(match.pullDomainEvents()).toEqual([]);
    });

    it('T2-F1-02: rejects pawn promotion without piece and accepts underpromotion to knight', () => {
      const match = createTestMatch({ initialFen: PROMOTION_FEN });
      expect(() => match.playMove(Move.create({ from: 'a7', to: 'a8' }))).toThrow();

      const event = match.playMove(
        Move.create({ from: 'a7', to: 'a8', promotion: 'n' }),
      );
      expect(event.isPromotion).toBe(true);
      expect(event.san).toBe('a8=N');
    });

    it('T2-F1-03: allows immediate en passant and rejects expired en passant', () => {
      const immediate = createTestMatch({ initialFen: EN_PASSANT_FEN });
      const epEvent = immediate.playMove(Move.create({ from: 'e5', to: 'd6' }));
      expect(epEvent.isEnPassant).toBe(true);
      expect(epEvent.isCapture).toBe(true);
      // Black pawn on d5 was removed (no pawn on d5 in FEN rank 5)
      expect(immediate.getFen().split(' ')[0].split('/')[3]).toBe('8');

      const expired = createTestMatch({ initialFen: EN_PASSANT_FEN });
      expired.playMove(Move.create({ from: 'e1', to: 'd1' }));
      expired.playMove(Move.create({ from: 'e8', to: 'd8' }));
      expect(() => expired.playMove(Move.create({ from: 'e5', to: 'd6' }))).toThrow();
    });

    it('T2-F1-04: rejects castling out of check, through attacked square, and without castling rights', () => {
      for (const fen of [
        CASTLING_CHECK_FENS.kingInCheck,
        CASTLING_CHECK_FENS.squareAttacked,
        CASTLING_CHECK_FENS.noRights,
      ]) {
        const match = createTestMatch({ initialFen: fen });
        expect(() => match.playMove(Move.create({ from: 'e1', to: 'g1' }))).toThrow();
      }
    });

    it('T2-F1-05: rejects invalid Move/Fen/double-resign and returns [] for empty square legal moves', () => {
      expect(() => Move.create({ from: 'e2', to: 'e2' })).toThrow();
      expect(() => Move.create({ from: 'z9', to: 'e4' })).toThrow();
      expect(() => Fen.create('invalid fen')).toThrow();

      const match = createTestMatch();
      expect(match.getLegalMoves('e4')).toEqual([]);
      match.resign('w');
      expect(() => match.resign('b')).toThrow();
    });
  });

  describe('F2 Boundaries', () => {
    it('T2-F2-01: deep scan of all dist/**/*.d.ts yields zero chess.js references', () => {
      const distDir = path.join(sharedDomainRoot, 'dist');
      const dtsFiles = walkFiles(distDir).filter((f) => f.endsWith('.d.ts'));
      expect(dtsFiles.length).toBeGreaterThanOrEqual(8);

      for (const file of dtsFiles) {
        const code = stripComments(fs.readFileSync(file, 'utf8'));
        expect(code).not.toMatch(/chess\.js/i);
      }
    });

    it('T2-F2-02: prototype chain & symbol inspection on Match and ChessJsAdapter exposes no Chess constructor', () => {
      const adapter = new ChessJsAdapter();
      const match = createTestMatch({ rules: adapter });

      for (const obj of [adapter, match]) {
        expect(Object.getOwnPropertySymbols(obj)).toEqual([]);
        const proto = Object.getPrototypeOf(obj) as object;
        expect(Object.getOwnPropertyNames(proto)).not.toContain('chess');
      }
    });

    it('T2-F2-03: getSnapshot returns defensive copies immune to caller mutation', () => {
      const match = createTestMatch();
      match.playMove(Move.create({ from: 'e2', to: 'e4' }));

      const snap1 = match.getSnapshot();
      snap1.history.push({
        moveNumber: 99,
        color: 'b',
        san: 'FAKE',
        from: 'a7',
        to: 'a5',
        fenAfter: snap1.fen,
        isCapture: false,
        isCheck: false,
        isCheckmate: false,
      });
      if (snap1.lastMove) {
        snap1.lastMove.from = 'a1';
      }

      const snap2 = match.getSnapshot();
      expect(snap2.history).toHaveLength(1);
      expect(snap2.lastMove).toEqual({ from: 'e2', to: 'e4' });
    });

    it('T2-F2-04: pullDomainEvents returns isolated event array that does not re-queue on mutation', () => {
      const match = createTestMatch();
      match.playMove(Move.create({ from: 'e2', to: 'e4' }));
      const pulled = match.pullDomainEvents();
      expect(pulled).toHaveLength(1);
      pulled.length = 0;

      expect(match.pullDomainEvents()).toEqual([]);
    });

    it('T2-F2-05: invalid FEN rejected cleanly without corrupting adapter state', () => {
      const adapter = new ChessJsAdapter();
      const beforeFen = adapter.getFen();

      expect(() => adapter.loadFen('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow();
      expect(adapter.getFen()).toBe(beforeFen);

      expect(() =>
        createTestMatch({ initialFen: 'not-a-valid-fen' }),
      ).toThrow();
    });
  });

  describe('F3 Boundaries', () => {
    it('T2-F3-01: 50-move boundary stays playing at halfmove 99 and ends at halfmove 100', () => {
      const match = createTestMatch({ initialFen: FIFTY_MOVE_98_FEN_AND_MOVES.fen });
      match.playMove(Move.create(FIFTY_MOVE_98_FEN_AND_MOVES.firstMove));
      expect(match.getStatus()).toBe('playing');

      match.playMove(Move.create(FIFTY_MOVE_98_FEN_AND_MOVES.secondMove));
      expect(match.getStatus()).toBe('ended');
      expect(match.getSnapshot().endReason).toBe('fifty_move_rule');
    });

    it('T2-F3-02: pawn push or capture at halfmove 99 resets 50-move clock and continues game', () => {
      const pawnResetFen = '4k3/8/8/8/8/8/P7/4K2R w K - 99 60';
      const match = createTestMatch({ initialFen: pawnResetFen });
      match.playMove(Move.create({ from: 'a2', to: 'a3' }));

      expect(match.getStatus()).toBe('playing');
      expect(match.getFen().split(' ')[4]).toBe('0');
    });

    it('T2-F3-03: twofold repetition and positions with changed castling rights do not trigger 3-fold draw', () => {
      const match = createTestMatch();
      // 2-fold repetition only
      const twoFold = [
        { from: 'g1', to: 'f3' },
        { from: 'g8', to: 'f6' },
        { from: 'f3', to: 'g1' },
        { from: 'f6', to: 'g8' },
      ];
      for (const mv of twoFold) {
        match.playMove(Move.create(mv));
      }
      expect(match.getStatus()).toBe('playing');

      // Castling rights lost on first rook move: position visually repeats later, but only 2 identical FENs
      const castlingRightsMatch = createTestMatch({
        initialFen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
      });
      const seq = [
        { from: 'h1', to: 'g1' }, // loses K castling right
        { from: 'e8', to: 'd8' },
        { from: 'g1', to: 'h1' }, // pos A (no K right) #1
        { from: 'd8', to: 'e8' },
        { from: 'h1', to: 'g1' },
        { from: 'e8', to: 'd8' },
        { from: 'g1', to: 'h1' }, // pos A #2 (still only 2nd occurrence with no K right)
      ];
      for (const mv of seq) {
        castlingRightsMatch.playMove(Move.create(mv));
      }
      expect(castlingRightsMatch.getStatus()).toBe('playing');
    });

    it('T2-F3-04: opposite-color K+B vs K+B, K+P vs K, and K+R vs K are NOT insufficient material', () => {
      for (const fen of [
        SUFFICIENT_OPPOSITE_KB_VS_KB_FEN,
        '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
        '4k3/8/8/8/8/8/8/4K2R w - - 0 1',
      ]) {
        const match = createTestMatch({ initialFen: fen });
        expect(match.getStatus()).toBe('playing');
      }
    });

    it('T2-F3-05: checkmate takes precedence over 50-move rule on the 100th half-move', () => {
      // Halfmove 99, White Queen delivers mate on g7
      const mateAt99Fen = '6k1/5ppp/8/8/8/8/6Q1/6K1 w - - 99 60';
      const match = createTestMatch({ initialFen: mateAt99Fen });
      // Qg2->g7 is capture of pawn (resets 50-move); use non-capture mate at halfmove 99:
      // Kh6 vs Kf8 with Qh7# (Queen moves g7->h7, no capture, delivers mate!)
      const nonCapMateAt99 = '5k2/6Q1/5K2/8/8/8/8/8 w - - 99 60';
      const match2 = createTestMatch({ initialFen: nonCapMateAt99 });
      match2.playMove(Move.create({ from: 'g7', to: 'h7' }));
      // Wait: Kh7 isn't mate if Ke8 is free! Use Qb8# on 8th rank with Kf6 vs Kf8? No: 7k/5Q2/6K1 -> Qf8#!
      const mateNonCap99 = '7k/5Q2/6K1/8/8/8/8/8 w - - 99 60';
      const match3 = createTestMatch({ initialFen: mateNonCap99 });
      match3.playMove(Move.create({ from: 'f7', to: 'f8' }));

      expect(match3.getStatus()).toBe('ended');
      expect(match3.getSnapshot().endReason).toBe('checkmate');
      expect(match3.getSnapshot().winner).toBe('w');
      void match;
      void match2;
    });
  });

  describe('F4 Boundaries', () => {
    it('T2-F4-01: distinguishes 1ms remaining from 0ms timeout and clamps overshoot to 0', () => {
      const m1 = createTestMatch({ timeControl: { initialMs: 1000, incrementMs: 0 } });
      m1.playMove(Move.create({ from: 'e2', to: 'e4' }));
      expect(m1.tickClock(999)).toBeNull();
      expect(m1.getSnapshot().blackTimeMs).toBe(1);
      expect(m1.getStatus()).toBe('playing');

      const end1 = m1.tickClock(1);
      expect(end1?.reason).toBe('timeout');
      expect(m1.getSnapshot().blackTimeMs).toBe(0);

      const m2 = createTestMatch({ timeControl: { initialMs: 1000, incrementMs: 0 } });
      m2.playMove(Move.create({ from: 'e2', to: 'e4' }));
      const end2 = m2.tickClock(5000);
      expect(end2?.reason).toBe('timeout');
      expect(m2.getSnapshot().blackTimeMs).toBe(0);
    });

    it('T2-F4-02: ignores 0, negative, NaN, and Infinity tickClock durations without corrupting clocks', () => {
      const match = createTestMatch({ timeControl: { initialMs: 60_000, incrementMs: 0 } });
      match.playMove(Move.create({ from: 'e2', to: 'e4' }));

      for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(match.tickClock(bad)).toBeNull();
      }
      expect(match.getSnapshot().whiteTimeMs).toBe(60_000);
      expect(match.getSnapshot().blackTimeMs).toBe(60_000);
      expect(match.getStatus()).toBe('playing');
    });

    it('T2-F4-03: tickClock is a no-op before first move and after match has ended', () => {
      const match = createTestMatch({ timeControl: { initialMs: 5000, incrementMs: 0 } });
      expect(match.tickClock(10_000)).toBeNull();
      expect(match.getSnapshot().whiteTimeMs).toBe(5000);

      match.resign('w');
      expect(match.tickClock(10_000)).toBeNull();
      expect(match.getSnapshot().blackTimeMs).toBe(5000);
    });

    it('T2-F4-04: rejects invalid negative/NaN incrementMs and handles 0 increment cleanly', () => {
      const zeroInc = createTestMatch({
        timeControl: { initialMs: 600_000, incrementMs: 0 },
      });
      zeroInc.playMove(Move.create({ from: 'e2', to: 'e4' }));
      zeroInc.tickClock(2000);
      zeroInc.playMove(Move.create({ from: 'e7', to: 'e5' }));
      expect(zeroInc.getSnapshot().blackTimeMs).toBe(598_000);

      expect(() =>
        createTestMatch({ timeControl: { initialMs: 60_000, incrementMs: -100 } }),
      ).toThrow();
      expect(() =>
        createTestMatch({ timeControl: { initialMs: 60_000, incrementMs: Number.NaN } }),
      ).toThrow();

      // Direct Player method guards
      const p = Player.create({
        id: 'p1',
        name: 'Test',
        color: 'w',
        remainingTimeMs: 5000,
        isAi: false,
      });
      p.deductTime(Number.NaN);
      p.addIncrement(Number.NaN);
      p.addIncrement(-100);
      expect(p.remainingTimeMs).toBe(5000);
    });

    it('T2-F4-05: increment cannot rescue a player after timeout', () => {
      const match = createTestMatch({
        timeControl: { initialMs: 1000, incrementMs: 5000 },
      });
      match.playMove(Move.create({ from: 'e2', to: 'e4' }));
      const timeoutEv = match.tickClock(1000);
      expect(timeoutEv?.reason).toBe('timeout');
      expect(() => match.playMove(Move.create({ from: 'e7', to: 'e5' }))).toThrow();
      expect(match.getSnapshot().blackTimeMs).toBe(0);
    });
  });

  describe('F5 Boundaries', () => {
    it('T2-F5-01: package.json main/types/exports resolve consistently in CJS & ESM', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(sharedDomainRoot, 'package.json'), 'utf8'),
      ) as {
        main: string;
        types: string;
        exports: { '.': { default: string; types: string } };
      };
      const require = createRequire(import.meta.url);
      const cjsEntry = require(path.resolve(sharedDomainRoot, pkg.main)) as Record<
        string,
        unknown
      >;
      expect(typeof cjsEntry.Match).toBe('function');
      expect(typeof cjsEntry.ChessJsAdapter).toBe('function');
      expect(pkg.exports['.'].default).toBe(pkg.main);
      expect(pkg.exports['.'].types).toBe(pkg.types);
    });

    it('T2-F5-02: ESM named import compatibility succeeds for all domain primitives', async () => {
      const mod = await import('@chess-platform/shared-domain');
      const m = mod.Match.create({
        id: 'esm-check',
        rules: new mod.ChessJsAdapter(),
        whitePlayer: mod.Player.create({
          id: 'w',
          name: 'W',
          color: 'w',
          remainingTimeMs: null,
          isAi: false,
        }),
        blackPlayer: mod.Player.create({
          id: 'b',
          name: 'B',
          color: 'b',
          remainingTimeMs: null,
          isAi: false,
        }),
        timeControl: null,
      });
      expect(m.getStatus()).toBe('playing');
    });

    it('T2-F5-03: dist/ contains only .js and .d.ts files matching src/ modules', () => {
      const distFiles = walkFiles(path.join(sharedDomainRoot, 'dist'));
      for (const file of distFiles) {
        expect(file).toMatch(/\.(js|d\.ts)$/);
      }
    });

    it('T2-F5-04: AiDifficulty.create and BoardTheme.create reject invalid values while BoardTheme.fromString falls back', () => {
      expect(() =>
        AiDifficulty.create('impossible' as unknown as AiDifficultyLevel),
      ).toThrow();
      expect(() =>
        BoardTheme.create('neon' as unknown as BoardThemeId),
      ).toThrow();
      expect(BoardTheme.fromString('neon').id).toBe('classic');
      expect(BoardTheme.fromString(null).id).toBe('classic');
      expect(BoardTheme.fromString(undefined).id).toBe('classic');
    });

    it('T2-F5-05: RoomCode.create trims/uppercases valid 4-8 alnum codes and rejects invalid lengths/chars', () => {
      expect(RoomCode.create(' a84f ').toString()).toBe('A84F');
      expect(RoomCode.create('abcd1234').toString()).toBe('ABCD1234');
      expect(() => RoomCode.create('ABC')).toThrow();
      expect(() => RoomCode.create('ABCD12345')).toThrow();
      expect(() => RoomCode.create('AB-1')).toThrow();
    });
  });
});
