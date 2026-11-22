export type BoardThemeId = 'classic' | 'wood' | 'slate' | 'ocean';

export interface BoardThemeConfig {
  id: BoardThemeId;
  name: string;
  lightSquare: string;
  darkSquare: string;
  highlightSquare: string;
  lastMoveSquare: string;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardThemeConfig> = {
  classic: {
    id: 'classic',
    name: 'Clásico',
    lightSquare: '#eeeed2',
    darkSquare: '#769656',
    highlightSquare: 'rgba(255, 255, 0, 0.45)',
    lastMoveSquare: 'rgba(246, 246, 105, 0.55)',
  },
  wood: {
    id: 'wood',
    name: 'Madera',
    lightSquare: '#f0d9b5',
    darkSquare: '#b58863',
    highlightSquare: 'rgba(255, 215, 0, 0.45)',
    lastMoveSquare: 'rgba(205, 210, 106, 0.55)',
  },
  slate: {
    id: 'slate',
    name: 'Pizarra',
    lightSquare: '#cbd5e1',
    darkSquare: '#475569',
    highlightSquare: 'rgba(56, 189, 248, 0.45)',
    lastMoveSquare: 'rgba(125, 211, 252, 0.45)',
  },
  ocean: {
    id: 'ocean',
    name: 'Océano',
    lightSquare: '#dbeafe',
    darkSquare: '#2563eb',
    highlightSquare: 'rgba(250, 204, 21, 0.45)',
    lastMoveSquare: 'rgba(96, 165, 250, 0.5)',
  },
};

/**
 * Value Object: paletas de colores válidas del tablero.
 */
export class BoardTheme {
  public readonly config: BoardThemeConfig;

  private constructor(config: BoardThemeConfig) {
    this.config = config;
  }

  public static create(id: BoardThemeId): BoardTheme {
    if (!Object.prototype.hasOwnProperty.call(BOARD_THEMES, id)) {
      throw new Error(`Unknown board theme: "${id}"`);
    }
    return new BoardTheme(BOARD_THEMES[id]);
  }

  public static fromString(raw: string | null | undefined): BoardTheme {
    if (raw && Object.prototype.hasOwnProperty.call(BOARD_THEMES, raw)) {
      return new BoardTheme(BOARD_THEMES[raw as BoardThemeId]);
    }
    return new BoardTheme(BOARD_THEMES.classic);
  }

  public get id(): BoardThemeId {
    return this.config.id;
  }

  public equals(other: BoardTheme): boolean {
    return this.config.id === other.config.id;
  }
}
