import { BOARD_THEMES } from '@chess-platform/shared-domain';
import type { BoardThemeId } from '@chess-platform/shared-domain';
import type { BoardViewMode, PieceStyle3D } from './ChessBoard3DView';

export interface ThemeSelectorProps {
  currentTheme: BoardThemeId;
  onSelectTheme: (theme: BoardThemeId) => void;
  viewMode?: BoardViewMode;
  onChangeViewMode?: (mode: BoardViewMode) => void;
  pieceStyle3D?: PieceStyle3D;
  onChangePieceStyle3D?: (style: PieceStyle3D) => void;
}

export function ThemeSelector({
  currentTheme,
  onSelectTheme,
  viewMode = '2d',
  onChangeViewMode,
  pieceStyle3D = 'classic',
  onChangePieceStyle3D,
}: ThemeSelectorProps) {
  const themes = Object.values(BOARD_THEMES);

  return (
    <section
      aria-label="Tema del tablero"
      className="shrink-0 rounded-xl border border-brand-border bg-brand-surface p-4"
    >
      {onChangeViewMode ? (
        <div className="mb-3.5 border-b border-brand-borderSubtle pb-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-neutral-300 uppercase">
              Modo de vista
            </span>
            <div
              role="group"
              aria-label="Alternar vista 2D o 3D"
              className="inline-flex rounded-lg border border-brand-border bg-brand-background p-0.5"
            >
              <button
                type="button"
                data-view-mode="2d"
                aria-pressed={viewMode === '2d'}
                onClick={() => onChangeViewMode('2d')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === '2d'
                    ? 'bg-brand-gold text-neutral-950'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Vista 2D
              </button>
              <button
                type="button"
                data-view-mode="3d"
                aria-pressed={viewMode === '3d'}
                onClick={() => onChangeViewMode('3d')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === '3d'
                    ? 'bg-brand-gold text-neutral-950'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Vista 3D
              </button>
            </div>
          </div>

          {viewMode === '3d' && onChangePieceStyle3D ? (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-medium tracking-wider text-neutral-400 uppercase">
                Piezas 3D
              </span>
              <div
                role="group"
                aria-label="Estilo de piezas 3D"
                className="inline-flex gap-1.5"
              >
                <button
                  type="button"
                  data-piece-style-3d="classic"
                  aria-pressed={pieceStyle3D === 'classic'}
                  onClick={() => onChangePieceStyle3D('classic')}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    pieceStyle3D === 'classic'
                      ? 'border-brand-gold bg-brand-surfaceElevated text-brand-goldLight'
                      : 'border-brand-border bg-brand-surfaceElevated/50 text-neutral-400 hover:text-white'
                  }`}
                >
                  Clásico
                </button>
                <button
                  type="button"
                  data-piece-style-3d="egyptian"
                  aria-pressed={pieceStyle3D === 'egyptian'}
                  onClick={() => onChangePieceStyle3D('egyptian')}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    pieceStyle3D === 'egyptian'
                      ? 'border-brand-gold bg-brand-surfaceElevated text-brand-goldLight'
                      : 'border-brand-border bg-brand-surfaceElevated/50 text-neutral-400 hover:text-white'
                  }`}
                >
                  Egipcio
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-widest text-neutral-300 uppercase">
          Tema del tablero
        </h2>
        <span className="font-serif text-xs text-brand-gold italic">
          {BOARD_THEMES[currentTheme].name}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {themes.map((theme) => {
          const isSelected = theme.id === currentTheme;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelectTheme(theme.id)}
              aria-pressed={isSelected}
              data-theme-id={theme.id}
              className={`group flex items-center gap-2.5 rounded-lg bg-brand-surfaceElevated p-2 text-left text-xs transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold ${
                isSelected
                  ? 'border-2 border-brand-gold font-semibold text-white shadow-glow-gold'
                  : 'border border-brand-border font-medium text-neutral-300 hover:border-neutral-500 hover:text-white'
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded border ${
                  isSelected
                    ? 'border-amber-900/80 ring-1 ring-brand-gold/60'
                    : 'border-neutral-700'
                }`}
              >
                <span style={{ backgroundColor: theme.lightSquare }} />
                <span style={{ backgroundColor: theme.darkSquare }} />
                <span style={{ backgroundColor: theme.darkSquare }} />
                <span style={{ backgroundColor: theme.lightSquare }} />
              </span>
              <span className="truncate">{theme.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
