import { BOARD_THEMES } from '@chess-platform/shared-domain';
import type { BoardThemeId } from '@chess-platform/shared-domain';

export interface ThemeSelectorProps {
  currentTheme: BoardThemeId;
  onSelectTheme: (theme: BoardThemeId) => void;
}

export function ThemeSelector({ currentTheme, onSelectTheme }: ThemeSelectorProps) {
  const themes = Object.values(BOARD_THEMES);

  return (
    <section
      aria-label="Tema del tablero"
      className="shrink-0 rounded-xl border border-brand-border bg-brand-surface p-4"
    >
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
