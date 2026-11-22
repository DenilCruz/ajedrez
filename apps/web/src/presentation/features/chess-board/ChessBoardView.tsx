import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type {
  BoardThemeConfig,
  LegalMoveOption,
  PieceColor,
  PromotionPiece,
} from '@chess-platform/shared-domain';
import {
  Chessboard,
  defaultPieces,
  fenStringToPositionObject,
} from 'react-chessboard';
import type {
  ChessboardOptions,
  PieceDropHandlerArgs,
  PieceHandlerArgs,
  SquareHandlerArgs,
} from 'react-chessboard';

export interface ChessBoardViewProps {
  fen: string;
  theme: BoardThemeConfig;
  orientation: 'white' | 'black';
  legalMoves: LegalMoveOption[];
  lastMove: { from: string; to: string } | null;
  kingInCheckSquare: string | null;
  turn: PieceColor;
  isInteractionDisabled: boolean;
  selectedSquare: string | null;
  pendingPromotion: { from: string; to: string; color: PieceColor } | null;
  gameOverBanner?: { title: string; subtitle: string } | null;
  canFlipBoard?: boolean;
  onFlipBoard?: () => void;
  onRestartMatch?: () => void;
  onOpenSetupModal?: () => void;
  onDismissGameOver?: () => void;
  onReturnToLobby?: () => void;
  onSquareSelect: (square: string) => void;
  onPieceDrop: (from: string, to: string) => boolean;
  onSelectPromotion: (piece: PromotionPiece) => void;
  onCancelPromotion: () => void;
}

const PROMOTION_OPTIONS: ReadonlyArray<{ piece: PromotionPiece; label: string }> = [
  { piece: 'q', label: 'Dama' },
  { piece: 'r', label: 'Torre' },
  { piece: 'b', label: 'Alfil' },
  { piece: 'n', label: 'Caballo' },
];

