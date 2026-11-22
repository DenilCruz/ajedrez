import { AI_DIFFICULTIES } from '@chess-platform/shared-domain';
import type { MatchEndReason, PieceColor } from '@chess-platform/shared-domain';
import { ChessBoardView } from '../features/chess-board/ChessBoardView';
import { ThemeSelector } from '../features/chess-board/ThemeSelector';
import { GameClockView } from '../features/game-clock/GameClockView';
import { GameSetupModal } from '../features/lobby/GameSetupModal';
import { MoveHistoryView } from '../features/move-history/MoveHistoryView';
import { useMatchController } from '../hooks/useMatchController';

interface GameOverBannerCopy {
  title: string;
  subtitle: string;
}

function getGameOverBannerCopy(
  endReason: MatchEndReason,
  winner: PieceColor | null,
): GameOverBannerCopy {
  const winnerText =
    winner === 'w' ? 'Blancas' : winner === 'b' ? 'Negras' : null;

  switch (endReason) {
    case 'checkmate':
      return {
        title: '¡Jaque mate!',
        subtitle: winnerText ? `Ganan las ${winnerText}` : 'Partida finalizada',
      };
    case 'timeout':
      return {
        title: 'Tiempo agotado',
        subtitle: winnerText ? `Ganan las ${winnerText}` : 'Partida finalizada',
      };
    case 'resignation':
      return {
        title: 'Partida finalizada por rendición',
        subtitle: winnerText ? `Ganan las ${winnerText}` : 'Partida finalizada',
      };
    case 'stalemate':
      return {
        title: 'Tablas por ahogado',
        subtitle: 'El rey no tiene jugadas legales sin estar en jaque.',
      };
    case 'threefold_repetition':
      return {
        title: 'Tablas por triple repetición',
        subtitle: 'La misma posición se repitió tres veces.',
      };
    case 'insufficient_material':
      return {
        title: 'Tablas por material insuficiente',
        subtitle: 'Ninguno de los bandos puede dar jaque mate.',
      };
    case 'fifty_move_rule':
      return {
        title: 'Tablas (regla de 50 jugadas)',
        subtitle: '50 jugadas sin capturas ni movimientos de peón.',
      };
  }
}

