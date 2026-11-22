import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  BOARD_THEMES,
  ChessJsAdapter,
  Match,
  Move,
  Player,
  type BoardThemeConfig,
  type BoardThemeId,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type LegalMoveOption,
  type MatchSnapshot,
  type PieceColor,
  type PromotionPiece,
  type RoomColorPreference,
  type RoomRole,
  type RoomStatePayload,
  type TimeControlConfig,
} from '@chess-platform/shared-domain';
import { PlayOnlineMoveUseCase } from '../../application/use-cases/play-online-move.use-case';
import { SocketIoAdapter } from '../../infrastructure/network/socket-io.adapter';

const SESSION_STORAGE_KEY = 'gambit:mobile-room-session';

interface StoredRoomSession {
  code: string;
  sessionToken: string;
  role: RoomRole;
  serverUrl: string;
}

export interface PendingPromotion {
  from: string;
  to: string;
  color: PieceColor;
}

function createLocalMatch(): Match {
  return Match.create({
    id: `mobile-local-${Date.now()}`,
    rules: new ChessJsAdapter(),
    whitePlayer: new Player({
      id: 'w',
      name: 'Blancas',
      color: 'w',
      remainingTimeMs: 600_000,
      isAi: false,
    }),
    blackPlayer: new Player({
      id: 'b',
      name: 'Negras',
      color: 'b',
      remainingTimeMs: 600_000,
      isAi: false,
    }),
    timeControl: { initialMs: 600_000, incrementMs: 0 },
  });
}

async function readStoredSession(): Promise<StoredRoomSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
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
        serverUrl:
          typeof parsed.serverUrl === 'string'
            ? parsed.serverUrl
            : 'http://localhost:3000',
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