export function ChessBoardView({
  fen,
  theme,
  orientation,
  legalMoves,
  lastMove,
  kingInCheckSquare,
  turn,
  isInteractionDisabled,
  selectedSquare,
  pendingPromotion,
  gameOverBanner = null,
  canFlipBoard = false,
  onFlipBoard,
  onRestartMatch,
  onOpenSetupModal,
  onDismissGameOver,
  onReturnToLobby,
  onSquareSelect,
  onPieceDrop,
  onSelectPromotion,
  onCancelPromotion,
}: ChessBoardViewProps) {
  useEffect(() => {
    if (!pendingPromotion) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancelPromotion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingPromotion, onCancelPromotion]);

  const positionMap = useMemo(() => fenStringToPositionObject(fen, 8, 8), [fen]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};

    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: theme.lastMoveSquare };
      styles[lastMove.to] = { backgroundColor: theme.lastMoveSquare };
    }

    if (selectedSquare) {
      styles[selectedSquare] = {
        ...styles[selectedSquare],
        backgroundColor: theme.highlightSquare,
      };
    }

    if (kingInCheckSquare) {
      styles[kingInCheckSquare] = {
        ...styles[kingInCheckSquare],
        backgroundImage:
          'radial-gradient(circle, rgba(239, 68, 68, 0.92) 0%, rgba(220, 38, 38, 0.6) 52%, rgba(185, 28, 28, 0) 74%)',
        boxShadow: 'inset 0 0 0 2px rgba(220, 38, 38, 0.85)',
      };
    }

    if (selectedSquare) {
      const targetCaptureMap = new Map<string, boolean>();
      for (const move of legalMoves) {
        if (move.from !== selectedSquare) continue;
        const isCapture = move.san.includes('x') || Boolean(positionMap[move.to]);
        const prev = targetCaptureMap.get(move.to) ?? false;
        targetCaptureMap.set(move.to, prev || isCapture);
      }

      for (const [targetSq, isCapture] of targetCaptureMap.entries()) {
        styles[targetSq] = {
          ...styles[targetSq],
          cursor: 'pointer',
          backgroundImage: isCapture
            ? 'radial-gradient(circle, transparent 56%, rgba(15, 23, 42, 0.34) 58%, rgba(15, 23, 42, 0.34) 72%, transparent 74%)'
            : 'radial-gradient(circle, rgba(15, 23, 42, 0.28) 20%, transparent 22%)',
        };
      }
    }

    return styles;
  }, [
    lastMove,
    selectedSquare,
    kingInCheckSquare,
    legalMoves,
    positionMap,
    theme.lastMoveSquare,
    theme.highlightSquare,
  ]);

  const options = useMemo<ChessboardOptions>(
    () => ({
      id: 'local-chess-board',
      position: fen,
      boardOrientation: orientation,
      showNotation: true,
      animationDurationInMs: 200,
      allowDragging: !isInteractionDisabled && pendingPromotion === null,
      allowDragOffBoard: false,
      lightSquareStyle: { backgroundColor: theme.lightSquare },
      darkSquareStyle: { backgroundColor: theme.darkSquare },
      lightSquareNotationStyle: { color: theme.darkSquare, fontWeight: 600 },
      darkSquareNotationStyle: { color: theme.lightSquare, fontWeight: 600 },
      squareStyles,
      canDragPiece: ({ piece }: PieceHandlerArgs) =>
        !isInteractionDisabled &&
        pendingPromotion === null &&
        piece.pieceType.startsWith(turn),
      onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
        if (
          isInteractionDisabled ||
          pendingPromotion !== null ||
          !targetSquare ||
          sourceSquare === targetSquare
        ) {
          return false;
        }
        return onPieceDrop(sourceSquare, targetSquare);
      },
      onSquareClick: ({ square }: SquareHandlerArgs) => {
        if (isInteractionDisabled || pendingPromotion !== null) {
          return;
        }
        onSquareSelect(square);
      },
    }),
    [
      fen,
      orientation,
      isInteractionDisabled,
      pendingPromotion,
      theme.lightSquare,
      theme.darkSquare,
      squareStyles,
      turn,
      onPieceDrop,
      onSquareSelect,
    ],
  );

  return (
    <div className="flex w-full flex-col gap-2">
      {canFlipBoard && onFlipBoard ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onFlipBoard}
            aria-label="Rotar tablero"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surfaceElevated px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 fill-none stroke-current"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
            Rotar tablero
          </button>
        </div>
      ) : null}

      <div className="relative aspect-square w-full rounded-xl border-2 border-[#543b23] bg-[#754d2a] p-2 shadow-board select-none sm:p-2.5">
        <div className="relative h-full w-full overflow-hidden rounded-lg border border-amber-950/40 bg-brand-surface">
          <Chessboard options={options} />

          {pendingPromotion ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-brand-background/80 p-4 backdrop-blur-xs">
              <button
                type="button"
                aria-label="Cerrar selector de promoción"
                onClick={onCancelPromotion}
                className="absolute inset-0 cursor-default"
                tabIndex={-1}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="promotion-dialog-title"
                className="relative z-10 w-full max-w-xs rounded-xl border border-brand-gold/40 bg-brand-surface p-4 shadow-2xl"
              >
                <h3
                  id="promotion-dialog-title"
                  className="mb-3 text-center text-sm font-semibold text-neutral-100"
                >
                  Elige pieza de promoción
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  {PROMOTION_OPTIONS.map(({ piece, label }) => {
                    const pieceKey = `${pendingPromotion.color}${piece.toUpperCase()}`;
                    const PieceIcon = defaultPieces[pieceKey];
                    return (
                      <button
                        key={piece}
                        type="button"
                        data-promotion={piece}
                        aria-label={label}
                        onClick={() => onSelectPromotion(piece)}
                        className="flex flex-col items-center justify-center gap-1 rounded-lg border border-brand-border bg-brand-surfaceElevated p-3 text-xs font-semibold text-neutral-100 transition hover:border-brand-gold hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
                      >
                        {PieceIcon ? (
                          <PieceIcon svgStyle={{ width: '44px', height: '44px' }} />
                        ) : null}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onCancelPromotion}
                  className="mt-3 w-full rounded-lg border border-brand-border bg-brand-surfaceElevated/60 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {gameOverBanner ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-20 flex items-center justify-center bg-brand-background/80 p-4 backdrop-blur-xs"
            >
              <div className="relative w-full max-w-sm rounded-2xl border border-brand-gold/50 bg-brand-surface/95 p-6 text-center shadow-2xl">
                {onDismissGameOver ? (
                  <button
                    type="button"
                    onClick={onDismissGameOver}
                    aria-label="Ver tablero"
                    title="Ver tablero"
                    className="absolute top-3 right-3 rounded-lg border border-brand-border bg-brand-surfaceElevated p-1.5 text-neutral-400 transition hover:border-neutral-600 hover:text-white"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M6 18L18 6M6 6l12 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
                <p className="font-editorial text-2xl font-bold text-white">
                  {gameOverBanner.title}
                </p>
                <p className="mt-1.5 text-sm text-brand-goldLight">
                  {gameOverBanner.subtitle}
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  {onReturnToLobby ? (
                    <button
                      type="button"
                      onClick={onReturnToLobby}
                      className="rounded-lg bg-brand-gold px-5 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-brand-goldLight sm:text-sm"
                    >
                      Volver a la sala
                    </button>
                  ) : (
                    <>
                      {onRestartMatch ? (
                        <button
                          type="button"
                          onClick={onRestartMatch}
                          className="rounded-lg border border-brand-border bg-brand-surfaceElevated px-4 py-2 text-xs font-semibold text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800 sm:text-sm"
                        >
                          Reiniciar
                        </button>
                      ) : null}
                      {onOpenSetupModal ? (
                        <button
                          type="button"
                          onClick={onOpenSetupModal}
                          className="rounded-lg bg-brand-gold px-4 py-2 text-xs font-semibold text-neutral-950 transition hover:bg-brand-goldLight sm:text-sm"
                        >
                          Nueva partida
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