export function MatchPage() {
  const {
    snapshot,
    config,
    themeId,
    theme,
    boardOrientation,
    canFlipBoard,
    isClockRunning,
    isAiThinking,
    aiError,
    isInteractionDisabled,
    selectedSquare,
    legalMovesForSelected,
    pendingPromotion,
    isSetupModalOpen,
    openSetupModal,
    closeSetupModal,
    startNewMatch,
    restartMatch,
    resign,
    flipBoard,
    selectTheme,
    handleSquareSelect,
    handlePieceDrop,
    selectPromotion,
    cancelPromotion,
  } = useMatchController();

  const gameOverBanner =
    snapshot.status === 'ended' && snapshot.endReason
      ? getGameOverBannerCopy(snapshot.endReason, snapshot.winner)
      : null;

  const modeSummary =
    config.mode === 'vs-ai'
      ? `vs IA · ${AI_DIFFICULTIES[config.difficulty].label}`
      : '2 Jugadores locales';

  const whiteLabel =
    config.mode === 'vs-ai'
      ? config.playerColor === 'w'
        ? 'Blancas (Tú)'
        : 'Blancas (IA)'
      : 'Blancas';

  const blackLabel =
    config.mode === 'vs-ai'
      ? config.playerColor === 'b'
        ? 'Negras (Tú)'
        : 'Negras (IA)'
      : 'Negras';

  return (
    <div className="min-h-dvh bg-brand-background font-sans text-neutral-200 antialiased selection:bg-brand-gold selection:text-black lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <header className="sticky top-0 z-40 w-full shrink-0 border-b border-brand-borderSubtle bg-brand-surface/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="group flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-gold via-brand-goldDark to-neutral-900 p-[1px]">
                <div className="flex h-full w-full items-center justify-center rounded-[7px] bg-brand-surface">
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5 text-brand-gold"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M19 22H5v-2h14v2zm-2.5-4H7.5l-1-4h11l-1 4zm-1.8-6h-5.4l-.8-3.2 2.7-1.8 2.7 1.8-.8 3.2zM12 2l2 3.5h-4L12 2z" />
                  </svg>
                </div>
              </div>
              <div className="flex flex-col">
                <h1 className="font-editorial text-2xl font-semibold tracking-wider text-neutral-100 uppercase transition-colors group-hover:text-brand-gold">
                  GAMBIT
                </h1>
                <span className="sr-only">Ajedrez</span>
              </div>
            </div>

            <div className="hidden h-6 w-px bg-brand-border sm:block" />

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brand-border bg-brand-surfaceElevated px-3 py-1 text-xs font-medium text-neutral-300">
                {modeSummary}
              </span>

              {isAiThinking ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-brand-gold"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 animate-pulse rounded-full bg-brand-gold"
                  />
                  Stockfish está pensando...
                </span>
              ) : snapshot.status === 'playing' && snapshot.isCheck ? (
                <span className="rounded-full border border-rose-500/50 bg-rose-950/50 px-2.5 py-1 text-xs font-semibold text-rose-300">
                  Jaque
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={openSetupModal}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-xs font-medium tracking-wide text-neutral-900 uppercase transition-all duration-200 hover:bg-white hover:shadow-glow-gold active:scale-95"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 4v16m8-8H4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              Nueva partida
            </button>
            <button
              type="button"
              onClick={restartMatch}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surfaceElevated px-3.5 py-2 text-xs font-medium tracking-wide text-neutral-300 transition-all hover:border-neutral-600 hover:bg-neutral-800 hover:text-white active:scale-95"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              Reiniciar
            </button>
            <button
              type="button"
              onClick={resign}
              disabled={snapshot.status === 'ended'}
              className="inline-flex items-center gap-2 rounded-lg border border-red-900/40 bg-red-950/20 px-3.5 py-2 text-xs font-medium tracking-wide text-red-300 transition-all hover:border-red-800 hover:bg-red-950/50 hover:text-red-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              Rendirse
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:px-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:justify-center lg:space-y-3 lg:py-4">
        {aiError ? (
          <div
            role="alert"
            className="shrink-0 rounded-xl border border-rose-500/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
          >
            {aiError}
          </div>
        ) : null}

        <main className="grid grid-cols-1 items-center justify-center gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:items-stretch lg:gap-8">
          <section
            data-purpose="board-canvas"
            className="flex flex-col items-center justify-center lg:col-span-7"
          >
            <div className="w-full max-w-[min(92vw,640px,calc(100dvh-9.5rem))]">
              <ChessBoardView
                fen={snapshot.fen}
                theme={theme}
                orientation={boardOrientation}
                legalMoves={legalMovesForSelected}
                lastMove={snapshot.lastMove}
                kingInCheckSquare={snapshot.kingInCheckSquare}
                turn={snapshot.turn}
                isInteractionDisabled={isInteractionDisabled}
                selectedSquare={selectedSquare}
                pendingPromotion={pendingPromotion}
                gameOverBanner={gameOverBanner}
                canFlipBoard={canFlipBoard}
                onFlipBoard={flipBoard}
                onRestartMatch={restartMatch}
                onOpenSetupModal={openSetupModal}
                onSquareSelect={handleSquareSelect}
                onPieceDrop={handlePieceDrop}
                onSelectPromotion={selectPromotion}
                onCancelPromotion={cancelPromotion}
              />
            </div>
          </section>

          <aside
            data-purpose="game-panel"
            className="flex flex-col gap-3.5 lg:col-span-5 lg:h-full lg:min-h-0"
          >
            <GameClockView
              whiteTimeMs={snapshot.whiteTimeMs}
              blackTimeMs={snapshot.blackTimeMs}
              activeTurn={snapshot.turn}
              isRunning={isClockRunning}
              playerOrientation={boardOrientation}
              whiteLabel={whiteLabel}
              blackLabel={blackLabel}
            />
            <MoveHistoryView history={snapshot.history} />
            <ThemeSelector currentTheme={themeId} onSelectTheme={selectTheme} />
          </aside>
        </main>
      </div>

      <GameSetupModal
        isOpen={isSetupModalOpen}
        initialConfig={config}
        onClose={closeSetupModal}
        onStartMatch={startNewMatch}
      />
    </div>
  );
}
