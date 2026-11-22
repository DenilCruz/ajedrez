import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_DIFFICULTIES,
  AiDifficulty,
  BOARD_THEMES,
  BoardTheme,
  ChessJsAdapter,
  Fen,
  Match,
  MatchEndedEvent,
  Move,
  MoveMadeEvent,
  Player,
  RoomCode,
  type ChessRulesPort,
  type LegalMoveOption,
  type MoveExecutionResult,
  type PieceColor,
} from '@chess-platform/shared-domain';
import { describe, expect, it } from 'vitest';
import {
  createTestMatch,
  EN_PASSANT_FEN,
  FIFTY_MOVE_99_FEN_AND_MOVE,
  FOOLS_MATE_MOVES,
  INSUFFICIENT_K_VS_K_FEN_AND_MOVE,
  INSUFFICIENT_KB_VS_K_FEN_AND_MOVE,
  INSUFFICIENT_KN_VS_K_FEN_AND_MOVE,
  INSUFFICIENT_SAME_COLOR_KB_VS_KB_FEN_AND_MOVE,
  PROMOTION_FEN,
  SCHOLARS_MATE_MOVES,
  STALEMATE_FEN_AND_MOVE,
  THREEFOLD_REPETITION_MOVES,
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

describe('Tier 1 — Shared Domain (F1–F5)', () => {
  describe('F1: Shared Domain Match & ChessRulesPort', () => {
    it('T1-F1-01: initializes match state, legal moves, and snapshot correctly', () => {
      const match = createTestMatch({ id: 't1-f1-01' });

      expect(match.getStatus()).toBe('playing');
      expect(match.getTurn()).toBe('w');
      expect(match.getFen()).toBe(Fen.INITIAL.toString());

      const allMoves = match.getLegalMoves();
      expect(allMoves).toHaveLength(20);

      const e2Moves = match.getLegalMoves('e2').map((m) => m.to);
      expect(e2Moves.sort()).toEqual(['e3', 'e4']);

      const snapshot = match.getSnapshot();
      expect(snapshot.matchId).toBe('t1-f1-01');
      expect(snapshot.status).toBe('playing');
      expect(snapshot.turn).toBe('w');
      expect(snapshot.history).toEqual([]);
      expect(snapshot.lastMove).toBeNull();
      expect(snapshot.isCheck).toBe(false);
      expect(snapshot.kingInCheckSquare).toBeNull();
      expect(snapshot.endReason).toBeNull();
      expect(snapshot.winner).toBeNull();
    });

    it('T1-F1-02: alternates turns, computes SAN history, and records PGN', () => {
      const match = createTestMatch({ id: 't1-f1-02' });
      const coords = [
        { from: 'e2', to: 'e4', san: 'e4', turnAfter: 'b' as const },
        { from: 'e7', to: 'e5', san: 'e5', turnAfter: 'w' as const },
        { from: 'g1', to: 'f3', san: 'Nf3', turnAfter: 'b' as const },
        { from: 'b8', to: 'c6', san: 'Nc6', turnAfter: 'w' as const },
      ];

      for (const step of coords) {
        const event = match.playMove(Move.create({ from: step.from, to: step.to }));
        expect(event).toBeInstanceOf(MoveMadeEvent);
        expect(event.san).toBe(step.san);
        expect(event.turnAfter).toBe(step.turnAfter);
      }

      const snapshot = match.getSnapshot();
      expect(snapshot.history.map((h) => h.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
      expect(snapshot.history.map((h) => h.moveNumber)).toEqual([1, 1, 2, 2]);
      expect(snapshot.lastMove).toEqual({ from: 'b8', to: 'c6' });
      expect(snapshot.pgn).toContain('1. e4 e5 2. Nf3 Nc6');
    });

    it('T1-F1-03: sets accurate flags for capture, castle, en passant, promotion, and check', () => {
      // Capture + Check
      const captureCheckMatch = createTestMatch({
        initialFen: '4k3/5p2/8/4Q3/8/8/8/4K3 w - - 0 1',
      });
      const capCheckEv = captureCheckMatch.playMove(
        Move.create({ from: 'e5', to: 'f6' }),
      );
      expect(capCheckEv.isCapture).toBe(false);
      expect(capCheckEv.isCheck).toBe(false);

      const capMatch = createTestMatch({
        initialFen: '4k3/4p3/8/8/8/8/4Q3/4K3 w - - 0 1',
      });
      const capEv = capMatch.playMove(Move.create({ from: 'e2', to: 'e7' }));
      expect(capEv.isCapture).toBe(true);
      expect(capEv.isCheck).toBe(true);
      expect(capMatch.getSnapshot().isCheck).toBe(true);
      expect(capMatch.getSnapshot().kingInCheckSquare).toBe('e8');

      // Castling
      const castleMatch = createTestMatch({
        initialFen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
      });
      const castleEv = castleMatch.playMove(Move.create({ from: 'e1', to: 'g1' }));
      expect(castleEv.isCastle).toBe(true);
      expect(castleEv.san).toBe('O-O');

      // En passant
      const epMatch = createTestMatch({ initialFen: EN_PASSANT_FEN });
      const epEv = epMatch.playMove(Move.create({ from: 'e5', to: 'd6' }));
      expect(epEv.isEnPassant).toBe(true);
      expect(epEv.isCapture).toBe(true);

      // Promotion
      const promoMatch = createTestMatch({ initialFen: PROMOTION_FEN });
      const promoEv = promoMatch.playMove(
        Move.create({ from: 'a7', to: 'a8', promotion: 'q' }),
      );
      expect(promoEv.isPromotion).toBe(true);
      expect(promoEv.isCheck).toBe(true);
      expect(promoEv.san).toBe('a8=Q+');
    });

    it('T1-F1-04: ends match on checkmate, emits MatchEndedEvent, and drains events on pullDomainEvents', () => {
      const match = createTestMatch({ id: 't1-f1-04' });

      for (const mv of FOOLS_MATE_MOVES) {
        match.playMove(Move.create(mv));
      }

      expect(match.getStatus()).toBe('ended');
      const snapshot = match.getSnapshot();
      expect(snapshot.endReason).toBe('checkmate');
      expect(snapshot.winner).toBe('b');
      expect(snapshot.history.at(-1)?.isCheckmate).toBe(true);

      const events = match.pullDomainEvents();
      expect(events).toHaveLength(5);
      expect(events.slice(0, 4).every((e) => e instanceof MoveMadeEvent)).toBe(true);
      const endEvent = events[4];
      expect(endEvent).toBeInstanceOf(MatchEndedEvent);
      if (endEvent instanceof MatchEndedEvent) {
        expect(endEvent.reason).toBe('checkmate');
        expect(endEvent.winner).toBe('b');
      }

      expect(match.pullDomainEvents()).toEqual([]);
    });

    it('T1-F1-05: ends match on resignation by either color and locks legal moves', () => {
      const matchW = createTestMatch({ id: 'resign-w' });
      matchW.playMove(Move.create({ from: 'e2', to: 'e4' }));
      const endW = matchW.resign('w');
      expect(endW.reason).toBe('resignation');
      expect(endW.winner).toBe('b');
      expect(matchW.getStatus()).toBe('ended');
      expect(matchW.getLegalMoves()).toEqual([]);
      expect(matchW.getSnapshot().endReason).toBe('resignation');

      const matchB = createTestMatch({ id: 'resign-b' });
      const endB = matchB.resign('b');
      expect(endB.reason).toBe('resignation');
      expect(endB.winner).toBe('w');
      expect(matchB.getStatus()).toBe('ended');
    });

    it('T1-F1-06: delegates chess rules exclusively to injected ChessRulesPort', () => {
      const calls: string[] = [];
      let turn: PieceColor = 'w';
      let fen = Fen.INITIAL.toString();

      const customPort: ChessRulesPort = {
        loadFen(f: string) {
          calls.push(`loadFen:${f}`);
          fen = f;
        },
        reset() {
          calls.push('reset');
        },
        getFen() {
          calls.push('getFen');
          return fen;
        },
        getTurn() {
          calls.push('getTurn');
          return turn;
        },
        isValidMove() {
          calls.push('isValidMove');
          return true;
        },
        applyMove(move): MoveExecutionResult {
          calls.push(`applyMove:${move.from}-${move.to}`);
          turn = turn === 'w' ? 'b' : 'w';
          fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
          return {
            isValid: true,
            san: 'e4',
            fenAfter: fen,
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
        },
        getLegalMoves(): LegalMoveOption[] {
          calls.push('getLegalMoves');
          return [{ from: 'e2', to: 'e4', san: 'e4' }];
        },
        isCheck() {
          calls.push('isCheck');
          return false;
        },
        isCheckmate() {
          return false;
        },
        isStalemate() {
          return false;
        },
        isThreefoldRepetition() {
          return false;
        },
        isInsufficientMaterial() {
          return false;
        },
        isFiftyMoveRule() {
          return false;
        },
        isGameOver() {
          return false;
        },
        getKingSquare() {
          return 'e1';
        },
        getPgn() {
          calls.push('getPgn');
          return '1. e4';
        },
      };

      const match = createTestMatch({ id: 'port-decoupled', rules: customPort });
      const moveEvent = match.playMove(Move.create({ from: 'e2', to: 'e4' }));
      expect(moveEvent.san).toBe('e4');
      expect(match.getLegalMoves('e2')).toEqual([{ from: 'e2', to: 'e4', san: 'e4' }]);
      const snapshot = match.getSnapshot();
      expect(snapshot.pgn).toBe('1. e4');
      expect(calls).toContain('reset');
      expect(calls).toContain('applyMove:e2-e4');
      expect(calls).toContain('getLegalMoves');
      expect(calls).toContain('getPgn');
    });
  });

  describe('F2: chess.js Encapsulation', () => {
    it('T1-F2-01: public TypeScript source index & domain files have zero chess.js imports', () => {
      const srcDir = path.join(sharedDomainRoot, 'src');
      const allSrcFiles = walkFiles(srcDir).filter((f) => f.endsWith('.ts'));

      for (const file of allSrcFiles) {
        const rel = path.relative(srcDir, file).replace(/\\/g, '/');
        const code = stripComments(fs.readFileSync(file, 'utf8'));
        if (rel === 'infrastructure/chess-js.adapter.ts') {
          expect(code).toContain("from 'chess.js'");
        } else {
          expect(code).not.toMatch(/from\s+['"]chess\.js['"]/);
          expect(code).not.toContain('chess.js');
        }
      }
    });

    it('T1-F2-02: built .d.ts surface exposes zero chess.js types or imports', () => {
      const distDir = path.join(sharedDomainRoot, 'dist');
      const dtsFiles = walkFiles(distDir).filter((f) => f.endsWith('.d.ts'));
      expect(dtsFiles.length).toBeGreaterThan(0);

      for (const dtsFile of dtsFiles) {
        const code = stripComments(fs.readFileSync(dtsFile, 'utf8'));
        expect(code).not.toContain('chess.js');
        expect(code).not.toContain('ChessInstance');
        expect(code).not.toContain('ChessJsMove');
        expect(code).not.toContain('PieceSymbol');
      }
    });

    it('T1-F2-03: runtime Match snapshot and domain events contain no chess.js instances', () => {
      const { Chess } = createRequire(path.join(repoRoot, 'package.json'))('chess.js') as {
        Chess: new () => object;
      };
      const match = createTestMatch({ initialFen: PROMOTION_FEN });
      match.playMove(Move.create({ from: 'a7', to: 'a8', promotion: 'q' }));

      const snapshot = match.getSnapshot();
      const events = match.pullDomainEvents();

      expect(() => JSON.stringify(snapshot)).not.toThrow();
      expect(() => JSON.stringify(events)).not.toThrow();
      expect(snapshot instanceof Chess).toBe(false);
      for (const ev of events) {
        expect(ev instanceof Chess).toBe(false);
      }
    });

    it('T1-F2-04: runtime ChessJsAdapter hides internal #chess engine from own properties & JSON', () => {
      const adapter = new ChessJsAdapter();
      expect(Object.keys(adapter)).toEqual([]);
      expect(Object.getOwnPropertyNames(adapter)).not.toContain('chess');
      expect((adapter as unknown as Record<string, unknown>).chess).toBeUndefined();
      expect(JSON.stringify(adapter)).toBe('{}');
    });

    it('T1-F2-05: illegal move errors do not leak raw chess.js internals into domain failures', () => {
      const adapter = new ChessJsAdapter();
      const applyResult = adapter.applyMove({ from: 'e2', to: 'e5' });
      expect(applyResult.isValid).toBe(false);

      const match = createTestMatch();
      expect(() => match.playMove(Move.create({ from: 'e2', to: 'e5' }))).toThrow(
        'Illegal move: e2 -> e5',
      );
    });
  });

  describe('F3: 4 Official Draw Rules', () => {
    it('T1-F3-01: detects stalemate draw and emits MatchEndedEvent', () => {
      const match = createTestMatch({ initialFen: STALEMATE_FEN_AND_MOVE.fen });
      match.playMove(Move.create(STALEMATE_FEN_AND_MOVE.move));

      expect(match.getStatus()).toBe('ended');
      const snap = match.getSnapshot();
      expect(snap.endReason).toBe('stalemate');
      expect(snap.winner).toBeNull();
      const endEv = match.pullDomainEvents().find((e) => e instanceof MatchEndedEvent);
      expect(endEv?.reason).toBe('stalemate');
      expect(endEv?.winner).toBeNull();
    });

    it('T1-F3-02: detects threefold repetition draw after 3rd identical position', () => {
      const match = createTestMatch();
      for (const mv of THREEFOLD_REPETITION_MOVES) {
        match.playMove(Move.create(mv));
      }

      expect(match.getStatus()).toBe('ended');
      const snap = match.getSnapshot();
      expect(snap.endReason).toBe('threefold_repetition');
      expect(snap.winner).toBeNull();
    });

    it('T1-F3-03: detects insufficient material for K vs K and K+B vs K', () => {
      const matchKK = createTestMatch({
        initialFen: INSUFFICIENT_K_VS_K_FEN_AND_MOVE.fen,
      });
      matchKK.playMove(Move.create(INSUFFICIENT_K_VS_K_FEN_AND_MOVE.move));
      expect(matchKK.getStatus()).toBe('ended');
      expect(matchKK.getSnapshot().endReason).toBe('insufficient_material');
      expect(matchKK.getSnapshot().winner).toBeNull();

      const matchKBK = createTestMatch({
        initialFen: INSUFFICIENT_KB_VS_K_FEN_AND_MOVE.fen,
      });
      matchKBK.playMove(Move.create(INSUFFICIENT_KB_VS_K_FEN_AND_MOVE.move));
      expect(matchKBK.getStatus()).toBe('ended');
      expect(matchKBK.getSnapshot().endReason).toBe('insufficient_material');
      expect(matchKBK.getSnapshot().winner).toBeNull();
    });

    it('T1-F3-04: detects insufficient material for K+N vs K and same-color K+B vs K+B', () => {
      const matchKNK = createTestMatch({
        initialFen: INSUFFICIENT_KN_VS_K_FEN_AND_MOVE.fen,
      });
      matchKNK.playMove(Move.create(INSUFFICIENT_KN_VS_K_FEN_AND_MOVE.move));
      expect(matchKNK.getStatus()).toBe('ended');
      expect(matchKNK.getSnapshot().endReason).toBe('insufficient_material');
      expect(matchKNK.getSnapshot().winner).toBeNull();

      const matchKBKB = createTestMatch({
        initialFen: INSUFFICIENT_SAME_COLOR_KB_VS_KB_FEN_AND_MOVE.fen,
      });
      matchKBKB.playMove(
        Move.create(INSUFFICIENT_SAME_COLOR_KB_VS_KB_FEN_AND_MOVE.move),
      );
      expect(matchKBKB.getStatus()).toBe('ended');
      expect(matchKBKB.getSnapshot().endReason).toBe('insufficient_material');
      expect(matchKBKB.getSnapshot().winner).toBeNull();
    });

    it('T1-F3-05: detects 50-move rule draw when halfmove clock reaches 100', () => {
      const match = createTestMatch({ initialFen: FIFTY_MOVE_99_FEN_AND_MOVE.fen });
      match.playMove(Move.create(FIFTY_MOVE_99_FEN_AND_MOVE.move));

      expect(match.getStatus()).toBe('ended');
      const snap = match.getSnapshot();
      expect(snap.endReason).toBe('fifty_move_rule');
      expect(snap.winner).toBeNull();
      const endEv = match.pullDomainEvents().find((e) => e instanceof MatchEndedEvent);
      expect(endEv?.reason).toBe('fifty_move_rule');
    });
  });

  describe('F4: Configurable Time Control', () => {
    it('T1-F4-01: initializes symmetric and asymmetric White/Black clocks', () => {
      const blitz = createTestMatch({
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      });
      expect(blitz.getSnapshot().whiteTimeMs).toBe(180_000);
      expect(blitz.getSnapshot().blackTimeMs).toBe(180_000);

      const asymmetric = createTestMatch({
        timeControl: { initialMs: 300_000, incrementMs: 0 },
        whiteTimeMs: 300_000,
        blackTimeMs: 180_000,
      });
      expect(asymmetric.getSnapshot().whiteTimeMs).toBe(300_000);
      expect(asymmetric.getSnapshot().blackTimeMs).toBe(180_000);
    });

    it('T1-F4-02: tickClock deducts only active player clock after move 1', () => {
      const match = createTestMatch({
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      });
      match.playMove(Move.create({ from: 'e2', to: 'e4' }));

      const event = match.tickClock(1500);
      expect(event).toBeNull();
      expect(match.getSnapshot().blackTimeMs).toBe(178_500);
      expect(match.getSnapshot().whiteTimeMs).toBe(180_000);
    });

    it('T1-F4-03: applies increment on move completion after first move', () => {
      const match = createTestMatch({
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      });

      match.playMove(Move.create({ from: 'e2', to: 'e4' }));
      match.tickClock(5000);
      match.playMove(Move.create({ from: 'e7', to: 'e5' }));
      expect(match.getSnapshot().blackTimeMs).toBe(177_000);

      match.tickClock(3000);
      match.playMove(Move.create({ from: 'g1', to: 'f3' }));
      expect(match.getSnapshot().whiteTimeMs).toBe(179_000);
    });

    it('T1-F4-04: triggers timeout defeat when active player clock reaches 0 ms', () => {
      const match = createTestMatch({
        timeControl: { initialMs: 1000, incrementMs: 0 },
      });
      match.playMove(Move.create({ from: 'e2', to: 'e4' }));

      const endEvent = match.tickClock(1000);
      expect(endEvent).toBeInstanceOf(MatchEndedEvent);
      expect(endEvent?.reason).toBe('timeout');
      expect(endEvent?.winner).toBe('w');
      expect(match.getStatus()).toBe('ended');
      expect(match.getSnapshot().blackTimeMs).toBe(0);
      expect(match.getSnapshot().endReason).toBe('timeout');
      expect(match.getSnapshot().winner).toBe('w');
    });

    it('T1-F4-05: supports unlimited (Sin reloj / null) mode without clock deduction', () => {
      const match = createTestMatch({ timeControl: null });
      match.playMove(Move.create({ from: 'e2', to: 'e4' }));
      const tickRes = match.tickClock(999_999);

      expect(tickRes).toBeNull();
      expect(match.getSnapshot().whiteTimeMs).toBeNull();
      expect(match.getSnapshot().blackTimeMs).toBeNull();
      expect(match.getStatus()).toBe('playing');
    });
  });

  describe('F5: Shared Domain Build & Dist Sanity', () => {
    it('T1-F5-01: packages/shared-domain/dist artifacts exist and match package.json entry points', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(sharedDomainRoot, 'package.json'), 'utf8'),
      ) as {
        main: string;
        types: string;
        exports: { '.': { default: string; types: string } };
      };
      const mainPath = path.resolve(sharedDomainRoot, pkg.main);
      const typesPath = path.resolve(sharedDomainRoot, pkg.types);
      expect(fs.existsSync(mainPath)).toBe(true);
      expect(fs.existsSync(typesPath)).toBe(true);
      expect(fs.statSync(mainPath).size).toBeGreaterThan(0);
      expect(fs.statSync(typesPath).size).toBeGreaterThan(0);
      expect(path.resolve(sharedDomainRoot, pkg.exports['.'].default)).toBe(mainPath);
      expect(path.resolve(sharedDomainRoot, pkg.exports['.'].types)).toBe(typesPath);
    });

    it('T1-F5-02: built entry exports all required domain classes and constants', async () => {
      const mod = await import('@chess-platform/shared-domain');
      expect(typeof mod.Match).toBe('function');
      expect(typeof mod.Player).toBe('function');
      expect(typeof mod.ChessJsAdapter).toBe('function');
      expect(typeof mod.Move).toBe('function');
      expect(typeof mod.Fen).toBe('function');
      expect(typeof mod.BoardTheme).toBe('function');
      expect(typeof mod.AiDifficulty).toBe('function');
      expect(typeof mod.RoomCode).toBe('function');
      expect(typeof mod.MoveMadeEvent).toBe('function');
      expect(typeof mod.MatchEndedEvent).toBe('function');
      expect(mod.BOARD_THEMES).toBeDefined();
      expect(mod.AI_DIFFICULTIES).toBeDefined();
    });

    it('T1-F5-03: executes full Scholar Mate end-to-end using compiled package entry', () => {
      const match = createTestMatch({ id: 't1-f5-03' });
      for (const mv of SCHOLARS_MATE_MOVES) {
        match.playMove(Move.create(mv));
      }
      const snap = match.getSnapshot();
      expect(snap.status).toBe('ended');
      expect(snap.endReason).toBe('checkmate');
      expect(snap.winner).toBe('w');
      expect(snap.history.at(-1)?.san).toBe('Qxf7#');
      expect(snap.pgn).toContain('4. Qxf7#');
    });

    it('T1-F5-04: validates value objects (BoardTheme, AiDifficulty, Fen, Move, RoomCode)', () => {
      expect(Object.keys(BOARD_THEMES)).toEqual(['classic', 'wood', 'slate', 'ocean']);
      expect(BOARD_THEMES.classic.name).toBe('Clásico');
      expect(BOARD_THEMES.wood.name).toBe('Madera');
      expect(BOARD_THEMES.slate.name).toBe('Pizarra');
      expect(BOARD_THEMES.ocean.name).toBe('Océano');
      expect(BoardTheme.create('ocean').id).toBe('ocean');

      expect(AI_DIFFICULTIES.easy).toMatchObject({ skillLevel: 2, depth: 4, movetimeMs: 250 });
      expect(AI_DIFFICULTIES.medium).toMatchObject({ skillLevel: 10, depth: 10, movetimeMs: 650 });
      expect(AI_DIFFICULTIES.hard).toMatchObject({ skillLevel: 20, depth: 16, movetimeMs: 1400 });
      expect(AiDifficulty.create('hard').level).toBe('hard');

      expect(Fen.INITIAL.getTurn()).toBe('w');
      expect(Move.fromUci('e7e8q').toUci()).toBe('e7e8q');
      expect(RoomCode.create('a84f').toString()).toBe('A84F');
    });

    it('T1-F5-05: contains zero *.spec.* or *.test.* files in packages/shared-domain/dist/', () => {
      const distDir = path.join(sharedDomainRoot, 'dist');
      const allFiles = walkFiles(distDir);
      const testFiles = allFiles.filter((f) => /\.(spec|test)\.(js|d\.ts|ts)$/.test(f));
      expect(testFiles).toEqual([]);
    });
  });
});