async function saveStoredSession(
  session: StoredRoomSession | null,
): Promise<void> {
  try {
    if (session) {
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage write errors
  }
}

export function useMatchController() {
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

  const [localMatch, setLocalMatch] = useState<Match>(() => createLocalMatch());
  const [localSnapshot, setLocalSnapshot] = useState<MatchSnapshot>(() =>
    localMatch.getSnapshot(),
  );
  const [localOrientation, setLocalOrientation] = useState<'white' | 'black'>(
    'white',
  );
  const [themeId, setThemeId] = useState<BoardThemeId>('wood');

  const [room, setRoom] = useState<RoomStatePayload | null>(null);
  const [myRole, setMyRole] = useState<RoomRole | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState<string>(() =>
    getAdapter().getServerUrl(),
  );

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingPromotion | null>(null);

  const isOnlineMatchActive = Boolean(
    room &&
      (room.phase === 'playing' || room.phase === 'ended') &&
      room.match,
  );
  const snapshot =
    isOnlineMatchActive && room?.match ? room.match : localSnapshot;

  const myColor: PieceColor | null = useMemo(() => {
    if (!room || !myRole) return null;
    return myRole === 'host' ? room.host.color : (room.guest?.color ?? null);
  }, [room, myRole]);

  const orientation: 'white' | 'black' = isOnlineMatchActive
    ? myColor === 'b'
      ? 'black'
      : 'white'
    : localOrientation;

  // Local clock tick
  useEffect(() => {
    if (isOnlineMatchActive) return;
    if (localSnapshot.status !== 'playing' || localSnapshot.history.length === 0) {
      return;
    }

    let lastAt = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastAt;
      lastAt = now;
      localMatch.tickClock(elapsed);
      setLocalSnapshot(localMatch.getSnapshot());
    }, 250);

    return () => clearInterval(timer);
  }, [
    isOnlineMatchActive,
    localMatch,
    localSnapshot.status,
    localSnapshot.history.length,
  ]);

  // Socket.io lifecycle + auto-reconnect
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
      void saveStoredSession(null);
      setRoom(null);
      setMyRole(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setError(reason);
    });

    const offConn = adapter.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        void readStoredSession().then((saved) => {
          if (!saved) return;
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
                void saveStoredSession(null);
              }
            });
        });
      }
    });

    void readStoredSession().then((saved) => {
      if (saved) {
        adapter.setServerUrl(saved.serverUrl);
        setServerUrlState(saved.serverUrl);
        adapter.connect();
      }
    });

    return () => {
      offState();
      offClosed();
      offConn();
      adapter.disconnect();
    };
  }, [getAdapter]);

  const setServerUrl = useCallback(
    (nextUrl: string) => {
      const cleaned = nextUrl.trim();
      if (!cleaned) return;
      getAdapter().setServerUrl(cleaned);
      setServerUrlState(cleaned);
    },
    [getAdapter],
  );

  const clearError = useCallback(() => setError(null), []);

  const createRoom = useCallback(
    async (payload: CreateRoomPayload): Promise<boolean> => {
      setIsBusy(true);
      setError(null);
      try {
        const adapter = getAdapter();
        const ack = await adapter.createRoom(payload);
        if (!ack.ok || !ack.room || !ack.sessionToken || !ack.role) {
          setError(ack.error ?? 'No se pudo crear la sala.');
          return false;
        }
        await saveStoredSession({
          code: ack.room.code,
          sessionToken: ack.sessionToken,
          role: ack.role,
          serverUrl: adapter.getServerUrl(),
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
        const adapter = getAdapter();
        const ack = await adapter.joinRoom(payload);
        if (!ack.ok || !ack.room || !ack.sessionToken || !ack.role) {
          setError(ack.error ?? 'No se pudo unir a la sala.');
          return false;
        }
        await saveStoredSession({
          code: ack.room.code,
          sessionToken: ack.sessionToken,
          role: ack.role,
          serverUrl: adapter.getServerUrl(),
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
      setError(ack.error ?? 'No se pudo actualizar Listo.');
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

  const canInteract = isOnlineMatchActive
    ? Boolean(
        room?.phase === 'playing' &&
          snapshot.status === 'playing' &&
          myColor !== null &&
          snapshot.turn === myColor &&
          pendingPromotion === null,
      )
    : snapshot.status === 'playing' && pendingPromotion === null;

  const allLegalMoves = useMemo<LegalMoveOption[]>(() => {
    if (snapshot.status !== 'playing') return [];
    if (isOnlineMatchActive && (!myColor || snapshot.turn !== myColor)) {
      return [];
    }
    try {
      const rules = new ChessJsAdapter(snapshot.fen);
      return rules.getLegalMoves();
    } catch {
      return [];
    }
  }, [snapshot.fen, snapshot.status, snapshot.turn, isOnlineMatchActive, myColor]);

  const legalMovesForSelected = useMemo<LegalMoveOption[]>(() => {
    if (!selectedSquare) return [];
    return allLegalMoves.filter((m) => m.from === selectedSquare);
  }, [allLegalMoves, selectedSquare]);

  const executeMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece) => {
      const matching = allLegalMoves.filter(
        (m) => m.from === from && m.to === to,
      );
      if (matching.length === 0) return;

      if (matching.some((m) => m.promotion !== undefined) && !promotion) {
        setPendingPromotion({ from, to, color: snapshot.turn });
        setSelectedSquare(from);
        return;
      }

      setSelectedSquare(null);
      setPendingPromotion(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (isOnlineMatchActive && room) {
        void getMoveUseCase()
          .execute({
            code: room.code,
            from,
            to,
            promotion,
          })
          .then((ack) => {
            if (!ack.ok) {
              setError(ack.error ?? 'Jugada rechazada por el servidor.');
            }
          });
      } else {
        localMatch.playMove(Move.create({ from, to, promotion }));
        setLocalSnapshot(localMatch.getSnapshot());
      }
    },
    [
      allLegalMoves,
      snapshot.turn,
      isOnlineMatchActive,
      room,
      getMoveUseCase,
      localMatch,
    ],
  );

  const handleSquareSelect = useCallback(
    (square: string) => {
      if (!canInteract) return;

      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      if (selectedSquare) {
        const isTarget = allLegalMoves.some(
          (m) => m.from === selectedSquare && m.to === square,
        );
        if (isTarget) {
          executeMove(selectedSquare, square);
          return;
        }
      }

      const hasMovesFromSquare = allLegalMoves.some((m) => m.from === square);
      setSelectedSquare(hasMovesFromSquare ? square : null);
    },
    [canInteract, selectedSquare, allLegalMoves, executeMove],
  );

  const selectPromotion = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      executeMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
    [pendingPromotion, executeMove],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    setSelectedSquare(null);
  }, []);

  const restartLocal = useCallback(() => {
    const next = createLocalMatch();
    setLocalMatch(next);
    setLocalSnapshot(next.getSnapshot());
    setSelectedSquare(null);
    setPendingPromotion(null);
  }, []);

  const resign = useCallback(async () => {
    if (isOnlineMatchActive && room) {
      const ack = await getAdapter().resign(room.code);
      if (!ack.ok) {
        setError(ack.error ?? 'No se pudo rendir.');
      }
    } else if (localSnapshot.status === 'playing') {
      localMatch.resign(localSnapshot.turn);
      setLocalSnapshot(localMatch.getSnapshot());
    }
  }, [isOnlineMatchActive, room, getAdapter, localSnapshot, localMatch]);

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
    await saveStoredSession(null);
    setRoom(null);
    setMyRole(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setError(null);
  }, [getAdapter, room]);

  const theme: BoardThemeConfig = BOARD_THEMES[themeId];

  return {
    snapshot,
    themeId,
    theme,
    setThemeId,
    orientation,
    flipLocalBoard: () =>
      setLocalOrientation((prev) => (prev === 'white' ? 'black' : 'white')),
    isOnlineMatchActive,
    room,
    myRole,
    myColor,
    isConnected,
    isBusy,
    error,
    serverUrl,
    setServerUrl,
    clearError,
    selectedSquare,
    legalMovesForSelected,
    pendingPromotion,
    canInteract,
    createRoom,
    joinRoom,
    toggleReady,
    updateConfig,
    startMatch,
    handleSquareSelect,
    selectPromotion,
    cancelPromotion,
    restartLocal,
    resign,
    returnToLobby,
    leaveRoom,
  };
}
