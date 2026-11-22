import { describe, it, expect } from 'vitest';
import {
  AiDifficulty,
  AI_DIFFICULTIES,
  AiDifficultyLevel,
} from '../src/domain/value-objects/ai-difficulty.vo';
import {
  BoardTheme,
  BOARD_THEMES,
  BoardThemeId,
} from '../src/domain/value-objects/board-theme.vo';
import { Fen } from '../src/domain/value-objects/fen.vo';
import { Move, PromotionPiece } from '../src/domain/value-objects/move.vo';
import { RoomCode } from '../src/domain/value-objects/room-code.vo';

describe('Value Objects', () => {
  describe('Fen', () => {
    it('exposes standard INITIAL FEN and parses turn', () => {
      expect(Fen.INITIAL.toString()).toBe(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      );
      expect(Fen.INITIAL.getTurn()).toBe('w');
    });

    it('trims and normalizes internal whitespace on create', () => {
      const multiSpace =
        '   rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR   b   KQkq   e3   0   1   ';
      const fen = Fen.create(multiSpace);
      expect(fen.toString()).toBe(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      );
      expect(fen.getTurn()).toBe('b');
      expect(
        fen.equals(
          Fen.create('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
        ),
      ).toBe(true);
    });

    it('rejects malformed FEN strings', () => {
      const invalidFens = [
        '',
        'not a fen',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0', // only 5 fields
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1', // only 7 ranks
        'rnbqkbnr/ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // rank sum 7
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBXKBNR w KQkq - 0 1', // invalid piece X
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1', // invalid turn x
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w Z - 0 1', // invalid castling Z
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e4 0 1', // invalid en passant rank 4
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1', // negative halfmove
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0', // fullmove < 1
      ];

      for (const raw of invalidFens) {
        expect(Fen.isValidFormat(raw)).toBe(false);
        expect(() => Fen.create(raw)).toThrow();
      }
    });
  });

  describe('Move', () => {
    it('creates valid moves, trims and lowercases squares, and formats UCI', () => {
      const move = Move.create({ from: ' E2 ', to: ' E4 ' });
      expect(move.from).toBe('e2');
      expect(move.to).toBe('e4');
      expect(move.promotion).toBeUndefined();
      expect(move.toUci()).toBe('e2e4');

      const promo = Move.create({ from: 'e7', to: 'e8', promotion: 'q' });
      expect(promo.promotion).toBe('q');
      expect(promo.toUci()).toBe('e7e8q');
    });

    it('supports all promotion pieces q/r/b/n via create and fromUci', () => {
      const pieces: PromotionPiece[] = ['q', 'r', 'b', 'n'];
      for (const piece of pieces) {
        const created = Move.create({ from: 'a7', to: 'a8', promotion: piece });
        const fromUci = Move.fromUci(`  A7A8${piece.toUpperCase()}  `);
        expect(created.equals(fromUci)).toBe(true);
        expect(fromUci.toUci()).toBe(`a7a8${piece}`);
      }
    });

    it('rejects invalid squares, equal squares, invalid promotion, and invalid UCI strings', () => {
      expect(() => Move.create({ from: 'z9', to: 'e4' })).toThrow();
      expect(() => Move.create({ from: 'e2', to: 'i4' })).toThrow();
      expect(() => Move.create({ from: 'e4', to: 'e4' })).toThrow();
      expect(() =>
        Move.create({ from: 'e7', to: 'e8', promotion: 'k' as PromotionPiece }),
      ).toThrow();

      expect(() => Move.fromUci('e2')).toThrow();
      expect(() => Move.fromUci('e2e4qq')).toThrow();
      expect(() => Move.fromUci('e7e8k')).toThrow();
      expect(() => Move.fromUci('a9a1')).toThrow();
    });

    it('compares moves with equals()', () => {
      const a = Move.fromUci('e7e8q');
      const b = Move.create({ from: 'e7', to: 'e8', promotion: 'q' });
      const c = Move.create({ from: 'e7', to: 'e8', promotion: 'n' });
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });
  });

  describe('BoardTheme', () => {
    it('supports all 4 themes with expected Spanish names and colors', () => {
      const expected: Array<{ id: BoardThemeId; name: string }> = [
        { id: 'classic', name: 'Clásico' },
        { id: 'wood', name: 'Madera' },
        { id: 'slate', name: 'Pizarra' },
        { id: 'ocean', name: 'Océano' },
      ];

      for (const item of expected) {
        const theme = BoardTheme.create(item.id);
        expect(theme.id).toBe(item.id);
        expect(theme.config).toEqual(BOARD_THEMES[item.id]);
        expect(theme.config.name).toBe(item.name);
        expect(BoardTheme.fromString(item.id).equals(theme)).toBe(true);
      }
    });

    it('throws on unknown theme and prototype-chain keys in create()', () => {
      expect(() => BoardTheme.create('neon' as BoardThemeId)).toThrow();
      expect(() => BoardTheme.create('toString' as BoardThemeId)).toThrow();
      expect(() => BoardTheme.create('constructor' as BoardThemeId)).toThrow();
      expect(() => BoardTheme.create('valueOf' as BoardThemeId)).toThrow();
    });

    it('falls back to classic on invalid, null, undefined, or prototype-chain keys in fromString()', () => {
      expect(BoardTheme.fromString(null).id).toBe('classic');
      expect(BoardTheme.fromString(undefined).id).toBe('classic');
      expect(BoardTheme.fromString('').id).toBe('classic');
      expect(BoardTheme.fromString('unknown').id).toBe('classic');
      expect(BoardTheme.fromString('toString').id).toBe('classic');
      expect(BoardTheme.fromString('constructor').id).toBe('classic');
      expect(BoardTheme.fromString('valueOf').id).toBe('classic');
    });
  });

  describe('AiDifficulty', () => {
    it('maps easy, medium, and hard to exact UCI configs', () => {
      expect(AI_DIFFICULTIES.easy).toEqual({
        level: 'easy',
        label: 'Fácil',
        skillLevel: 2,
        depth: 4,
        movetimeMs: 250,
      });
      expect(AI_DIFFICULTIES.medium).toEqual({
        level: 'medium',
        label: 'Medio',
        skillLevel: 10,
        depth: 10,
        movetimeMs: 650,
      });
      expect(AI_DIFFICULTIES.hard).toEqual({
        level: 'hard',
        label: 'Difícil',
        skillLevel: 20,
        depth: 16,
        movetimeMs: 1400,
      });

      const easy = AiDifficulty.create('easy');
      const hard = AiDifficulty.create('hard');
      expect(easy.level).toBe('easy');
      expect(easy.equals(AiDifficulty.create('easy'))).toBe(true);
      expect(easy.equals(hard)).toBe(false);
    });

    it('throws on invalid level and prototype-chain keys', () => {
      expect(() => AiDifficulty.create('grandmaster' as AiDifficultyLevel)).toThrow();
      expect(() => AiDifficulty.create('toString' as AiDifficultyLevel)).toThrow();
      expect(() => AiDifficulty.create('constructor' as AiDifficultyLevel)).toThrow();
    });
  });

  describe('RoomCode', () => {
    it('normalizes valid 4-8 alphanumeric codes to uppercase', () => {
      const code = RoomCode.create('  a84f  ');
      expect(code.toString()).toBe('A84F');
      expect(code.equals(RoomCode.create('A84F'))).toBe(true);
      expect(RoomCode.create('12345678').toString()).toBe('12345678');
    });

    it('rejects codes shorter than 4, longer than 8, or containing special characters', () => {
      expect(() => RoomCode.create('ABC')).toThrow();
      expect(() => RoomCode.create('ABCDEFGHI')).toThrow();
      expect(() => RoomCode.create('AB-12')).toThrow();
      expect(() => RoomCode.create('')).toThrow();
    });
  });
});
