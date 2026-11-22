import {
  ChessJsAdapter,
  Match,
  Player,
  type BoardThemeId,
  type ChessRulesPort,
  type PromotionPiece,
  type TimeControlConfig,
} from '@chess-platform/shared-domain';

export interface CoordMove {
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

export function parseCoordMoves(notationList: readonly string[]): CoordMove[] {
  return notationList.map((entry) => {
    const [from, to] = entry.split('-');
    if (!from || !to) {
      throw new Error(`Invalid coordinate move fixture: "${entry}"`);
    }
    return { from, to };
  });
}

export const FOOLS_MATE_MOVES: readonly CoordMove[] = parseCoordMoves([
  'f2-f3',
  'e7-e5',
  'g2-g4',
  'd8-h4',
]);

export const SCHOLARS_MATE_MOVES: readonly CoordMove[] = parseCoordMoves([
  'e2-e4',
  'e7-e5',
  'f1-c4',
  'b8-c6',
  'd1-h5',
  'g8-f6',
  'h5-f7',
]);

export const SAM_LOYD_STALEMATE_MOVES: readonly CoordMove[] = parseCoordMoves([
  'e2-e3',
  'a7-a5',
  'd1-h5',
  'a8-a6',
  'h5-a5',
  'h7-h5',
  'h2-h4',
  'a6-h6',
  'a5-c7',
  'f7-f6',
  'c7-d7',
  'e8-f7',
  'd7-b7',
  'd8-d3',
  'b7-b8',
  'd3-h7',
  'b8-c8',
  'f7-g6',
  'c8-e6',
]);

export const THREEFOLD_REPETITION_MOVES: readonly CoordMove[] = parseCoordMoves([
  'g1-f3',
  'g8-f6',
  'f3-g1',
  'f6-g8',
  'g1-f3',
  'g8-f6',
  'f3-g1',
  'f6-g8',
]);

export const FIFTY_MOVE_104_PLY_MOVES: readonly CoordMove[] = parseCoordMoves([
  'e2-e4', 'e7-e5', 'a2-a4', 'a7-a5', 'a1-a2', 'a8-a7', 'a2-a3', 'b8-c6',
  'a3-b3', 'd8-e7', 'b3-b4', 'e8-d8', 'b4-b5', 'd8-e8', 'b5-b6', 'e8-d8',
  'b6-b5', 'd8-e8', 'b5-b6', 'e8-d8', 'b6-b4', 'd8-e8', 'b4-b5', 'e8-d8',
  'b5-b6', 'd8-e8', 'b6-b5', 'e8-d8', 'b5-b6', 'd8-e8', 'b6-b4', 'e8-d8',
  'b4-c4', 'd8-e8', 'c4-c5', 'e8-d8', 'c5-d5', 'd8-e8', 'd5-d6', 'e8-d8',
  'd6-e6', 'd8-e8', 'e6-f6', 'e8-d8', 'f6-g6', 'd8-e8', 'g6-h6', 'e8-d8',
  'h6-h5', 'd8-e8', 'h5-h6', 'e8-d8', 'h6-h5', 'd8-e8', 'h5-h4', 'e8-d8',
  'h4-h6', 'd8-e8', 'h6-h5', 'e8-d8', 'h5-h6', 'd8-e8', 'h6-h5', 'e8-d8',
  'h5-h4', 'd8-e8', 'h4-h3', 'e8-d8', 'h3-h4', 'd8-e8', 'h4-h3', 'e8-d8',
  'h3-g3', 'd8-e8', 'g3-g4', 'e8-d8', 'g4-g5', 'd8-e8', 'g5-g6', 'e8-d8',
  'g6-g5', 'd8-e8', 'g5-g6', 'e8-d8', 'g6-g4', 'd8-e8', 'g4-g5', 'e8-d8',
  'g5-g6', 'd8-e8', 'g6-g5', 'e8-d8', 'g5-g4', 'd8-e8', 'g4-h4', 'e8-d8',
  'h4-h3', 'd8-e8', 'h3-g3', 'e8-d8', 'g3-h3', 'd8-e8', 'h3-g3', 'e8-d8',
]);

export const PROMOTION_8_PLY_SETUP: readonly CoordMove[] = parseCoordMoves([
  'b2-b4',
  'a7-a5',
  'b4-b5',
  'c7-c6',
  'b5-c6',
  'd8-b6',
  'c6-b7',
  'b6-b1',
]);

export const PROMOTION_TRIGGER_MOVE: CoordMove = { from: 'b7', to: 'a8' };

export const EN_PASSANT_SEQUENCE: readonly CoordMove[] = parseCoordMoves([
  'e2-e4',
  'a7-a6',
  'e4-e5',
  'd7-d5',
  'e5-d6',
]);

export const KINGSIDE_CASTLE_SEQUENCE: readonly CoordMove[] = parseCoordMoves([
  'e2-e4',
  'e7-e5',
  'g1-f3',
  'b8-c6',
  'f1-c4',
  'f8-c5',
  'e1-g1',
]);

export const QUEENSIDE_CASTLE_SEQUENCE: readonly CoordMove[] = parseCoordMoves([
  'd2-d4',
  'd7-d5',
  'b1-c3',
  'b8-c6',
  'c1-f4',
  'c8-f5',
  'd1-d2',
  'd8-d7',
  'e1-c1',
]);

export const STALEMATE_FEN_AND_MOVE = {
  fen: '7k/5Q2/8/6K1/8/8/8/8 w - - 0 1',
  move: { from: 'g5', to: 'g6' } satisfies CoordMove,
};

export const INSUFFICIENT_K_VS_K_FEN_AND_MOVE = {
  fen: '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',
  move: { from: 'e1', to: 'e2' } satisfies CoordMove,
};

export const INSUFFICIENT_KB_VS_K_FEN_AND_MOVE = {
  fen: '4k3/8/8/8/8/8/4n3/3K1B2 w - - 0 1',
  move: { from: 'f1', to: 'e2' } satisfies CoordMove,
};

export const INSUFFICIENT_KN_VS_K_FEN_AND_MOVE = {
  fen: '4k3/8/8/8/8/8/4r3/3K2N1 w - - 0 1',
  move: { from: 'g1', to: 'e2' } satisfies CoordMove,
};

export const INSUFFICIENT_SAME_COLOR_KB_VS_KB_FEN_AND_MOVE = {
  fen: '4k3/8/8/8/8/5b2/4r3/3K1B2 w - - 0 1',
  move: { from: 'f1', to: 'e2' } satisfies CoordMove,
};

export const SUFFICIENT_OPPOSITE_KB_VS_KB_FEN =
  '4k3/8/8/8/8/4b3/8/3K1B2 w - - 0 1';

export const FIFTY_MOVE_99_FEN_AND_MOVE = {
  fen: '4k3/8/8/8/8/8/8/4K2R w K - 99 60',
  move: { from: 'h1', to: 'g1' } satisfies CoordMove,
};

export const FIFTY_MOVE_98_FEN_AND_MOVES = {
  fen: '4k3/8/8/8/8/8/8/4K2R w K - 98 60',
  firstMove: { from: 'h1', to: 'g1' } satisfies CoordMove,
  secondMove: { from: 'e8', to: 'd8' } satisfies CoordMove,
};

export const PROMOTION_FEN = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
export const EN_PASSANT_FEN = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
export const MATE_IN_1_WHITE_FEN = '6k1/5ppp/8/8/8/8/8/3QK2R w - - 0 1';

export const CASTLING_CHECK_FENS = {
  kingInCheck: '4k3/8/8/8/8/8/4r3/4K2R w K - 0 1',
  squareAttacked: '4k3/8/8/8/8/5r2/8/4K2R w K - 0 1',
  noRights: '4k3/8/8/8/8/8/8/4K2R w - - 0 1',
  validBothSides: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
};

export interface ThemeRgbSpec {
  id: BoardThemeId;
  label: string;
  lightHex: string;
  darkHex: string;
  lightRgb: string;
  darkRgb: string;
}

export const BOARD_THEME_RGB: Record<BoardThemeId, ThemeRgbSpec> = {
  classic: {
    id: 'classic',
    label: 'Clásico',
    lightHex: '#eeeed2',
    darkHex: '#769656',
    lightRgb: 'rgb(238, 238, 210)',
    darkRgb: 'rgb(118, 150, 86)',
  },
  wood: {
    id: 'wood',
    label: 'Madera',
    lightHex: '#f0d9b5',
    darkHex: '#b58863',
    lightRgb: 'rgb(240, 217, 181)',
    darkRgb: 'rgb(181, 136, 99)',
  },
  slate: {
    id: 'slate',
    label: 'Pizarra',
    lightHex: '#cbd5e1',
    darkHex: '#475569',
    lightRgb: 'rgb(203, 213, 225)',
    darkRgb: 'rgb(71, 85, 105)',
  },
  ocean: {
    id: 'ocean',
    label: 'Océano',
    lightHex: '#dbeafe',
    darkHex: '#2563eb',
    lightRgb: 'rgb(219, 234, 254)',
    darkRgb: 'rgb(37, 99, 235)',
  },
};

export interface CreateTestMatchOptions {
  id?: string;
  rules?: ChessRulesPort;
  timeControl?: TimeControlConfig | null;
  whiteTimeMs?: number | null;
  blackTimeMs?: number | null;
  whiteIsAi?: boolean;
  blackIsAi?: boolean;
  initialFen?: string;
}

export function createTestMatch(options: CreateTestMatchOptions = {}): Match {
  const timeControl = options.timeControl === undefined ? null : options.timeControl;
  const defaultRemaining = timeControl ? timeControl.initialMs : null;

  const whitePlayer = Player.create({
    id: 'white-player',
    name: 'Blancas',
    color: 'w',
    remainingTimeMs:
      options.whiteTimeMs !== undefined ? options.whiteTimeMs : defaultRemaining,
    isAi: options.whiteIsAi ?? false,
  });

  const blackPlayer = Player.create({
    id: 'black-player',
    name: 'Negras',
    color: 'b',
    remainingTimeMs:
      options.blackTimeMs !== undefined ? options.blackTimeMs : defaultRemaining,
    isAi: options.blackIsAi ?? false,
  });

  return Match.create({
    id: options.id ?? 'e2e-match-1',
    rules: options.rules ?? new ChessJsAdapter(),
    whitePlayer,
    blackPlayer,
    timeControl,
    initialFen: options.initialFen,
  });
}
