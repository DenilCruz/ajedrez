import './react-singleton';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOARD_THEMES } from '@chess-platform/shared-domain';
import type { LegalMoveOption } from '@chess-platform/shared-domain';
import type { ChessboardOptions } from 'react-chessboard';

let capturedOptions: ChessboardOptions | undefined;

vi.mock('react-chessboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-chessboard')>();
  return {
    ...actual,
    Chessboard: ({ options }: { options?: ChessboardOptions }) => {
      capturedOptions = options;
      return (
        <div
          data-testid="mock-chessboard"
          data-position={typeof options?.position === 'string' ? options.position : ''}
          data-orientation={options?.boardOrientation ?? ''}
          data-light={String(options?.lightSquareStyle?.backgroundColor ?? '')}
          data-dark={String(options?.darkSquareStyle?.backgroundColor ?? '')}
          data-square-styles={JSON.stringify(options?.squareStyles ?? {})}
        />
      );
    },
  };
});

import { ChessBoardView } from '../../src/presentation/features/chess-board/ChessBoardView';
import { ThemeSelector } from '../../src/presentation/features/chess-board/ThemeSelector';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const noop = () => {};
const noopDrop = () => false;

describe('ChessBoardView', () => {
  it('renders board with theme colors and optional flip button only when canFlipBoard is true', () => {
    const htmlWithFlip = renderToStaticMarkup(
      <ChessBoardView
        fen={INITIAL_FEN}
        theme={BOARD_THEMES.classic}
        orientation="white"
        legalMoves={[]}
        lastMove={null}
        kingInCheckSquare={null}
        turn="w"
        isInteractionDisabled={false}
        selectedSquare={null}
        pendingPromotion={null}
        canFlipBoard={true}
        onFlipBoard={noop}
        onSquareSelect={noop}
        onPieceDrop={noopDrop}
        onSelectPromotion={noop}
        onCancelPromotion={noop}
      />,
    );

    expect(htmlWithFlip).toContain('Rotar tablero');
    expect(htmlWithFlip).toContain('data-light="#eeeed2"');
    expect(htmlWithFlip).toContain('data-dark="#769656"');
    expect(htmlWithFlip).not.toContain('Elige pieza de promoción');

    const htmlNoFlip = renderToStaticMarkup(
      <ChessBoardView
        fen={INITIAL_FEN}
        theme={BOARD_THEMES.ocean}
        orientation="black"
        legalMoves={[]}
        lastMove={null}
        kingInCheckSquare={null}
        turn="w"
        isInteractionDisabled={false}
        selectedSquare={null}
        pendingPromotion={null}
        canFlipBoard={false}
        onSquareSelect={noop}
        onPieceDrop={noopDrop}
        onSelectPromotion={noop}
        onCancelPromotion={noop}
      />,
    );

    expect(htmlNoFlip).not.toContain('Rotar tablero');
    expect(htmlNoFlip).toContain('data-orientation="black"');
    expect(htmlNoFlip).toContain('data-light="#dbeafe"');
    expect(htmlNoFlip).toContain('data-dark="#2563eb"');
  });

  it('computes selected, last-move, check, and deduplicated quiet/capture legal move styles', () => {
    // En passant fen where d6 is empty but exd6 is a capture, plus 4 promotion moves to d8
    const fen = '3r4/4P3/8/3pP3/8/8/8/4K2k w - d6 0 1';
    const legalMoves: LegalMoveOption[] = [
      { from: 'e5', to: 'e6', san: 'e6' },
      { from: 'e5', to: 'd6', san: 'exd6' },
      { from: 'e7', to: 'd8', promotion: 'q', san: 'exd8=Q+' },
      { from: 'e7', to: 'd8', promotion: 'r', san: 'exd8=R+' },
      { from: 'e7', to: 'd8', promotion: 'b', san: 'exd8=B' },
      { from: 'e7', to: 'd8', promotion: 'n', san: 'exd8=N' },
    ];

    renderToStaticMarkup(
      <ChessBoardView
        fen={fen}
        theme={BOARD_THEMES.wood}
        orientation="white"
        legalMoves={legalMoves}
        lastMove={{ from: 'd7', to: 'd5' }}
        kingInCheckSquare="e1"
        turn="w"
        isInteractionDisabled={false}
        selectedSquare="e5"
        pendingPromotion={null}
        onSquareSelect={noop}
        onPieceDrop={noopDrop}
        onSelectPromotion={noop}
        onCancelPromotion={noop}
      />,
    );

    const styles = capturedOptions?.squareStyles ?? {};
    expect(styles.d7?.backgroundColor).toBe(BOARD_THEMES.wood.lastMoveSquare);
    expect(styles.d5?.backgroundColor).toBe(BOARD_THEMES.wood.lastMoveSquare);
    expect(styles.e5?.backgroundColor).toBe(BOARD_THEMES.wood.highlightSquare);
    expect(String(styles.e1?.backgroundImage)).toContain('rgba(239, 68, 68, 0.92)');
    // Quiet dot on e6, capture ring on d6 (en passant), and d8 not highlighted since selectedSquare is e5
    expect(String(styles.e6?.backgroundImage)).toContain('20%');
    expect(String(styles.d6?.backgroundImage)).toContain('58%');
    expect(styles.d8).toBeUndefined();
  });

  it('guards drag, drop, and square click handlers by turn, disabled state, and pendingPromotion', () => {
    const onSquareSelect = vi.fn();
    const onPieceDrop = vi.fn(() => true);

    renderToStaticMarkup(
      <ChessBoardView
        fen={INITIAL_FEN}
        theme={BOARD_THEMES.classic}
        orientation="white"
        legalMoves={[]}
        lastMove={null}
        kingInCheckSquare={null}
        turn="w"
        isInteractionDisabled={false}
        selectedSquare={null}
        pendingPromotion={null}
        onSquareSelect={onSquareSelect}
        onPieceDrop={onPieceDrop}
        onSelectPromotion={noop}
        onCancelPromotion={noop}
      />,
    );

    expect(
      capturedOptions?.canDragPiece?.({
        isSparePiece: false,
        piece: { pieceType: 'wP' },
        square: 'e2',
      }),
    ).toBe(true);
    expect(
      capturedOptions?.canDragPiece?.({
        isSparePiece: false,
        piece: { pieceType: 'bP' },
        square: 'e7',
      }),
    ).toBe(false);

    expect(
      capturedOptions?.onPieceDrop?.({
        piece: { isSparePiece: false, position: 'e2', pieceType: 'wP' },
        sourceSquare: 'e2',
        targetSquare: 'e2',
      }),
    ).toBe(false);
    expect(
      capturedOptions?.onPieceDrop?.({
        piece: { isSparePiece: false, position: 'e2', pieceType: 'wP' },
        sourceSquare: 'e2',
        targetSquare: null,
      }),
    ).toBe(false);
    expect(
      capturedOptions?.onPieceDrop?.({
        piece: { isSparePiece: false, position: 'e2', pieceType: 'wP' },
        sourceSquare: 'e2',
        targetSquare: 'e4',
      }),
    ).toBe(true);
    expect(onPieceDrop).toHaveBeenCalledWith('e2', 'e4');

    capturedOptions?.onSquareClick?.({ piece: null, square: 'e4' });
    expect(onSquareSelect).toHaveBeenCalledWith('e4');

    // When interaction is disabled, callbacks do not trigger
    const onSquareSelectDisabled = vi.fn();
    const onPieceDropDisabled = vi.fn(() => true);
    renderToStaticMarkup(
      <ChessBoardView
        fen={INITIAL_FEN}
        theme={BOARD_THEMES.classic}
        orientation="white"
        legalMoves={[]}
        lastMove={null}
        kingInCheckSquare={null}
        turn="w"
        isInteractionDisabled={true}
        selectedSquare={null}
        pendingPromotion={null}
        onSquareSelect={onSquareSelectDisabled}
        onPieceDrop={onPieceDropDisabled}
        onSelectPromotion={noop}
        onCancelPromotion={noop}
      />,
    );

    expect(
      capturedOptions?.canDragPiece?.({
        isSparePiece: false,
        piece: { pieceType: 'wP' },
        square: 'e2',
      }),
    ).toBe(false);
    expect(
      capturedOptions?.onPieceDrop?.({
        piece: { isSparePiece: false, position: 'e2', pieceType: 'wP' },
        sourceSquare: 'e2',
        targetSquare: 'e4',
      }),
    ).toBe(false);
    capturedOptions?.onSquareClick?.({ piece: null, square: 'e4' });
    expect(onPieceDropDisabled).not.toHaveBeenCalled();
    expect(onSquareSelectDisabled).not.toHaveBeenCalled();
  });

  it('renders promotion modal with Q/R/B/N options and SVG pieces when pendingPromotion is set', () => {
    const html = renderToStaticMarkup(
      <ChessBoardView
        fen={INITIAL_FEN}
        theme={BOARD_THEMES.slate}
        orientation="white"
        legalMoves={[]}
        lastMove={null}
        kingInCheckSquare={null}
        turn="w"
        isInteractionDisabled={true}
        selectedSquare={null}
        pendingPromotion={{ from: 'e7', to: 'e8', color: 'w' }}
        onSquareSelect={noop}
        onPieceDrop={noopDrop}
        onSelectPromotion={noop}
        onCancelPromotion={noop}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Elige pieza de promoción');
    expect(html).toContain('data-promotion="q"');
    expect(html).toContain('data-promotion="r"');
    expect(html).toContain('data-promotion="b"');
    expect(html).toContain('data-promotion="n"');
    expect(html).toContain('Dama');
    expect(html).toContain('Torre');
    expect(html).toContain('Alfil');
    expect(html).toContain('Caballo');
    expect(html).toContain('Cancelar');
    expect(html).toContain('<svg');
  });
});

describe('ThemeSelector', () => {
  it('renders all 4 board themes and marks only the active theme as pressed', () => {
    const html = renderToStaticMarkup(
      <ThemeSelector currentTheme="slate" onSelectTheme={noop} />,
    );

    expect(html).toContain('Clásico');
    expect(html).toContain('Madera');
    expect(html).toContain('Pizarra');
    expect(html).toContain('Océano');
    expect(html).toContain('aria-pressed="true" data-theme-id="slate"');
    expect(html).toContain('aria-pressed="false" data-theme-id="classic"');
    expect(html).toContain('aria-pressed="false" data-theme-id="wood"');
    expect(html).toContain('aria-pressed="false" data-theme-id="ocean"');
  });
});
