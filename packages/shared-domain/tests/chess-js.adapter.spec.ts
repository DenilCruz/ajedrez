import { describe, it, expect } from 'vitest';
import { ChessJsAdapter } from '../src/infrastructure/chess-js.adapter';
import { PromotionPiece } from '../src/domain/value-objects/move.vo';

describe('ChessJsAdapter', () => {
  it('encapsulates chess.js via private #chess field with zero runtime leaks', () => {
    const adapter = new ChessJsAdapter();

    expect(Object.keys(adapter)).toEqual([]);
    expect(Object.getOwnPropertyNames(adapter)).toEqual([]);
    expect('chess' in adapter).toBe(false);
    expect((adapter as unknown as { chess?: unknown }).chess).toBeUndefined();
  });

  it('supports reset, loadFen (with whitespace trimming), getFen, getTurn, and atomic invalid loadFen', () => {
    const adapter = new ChessJsAdapter();
    expect(adapter.getTurn()).toBe('w');
    expect(adapter.getFen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

    const customFen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1';
    adapter.loadFen(`  ${customFen}  `);
    expect(adapter.getFen()).toBe(customFen);
    expect(adapter.getTurn()).toBe('b');

    expect(() => adapter.loadFen('invalid-fen')).toThrow();
    expect(adapter.getFen()).toBe(customFen);

    expect(() => new ChessJsAdapter('')).toThrow();
    const trimmedCtor = new ChessJsAdapter(`  ${customFen}  `);
    expect(trimmedCtor.getFen()).toBe(customFen);

    adapter.reset();
    expect(adapter.getFen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('agrees 100% between isValidMove and applyMove across promotion, non-promotion, and invalid squares', () => {
    const promoAdapter = new ChessJsAdapter('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');

    // Missing promotion on promotion rank must be invalid in both
    expect(promoAdapter.isValidMove({ from: 'e7', to: 'e8' })).toBe(false);
    const missingPromoResult = promoAdapter.applyMove({ from: 'e7', to: 'e8' });
    expect(missingPromoResult.isValid).toBe(false);
    expect(promoAdapter.getTurn()).toBe('w');

    // Invalid promotion piece must be invalid in both
    expect(
      promoAdapter.isValidMove({ from: 'e7', to: 'e8', promotion: 'k' as PromotionPiece }),
    ).toBe(false);
    expect(
      promoAdapter.applyMove({ from: 'e7', to: 'e8', promotion: 'k' as PromotionPiece }).isValid,
    ).toBe(false);

    // All valid promotion pieces work
    for (const piece of ['q', 'r', 'b', 'n'] as PromotionPiece[]) {
      const a = new ChessJsAdapter('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
      expect(a.isValidMove({ from: 'e7', to: 'e8', promotion: piece })).toBe(true);
      const res = a.applyMove({ from: 'e7', to: 'e8', promotion: piece });
      expect(res.isValid).toBe(true);
      expect(res.isPromotion).toBe(true);
    }

    // Extra promotion on non-promotion move must be rejected by both
    const startAdapter = new ChessJsAdapter();
    expect(startAdapter.isValidMove({ from: 'e2', to: 'e4', promotion: 'q' })).toBe(false);
    expect(startAdapter.applyMove({ from: 'e2', to: 'e4', promotion: 'q' }).isValid).toBe(false);

    // Empty / malformed squares must return false / []
    expect(startAdapter.isValidMove({ from: '', to: 'e4' })).toBe(false);
    expect(startAdapter.applyMove({ from: '', to: 'e4' }).isValid).toBe(false);
    expect(startAdapter.isValidMove({ from: 'z9', to: 'e4' })).toBe(false);
    expect(startAdapter.applyMove({ from: 'z9', to: 'e4' }).isValid).toBe(false);
    expect(startAdapter.isValidMove({ from: 'E2', to: 'E4' })).toBe(false);
    expect(startAdapter.getLegalMoves('')).toEqual([]);
    expect(startAdapter.getLegalMoves('z9')).toEqual([]);
  });

  it('handles getLegalMoves, getKingSquare, and getPgn', () => {
    const adapter = new ChessJsAdapter();
    expect(adapter.getLegalMoves()).toHaveLength(20);
    expect(adapter.getLegalMoves('e2')).toHaveLength(2);
    expect(adapter.getKingSquare('w')).toBe('e1');
    expect(adapter.getKingSquare('b')).toBe('e8');

    adapter.applyMove({ from: 'e2', to: 'e4' });
    adapter.applyMove({ from: 'e7', to: 'e5' });
    expect(adapter.getPgn()).toContain('1. e4 e5');
  });

  it('detects castling, en passant, and capture+promotion flags', () => {
    const castleAdapter = new ChessJsAdapter('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const kingside = castleAdapter.applyMove({ from: 'e1', to: 'g1' });
    expect(kingside.isValid).toBe(true);
    expect(kingside.san).toBe('O-O');
    expect(kingside.isCastle).toBe(true);
    expect(kingside.isCapture).toBe(false);

    const queenside = castleAdapter.applyMove({ from: 'e8', to: 'c8' });
    expect(queenside.isValid).toBe(true);
    expect(queenside.san).toBe('O-O-O');
    expect(queenside.isCastle).toBe(true);

    const epAdapter = new ChessJsAdapter();
    epAdapter.applyMove({ from: 'e2', to: 'e4' });
    epAdapter.applyMove({ from: 'a7', to: 'a6' });
    epAdapter.applyMove({ from: 'e4', to: 'e5' });
    epAdapter.applyMove({ from: 'd7', to: 'd5' });
    const ep = epAdapter.applyMove({ from: 'e5', to: 'd6' });
    expect(ep.isValid).toBe(true);
    expect(ep.san).toBe('exd6');
    expect(ep.isEnPassant).toBe(true);
    expect(ep.isCapture).toBe(true);

    const promoCapAdapter = new ChessJsAdapter('3r4/4P3/4k3/8/8/8/8/4K3 w - - 0 1');
    const promoCap = promoCapAdapter.applyMove({ from: 'e7', to: 'd8', promotion: 'n' });
    expect(promoCap.isValid).toBe(true);
    expect(promoCap.san).toBe('exd8=N+');
    expect(promoCap.isCapture).toBe(true);
    expect(promoCap.isPromotion).toBe(true);
    expect(promoCap.isCheck).toBe(true);
  });

  it('detects check, checkmate, stalemate, threefold repetition, insufficient material, and 50-move rule', () => {
    // Checkmate (Fool's mate)
    const mate = new ChessJsAdapter();
    mate.applyMove({ from: 'f2', to: 'f3' });
    mate.applyMove({ from: 'e7', to: 'e5' });
    mate.applyMove({ from: 'g2', to: 'g4' });
    const mateRes = mate.applyMove({ from: 'd8', to: 'h4' });
    expect(mateRes.isCheck).toBe(true);
    expect(mateRes.isCheckmate).toBe(true);
    expect(mateRes.isGameOver).toBe(true);
    expect(mate.isCheck()).toBe(true);
    expect(mate.isCheckmate()).toBe(true);
    expect(mate.isGameOver()).toBe(true);

    // Stalemate
    const stalemate = new ChessJsAdapter('k7/8/1QK5/8/8/8/8/8 b - - 0 1');
    expect(stalemate.isStalemate()).toBe(true);
    expect(stalemate.isCheck()).toBe(false);
    expect(stalemate.isGameOver()).toBe(true);

    // Threefold repetition
    const rep = new ChessJsAdapter();
    for (let i = 0; i < 2; i++) {
      rep.applyMove({ from: 'g1', to: 'f3' });
      rep.applyMove({ from: 'g8', to: 'f6' });
      rep.applyMove({ from: 'f3', to: 'g1' });
      rep.applyMove({ from: 'f6', to: 'g8' });
    }
    expect(rep.isThreefoldRepetition()).toBe(true);
    expect(rep.isGameOver()).toBe(true);

    // Insufficient material: same-color bishops vs opposite-color bishops
    expect(new ChessJsAdapter('4k3/8/8/8/8/8/8/4K3 w - - 0 1').isInsufficientMaterial()).toBe(true);
    expect(new ChessJsAdapter('4k3/8/8/8/8/2N5/8/4K3 w - - 0 1').isInsufficientMaterial()).toBe(true);
    expect(new ChessJsAdapter('4k3/8/8/8/8/2B5/8/4K3 w - - 0 1').isInsufficientMaterial()).toBe(true);
    expect(new ChessJsAdapter('4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1').isInsufficientMaterial()).toBe(
      true,
    );
    expect(new ChessJsAdapter('4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1').isInsufficientMaterial()).toBe(
      false,
    );

    // 50-move rule
    const fifty = new ChessJsAdapter('4k3/8/8/8/8/8/8/4K2R w - - 99 60');
    expect(fifty.isFiftyMoveRule()).toBe(false);
    fifty.applyMove({ from: 'h1', to: 'h2' });
    expect(fifty.isFiftyMoveRule()).toBe(true);
    expect(fifty.isGameOver()).toBe(true);
  });
});
