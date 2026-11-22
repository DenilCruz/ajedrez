import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChessJsAdapter,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type LegalMoveOption,
  type PieceColor,
  type PromotionPiece,
  type RoomColorPreference,
  type RoomRole,
  type RoomStatePayload,
  type TimeControlConfig,
} from '@chess-platform/shared-domain';
import { PlayOnlineMoveUseCase } from '../../application/use-cases/play-online-move.use-case';
import { SocketIoAdapter } from '../../infrastructure/network/socket-io.adapter';
import type { PendingPromotion } from './useMatchController';

const SESSION_STORAGE_KEY = 'gambit:online-room-session';

interface StoredRoomSession {
  code: string;
  sessionToken: string;
  role: RoomRole;
}

function readStoredSession(): StoredRoomSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRoomSession>;
    if (
      typeof parsed.code === 'string' &&
      typeof parsed.sessionToken === 'string' &&
      (parsed.role === 'host' || parsed.role === 'guest')
    ) {
      return {
        code: parsed.code,
        sessionToken: parsed.sessionToken,
        role: parsed.role,
      };
    }
  } catch {
    // Ignore malformed session data
  }
  return null;
}

function saveStoredSession(session: StoredRoomSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (session) {
      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(session),
      );
    } else {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export interface UseOnlineRoomControllerResult {
  room: RoomStatePayload | null;
  myRole: RoomRole | null;
  myColor: PieceColor | null;
  isConnected: boolean;
  isBusy: boolean;
  error: string | null;
  selectedSquare: string | null;
  legalMovesForSelected: LegalMoveOption[];
  pendingPromotion: PendingPromotion | null;
  isInteractionDisabled: boolean;
  clearError: () => void;
  createRoom: (payload: CreateRoomPayload) => Promise<boolean>;
  joinRoom: (payload: JoinRoomPayload) => Promise<boolean>;
  toggleReady: () => Promise<void>;
  updateConfig: (
    hostColorPreference: RoomColorPreference,
    timeControl: TimeControlConfig | null,
  ) => Promise<void>;
  startMatch: () => Promise<void>;
  handleSquareSelect: (square: string) => void;
  handlePieceDrop: (from: string, to: string) => boolean;
  selectPromotion: (piece: PromotionPiece) => void;
  cancelPromotion: () => void;
  resign: () => Promise<void>;
  returnToLobby: () => Promise<void>;
  leaveRoom: () => Promise<void>;
}

export function useOnlineRoomController(): UseOnlineRoomControllerResult {
  const adapterRef = useRef<SocketIoAdapter | null>(null);
  const moveUseCaseRef = useRef<PlayOnlineMoveUseCase | null>(null);

  const getAdapter = useCallback((): SocketIoAdapter => {
    if (!adapterRef.current) {
      adapterRef.current = new SocketIoAdapter();
    }
    return adapterRef.current;
  }, []);

  const getMoveUseCase = useCallback((): PlayOnlineMoveUseCase => {
    if (!moveUseCaseRef.current) {
      moveUseCaseRef.current = new PlayOnlineMoveUseCase(getAdapter());
    }
    return moveUseCaseRef.current;
  }, [getAdapter]);

  const [room, setRoom] = useState<RoomStatePayload | null>(null);
  const [myRole, setMyRole] = useState<RoomRole | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingPromotion | null>(null);

  useEffect(() => {
    const adapter = getAdapter();

    const offState = adapter.onRoomState((nextRoom) => {
      setRoom(nextRoom);
      if (nextRoom.phase !== 'playing') {
        setSelectedSquare(null);
        setPendingPromotion(null);
      }
    });

    const offClosed = adapter.onRoomClosed(({ reason }) => {
      saveStoredSession(null);
      setRoom(null);
      setMyRole(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setError(reason);
    });

    const offConn = adapter.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        const saved = readStoredSession();
        if (saved) {
          void adapter
            .reconnectRoom({
              code: saved.code,
              sessionToken: saved.sessionToken,
            })
            .then((ack) => {
              if (ack.ok && ack.room && ack.role) {
                setRoom(ack.room);
                setMyRole(ack.role);
                setError(null);
              } else {
                saveStoredSession(null);
              }
            });
        }
      }
    });

    // Auto-reconnect on mount if there is an active session in sessionStorage
    const saved = readStoredSession();
    if (saved) {
      adapter.connect();
    }

    return () => {
      offState();
      offClosed();
      offConn();
      adapter.disconnect();
    };
  }, [getAdapter]);

  const clearError = useCallback(() => setError(null), []);

  const createRoom = useCallback(
    async (payload: CreateRoomPayload): Promise<boolean> => {
      setIsBusy(true);
      setError(null);
      try {
        const ack = await getAdapter().createRoom(payload);
        if (!ack.ok || !ack.room || !ack.sessionToken || !ack.role) {
          setError(ack.error ?? 'No se pudo crear la sala.');
          return false;
        }
        saveStoredSession({
          code: ack.room.code,
          sessionToken: ack.sessionToken,
          role: ack.role,
        });
        setRoom(ack.room);
        setMyRole(ack.role);
        return true;
      } finally {
        setIsBusy(false);
      }
    },
    [getAdapter],
  );

  const joinRoom = useCallback(
    async (payload: JoinRoomPayload): Promise<boolean> => {
      setIsBusy(true);
      setError(null);
      try {
        const ack = await getAdapter().joinRoom(payload);
        if (!ack.ok || !ack.room || !ack.sessionToken || !ack.role) {
          setError(ack.error ?? 'No se pudo unir a la sala.');
          return false;
        }
        saveStoredSession({
          code: ack.room.code,
          sessionToken: ack.sessionToken,
          role: ack.role,
        });
        setRoom(ack.room);
        setMyRole(ack.role);
        return true;
      } finally {
        setIsBusy(false);
      }
    },
    [getAdapter],
  );

  const toggleReady = useCallback(async () => {
    if (!room) return;
    setError(null);
    const ack = await getAdapter().toggleReady(room.code);
    if (!ack.ok) {
      setError(ack.error ?? 'No se pudo actualizar tu estado.');
    }
  }, [getAdapter, room]);

  const updateConfig = useCallback(
    async (
      hostColorPreference: RoomColorPreference,
      timeControl: TimeControlConfig | null,
    ) => {
      if (!room) return;
      setError(null);
      const ack = await getAdapter().updateConfig({
        code: room.code,
        hostColorPreference,
        timeControl,
      });
      if (!ack.ok) {
        setError(ack.error ?? 'No se pudo actualizar la configuración.');
      }
    },
    [getAdapter, room],
  );

  const startMatch = useCallback(async () => {
    if (!room) return;
    setIsBusy(true);
    setError(null);
    try {
      const ack = await getAdapter().startMatch(room.code);
      if (!ack.ok) {
        setError(ack.error ?? 'No se pudo iniciar la partida.');
      }
    } finally {
      setIsBusy(false);
    }
  }, [getAdapter, room]);

  const myColor: PieceColor | null = useMemo(() => {
    if (!room || !myRole) return null;
    if (myRole === 'host') return room.host.color;
    return room.guest?.color ?? null;
  }, [room, myRole]);

  const snapshot = room?.match ?? null;

  const isMyTurn = Boolean(
    room?.phase === 'playing' &&
      snapshot &&
      snapshot.status === 'playing' &&
      myColor !== null &&
      snapshot.turn === myColor,
  );

  const isInteractionDisabled = !isMyTurn || pendingPromotion !== null;

  const allLegalMoves = useMemo<LegalMoveOption[]>(() => {
    if (!snapshot || snapshot.status !== 'playing' || !isMyTurn) {
      return [];
    }
    try {
      const rules = new ChessJsAdapter(snapshot.fen);
      return rules.getLegalMoves();
    } catch {
      return [];
    }
  }, [snapshot, isMyTurn]);

  const legalMovesForSelected = useMemo<LegalMoveOption[]>(() => {
    if (!selectedSquare) return [];
    return allLegalMoves.filter((m) => m.from === selectedSquare);
  }, [allLegalMoves, selectedSquare]);

  const submitMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      if (!room || !isMyTurn) return false;
      const matching = allLegalMoves.filter(
        (m) => m.from === from && m.to === to,
      );
      if (matching.length === 0) return false;

      if (matching.some((m) => m.promotion !== undefined) && !promotion) {
        setPendingPromotion({ from, to, color: myColor ?? 'w' });
        setSelectedSquare(from);
        return false;
      }

      setSelectedSquare(null);
      setPendingPromotion(null);
      void getMoveUseCase()
        .execute({
          code: room.code,
          from,
          to,
          promotion,
        })
        .then((ack) => {
          if (!ack.ok) {
            setError(ack.error ?? 'No se pudo enviar la jugada.');
          }
        });
      return true;
    },
    [room, isMyTurn, allLegalMoves, myColor, getMoveUseCase],
  );

  const handleSquareSelect = useCallback(
    (square: string) => {
      if (!isMyTurn) return;

      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      if (selectedSquare) {
        const hasMove = allLegalMoves.some(
          (m) => m.from === selectedSquare && m.to === square,
        );
        if (hasMove) {
          submitMove(selectedSquare, square);
          return;
        }
      }

      const canSelect = allLegalMoves.some((m) => m.from === square);
      setSelectedSquare(canSelect ? square : null);
    },
    [isMyTurn, selectedSquare, allLegalMoves, submitMove],
  );

  const handlePieceDrop = useCallback(
    (from: string, to: string): boolean => {
      return submitMove(from, to);
    },
    [submitMove],
  );

  const selectPromotion = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      submitMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
    [pendingPromotion, submitMove],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    setSelectedSquare(null);
  }, []);

  const resign = useCallback(async () => {
    if (!room) return;
    const ack = await getAdapter().resign(room.code);
    if (!ack.ok) {
      setError(ack.error ?? 'No se pudo rendir.');
    }
  }, [getAdapter, room]);

  const returnToLobby = useCallback(async () => {
    if (!room) return;
    const ack = await getAdapter().returnToLobby(room.code);
    if (!ack.ok) {
      setError(ack.error ?? 'No se pudo volver a la sala.');
    }
  }, [getAdapter, room]);

  const leaveRoom = useCallback(async () => {
    if (room) {
      await getAdapter().leaveRoom(room.code);
    }
    saveStoredSession(null);
    setRoom(null);
    setMyRole(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setError(null);
  }, [getAdapter, room]);

  return {
    room,
    myRole,
    myColor,
    isConnected,
    isBusy,
    error,
    selectedSquare,
    legalMovesForSelected,
    pendingPromotion,
    isInteractionDisabled,
    clearError,
    createRoom,
    joinRoom,
    toggleReady,
    updateConfig,
    startMatch,
    handleSquareSelect,
    handlePieceDrop,
    selectPromotion,
    cancelPromotion,
    resign,
    returnToLobby,
    leaveRoom,
  };
}
