import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_THEMES,
  ChessJsAdapter,
  Match,
  Move,
  Player,
  type AiDifficultyLevel,
  type BoardThemeConfig,
  type BoardThemeId,
  type LegalMoveOption,
  type MatchSnapshot,
  type PieceColor,
  type PromotionPiece,
  type TimeControlConfig,
} from '@chess-platform/shared-domain';
import { PlayLocalMoveUseCase } from '../../application/use-cases/play-local-move.use-case';
import { StockfishWorkerAdapter } from '../../infrastructure/ai/stockfish-worker.adapter';
import { LocalStorageAdapter } from '../../infrastructure/storage/local-storage.adapter';

export type GameMode = 'vs-ai' | 'local-2p';

export interface MatchConfig {
  mode: GameMode;
  difficulty: AiDifficultyLevel;
  playerColor: PieceColor;
  timeControl: TimeControlConfig | null;
}

export interface PendingPromotion {
  from: string;
  to: string;
  color: PieceColor;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  mode: 'vs-ai',
  difficulty: 'medium',
  playerColor: 'w',
  timeControl: { initialMs: 10 * 60 * 1000, incrementMs: 0 },
};

function generateMatchId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMatchFromConfig(config: MatchConfig): Match {
  const initialTimeMs = config.timeControl ? config.timeControl.initialMs : null;
  const whiteIsAi = config.mode === 'vs-ai' && config.playerColor === 'b';
  const blackIsAi = config.mode === 'vs-ai' && config.playerColor === 'w';

  const whitePlayer = new Player({
    id: 'white',
    name: whiteIsAi ? 'Stockfish' : config.mode === 'vs-ai' ? 'Jugador' : 'Blancas',
    color: 'w',
    remainingTimeMs: initialTimeMs,
    isAi: whiteIsAi,
  });

  const blackPlayer = new Player({
    id: 'black',
    name: blackIsAi ? 'Stockfish' : config.mode === 'vs-ai' ? 'Jugador' : 'Negras',
    color: 'b',
    remainingTimeMs: initialTimeMs,
    isAi: blackIsAi,
  });

  return Match.create({
    id: generateMatchId(),
    rules: new ChessJsAdapter(),
    whitePlayer,
    blackPlayer,
    timeControl: config.timeControl,
  });
}

export interface UseMatchControllerResult {
  snapshot: MatchSnapshot;
  config: MatchConfig;
  themeId: BoardThemeId;
  theme: BoardThemeConfig;
  boardOrientation: 'white' | 'black';
  canFlipBoard: boolean;
  isClockRunning: boolean;
  isAiThinking: boolean;
  aiError: string | null;
  isInteractionDisabled: boolean;
  selectedSquare: string | null;
  legalMovesForSelected: LegalMoveOption[];
  pendingPromotion: PendingPromotion | null;
  isSetupModalOpen: boolean;
  openSetupModal: () => void;
  closeSetupModal: () => void;
  startNewMatch: (nextConfig: MatchConfig) => void;
  restartMatch: () => void;
  resign: () => void;
  flipBoard: () => void;
  selectTheme: (theme: BoardThemeId) => void;
  handleSquareSelect: (square: string) => void;
  handlePieceDrop: (from: string, to: string) => boolean;
  selectPromotion: (piece: PromotionPiece) => void;
  cancelPromotion: () => void;
}

export function useMatchController(): UseMatchControllerResult {
  const storageRef = useRef<LocalStorageAdapter | null>(null);
  const aiEngineRef = useRef<StockfishWorkerAdapter | null>(null);
  const useCaseRef = useRef<PlayLocalMoveUseCase | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const matchEpochRef = useRef<number>(0);

  const getStorage = useCallback((): LocalStorageAdapter => {
    if (!storageRef.current) {
      storageRef.current = new LocalStorageAdapter();
    }
    return storageRef.current;
  }, []);

  const getUseCase = useCallback((): PlayLocalMoveUseCase => {
    if (!aiEngineRef.current) {
      aiEngineRef.current = new StockfishWorkerAdapter();
    }
    if (!useCaseRef.current) {
      useCaseRef.current = new PlayLocalMoveUseCase(aiEngineRef.current);
    }
    return useCaseRef.current;
  }, []);

  const [config, setConfig] = useState<MatchConfig>(DEFAULT_MATCH_CONFIG);
  const [match, setMatch] = useState<Match>(() =>
    createMatchFromConfig(DEFAULT_MATCH_CONFIG),
  );
  const [snapshot, setSnapshot] = useState<MatchSnapshot>(() =>
    match.getSnapshot(),
  );
  const [matchGeneration, setMatchGeneration] = useState<number>(0);
  const [themeId, setThemeId] = useState<BoardThemeId>(() =>
    new LocalStorageAdapter().getTheme(),
  );
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingPromotion | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [manualOrientation, setManualOrientation] = useState<'white' | 'black'>(
    'white',
  );
  const [isSetupModalOpen, setIsSetupModalOpen] = useState<boolean>(false);

  // StrictMode-safe unmount cleanup
  useEffect(() => {
    return () => {
      matchEpochRef.current += 1;
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
      aiEngineRef.current?.dispose();
      aiEngineRef.current = null;
      useCaseRef.current = null;
    };
  }, []);

  const isAiTurnPending =
    config.mode === 'vs-ai' &&
    snapshot.status === 'playing' &&
    snapshot.turn !== config.playerColor;

  const isAiThinking = isAiTurnPending && aiError === null;

  const isPlayerTurn =
    snapshot.status === 'playing' &&
    (config.mode === 'local-2p' || snapshot.turn === config.playerColor);

  const isInteractionDisabled =
    snapshot.status === 'ended' ||
    isAiThinking ||
    !isPlayerTurn ||
    pendingPromotion !== null;

  const legalMovesForSelected = useMemo<LegalMoveOption[]>(() => {
    if (!selectedSquare || isInteractionDisabled) {
      return [];
    }
    void snapshot.fen;
    void matchGeneration;
    return match.getLegalMoves(selectedSquare);
  }, [match, selectedSquare, isInteractionDisabled, snapshot.fen, matchGeneration]);

  const canFlipBoard = config.mode === 'local-2p';
  const boardOrientation: 'white' | 'black' =
    config.mode === 'vs-ai'
      ? config.playerColor === 'w'
        ? 'white'
        : 'black'
      : manualOrientation;

  const theme = BOARD_THEMES[themeId];
  const isClockRunning =
    snapshot.status === 'playing' &&
    snapshot.history.length > 0 &&
    config.timeControl !== null;

  // Trigger AI turn when in vs-ai mode and it's the AI's turn (including Move 1 if player is Black)
  useEffect(() => {
    if (
      config.mode !== 'vs-ai' ||
      snapshot.status !== 'playing' ||
      snapshot.turn === config.playerColor
    ) {
      return;
    }

    const epoch = matchEpochRef.current;

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    void (async () => {
      try {
        const result = await getUseCase().executeAiTurn(
          match,
          config.difficulty,
          controller.signal,
        );
        if (controller.signal.aborted || matchEpochRef.current !== epoch) {
          return;
        }
        if (result) {
          setSnapshot(result.snapshot);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted || matchEpochRef.current !== epoch) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Error al calcular jugada de la IA.';
        setAiError(message);
      } finally {
        if (
          matchEpochRef.current === epoch &&
          aiAbortRef.current === controller
        ) {
          aiAbortRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
      }
    };
  }, [
    match,
    config.mode,
    config.playerColor,
    config.difficulty,
    snapshot.status,
    snapshot.turn,
    snapshot.fen,
    matchGeneration,
    getUseCase,
  ]);

  // Clock interval — ticks only after first move while playing with a timeControl
  useEffect(() => {
    if (
      snapshot.status !== 'playing' ||
      snapshot.history.length === 0 ||
      config.timeControl === null
    ) {
      return;
    }

    let lastTickAt = Date.now();
    const timerId = window.setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastTickAt;
      lastTickAt = now;
      if (elapsedMs <= 0) return;

      const endEvent = match.tickClock(elapsedMs);
      if (endEvent) {
        aiAbortRef.current?.abort();
        aiAbortRef.current = null;
        setPendingPromotion(null);
        setSelectedSquare(null);
      }
      setSnapshot(match.getSnapshot());
    }, 100);

    return () => window.clearInterval(timerId);
  }, [
    match,
    snapshot.status,
    snapshot.history.length,
    config.timeControl,
    matchGeneration,
  ]);

  const commitMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      if (match.getStatus() !== 'playing') return false;
      if (config.mode === 'vs-ai' && match.getTurn() !== config.playerColor) {
        return false;
      }

      const candidates = match
        .getLegalMoves(from)
        .filter((candidate) => candidate.to === to);
      if (candidates.length === 0) {
        return false;
      }

      if (
        promotion === undefined &&
        candidates.some((candidate) => candidate.promotion !== undefined)
      ) {
        setPendingPromotion({ from, to, color: match.getTurn() });
        setSelectedSquare(null);
        return false;
      }

      try {
        const move = Move.create({ from, to, promotion });
        const result = getUseCase().executePlayerMove(match, move);
        setSelectedSquare(null);
        setPendingPromotion(null);
        setAiError(null);
        setSnapshot(result.snapshot);
        return true;
      } catch {
        return false;
      }
    },
    [match, config.mode, config.playerColor, getUseCase],
  );

  const handlePieceDrop = useCallback(
    (from: string, to: string): boolean => {
      if (isInteractionDisabled) {
        return false;
      }
      return commitMove(from, to);
    },
    [isInteractionDisabled, commitMove],
  );

  const handleSquareSelect = useCallback(
    (square: string): void => {
      if (isInteractionDisabled) {
        return;
      }

      if (selectedSquare === null) {
        if (match.getLegalMoves(square).length > 0) {
          setSelectedSquare(square);
        }
        return;
      }

      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      const candidates = match
        .getLegalMoves(selectedSquare)
        .filter((candidate) => candidate.to === square);
      if (candidates.length > 0) {
        commitMove(selectedSquare, square);
        return;
      }

      if (match.getLegalMoves(square).length > 0) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
    },
    [isInteractionDisabled, selectedSquare, match, commitMove],
  );

  const selectPromotion = useCallback(
    (piece: PromotionPiece): void => {
      if (!pendingPromotion) return;
      commitMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
    [pendingPromotion, commitMove],
  );

  const cancelPromotion = useCallback((): void => {
    setPendingPromotion(null);
    setSelectedSquare(null);
  }, []);

  const startNewMatch = useCallback((nextConfig: MatchConfig): void => {
    matchEpochRef.current += 1;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;

    setAiError(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setConfig(nextConfig);

    if (nextConfig.mode === 'local-2p') {
      setManualOrientation('white');
    }

    const nextMatch = createMatchFromConfig(nextConfig);
    setMatch(nextMatch);
    setSnapshot(nextMatch.getSnapshot());
    setMatchGeneration((prev) => prev + 1);
    setIsSetupModalOpen(false);
  }, []);

  const restartMatch = useCallback((): void => {
    startNewMatch(config);
  }, [config, startNewMatch]);

  const resign = useCallback((): void => {
    if (match.getStatus() === 'ended') {
      return;
    }

    matchEpochRef.current += 1;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;

    setPendingPromotion(null);
    setSelectedSquare(null);

    const resigningColor =
      config.mode === 'vs-ai' ? config.playerColor : match.getTurn();
    match.resign(resigningColor);
    setSnapshot(match.getSnapshot());
  }, [match, config.mode, config.playerColor]);

  const flipBoard = useCallback((): void => {
    if (config.mode === 'local-2p') {
      setManualOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
    }
  }, [config.mode]);

  const selectTheme = useCallback(
    (nextTheme: BoardThemeId): void => {
      getStorage().saveTheme(nextTheme);
      setThemeId(nextTheme);
    },
    [getStorage],
  );

  const openSetupModal = useCallback((): void => {
    setIsSetupModalOpen(true);
  }, []);

  const closeSetupModal = useCallback((): void => {
    setIsSetupModalOpen(false);
  }, []);

  return {
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
  };
}
