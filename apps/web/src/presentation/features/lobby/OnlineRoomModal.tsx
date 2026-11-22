import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  RoomColorPreference,
  RoomRole,
  RoomStatePayload,
  TimeControlConfig,
} from '@chess-platform/shared-domain';

export interface OnlineRoomModalProps {
  isOpen: boolean;
  room: RoomStatePayload | null;
  myRole: RoomRole | null;
  isBusy: boolean;
  error: string | null;
  onClearError: () => void;
  onClose: () => void;
  onCreateRoom: (payload: CreateRoomPayload) => Promise<boolean>;
  onJoinRoom: (payload: JoinRoomPayload) => Promise<boolean>;
  onToggleReady: () => Promise<void>;
  onUpdateConfig: (
    hostColorPreference: RoomColorPreference,
    timeControl: TimeControlConfig | null,
  ) => Promise<void>;
  onStartMatch: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

type OnlineTab = 'create' | 'join';
type TimePresetId = 'none' | 'blitz-3-2' | 'rapid-10-0';

const TIME_PRESETS: ReadonlyArray<{
  id: TimePresetId;
  label: string;
  description: string;
  config: TimeControlConfig | null;
}> = [
  {
    id: 'none',
    label: 'Sin reloj',
    description: 'Sin límite de tiempo',
    config: null,
  },
  {
    id: 'blitz-3-2',
    label: '3+2 Blitz',
    description: '3 min + 2 s',
    config: { initialMs: 180_000, incrementMs: 2_000 },
  },
  {
    id: 'rapid-10-0',
    label: '10+0 Rápida',
    description: '10 min',
    config: { initialMs: 600_000, incrementMs: 0 },
  },
];

function resolveTimePresetId(tc: TimeControlConfig | null): TimePresetId {
  if (!tc) return 'none';
  if (tc.initialMs === 180_000 && tc.incrementMs === 2_000) return 'blitz-3-2';
  return 'rapid-10-0';
}

export function OnlineRoomModal({
  isOpen,
  room,
  myRole,
  isBusy,
  error,
  onClearError,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onUpdateConfig,
  onStartMatch,
  onLeaveRoom,
}: OnlineRoomModalProps) {
  const [tab, setTab] = useState<OnlineTab>('create');
  const [createCode, setCreateCode] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createNickname, setCreateNickname] = useState('');
  const [hostColorPref, setHostColorPref] =
    useState<RoomColorPreference>('w');
  const [timePreset, setTimePreset] = useState<TimePresetId>('rapid-10-0');

  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !room) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, room, onClose]);

  if (!isOpen) {
    return null;
  }

  const selectedCardClass =
    'border-transparent bg-gradient-to-b from-[#2a1d15]/90 to-[#19120d]/80 text-white ring-1 ring-[#b58863]/20 hover:from-[#322319]/90';
  const inactiveCardClass =
    'border-transparent bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800/60 hover:text-white';

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosenTime =
      TIME_PRESETS.find((t) => t.id === timePreset)?.config ?? null;
    await onCreateRoom({
      code: createCode.trim() || undefined,
      password: createPassword,
      nickname: createNickname.trim() || undefined,
      hostColorPreference: hostColorPref,
      timeControl: chosenTime,
    });
  };

  const handleJoinSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onJoinRoom({
      code: joinCode.trim(),
      password: joinPassword,
      nickname: joinNickname.trim() || undefined,
    });
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const inLobby = room !== null && room.phase === 'lobby';
  const activeTimeId = room ? resolveTimePresetId(room.timeControl) : 'rapid-10-0';
  const canHostStart = Boolean(
    room &&
      myRole === 'host' &&
      room.guest &&
      room.guest.connected &&
      room.guest.isReady &&
      !isBusy,
  );

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget && !inLobby) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-md sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="online-room-modal-title"
        className="relative my-auto w-full max-w-[600px] rounded-2xl border border-zinc-800/80 bg-[#121317]/95 p-5 text-zinc-200 shadow-2xl backdrop-blur-xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between border-b border-zinc-800/50 pb-3">
          <div>
            <span className="mb-1 block font-mono text-[10px] tracking-[0.25em] text-zinc-400 uppercase">
              GAMBIT • Multijugador Online
            </span>
            <h2
              id="online-room-modal-title"
              className="font-editorial text-2xl font-medium tracking-tight text-white"
            >
              {inLobby ? `Sala ${room.code}` : 'Jugar con un amigo'}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400 sm:text-sm">
              {inLobby
                ? 'Comparte el nombre de la sala y la contraseña para iniciar la partida'
                : 'Sin registro: crea una sala privada con contraseña o únete a una'}
            </p>
          </div>
          {!inLobby ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar multijugador"
              className="group rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2 text-zinc-400 transition duration-200 hover:bg-zinc-800/80 hover:text-white"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
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
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-950/35 px-3.5 py-2.5 text-xs text-rose-200"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="text-rose-300 underline hover:text-white"
            >
              Ocultar
            </button>
          </div>
        ) : null}

        {inLobby ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div>
                <span className="block font-mono text-[10px] tracking-widest text-zinc-400 uppercase">
                  Nombre de la sala
                </span>
                <span className="text-xl font-bold tracking-wide text-[#e4d3ba]">
                  {room.code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyCode(room.code)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-[#b58863] hover:text-white"
              >
                {copied ? '¡Copiado!' : 'Copiar nombre'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
                    Anfitrión {myRole === 'host' ? '(Tú)' : ''}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      room.host.connected
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {room.host.connected ? 'Conectado' : 'Reconectando...'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-white">
                  {room.host.nickname}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
                    Amigo {myRole === 'guest' ? '(Tú)' : ''}
                  </span>
                  {room.guest ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        room.guest.isReady
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {room.guest.isReady ? 'Listo ✓' : 'Esperando Listo'}
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                      Vacío
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-semibold text-white">
                  {room.guest ? room.guest.nickname : 'Esperando a tu amigo...'}
                </p>
              </div>
            </div>

            {myRole === 'host' ? (
              <div className="space-y-3 rounded-xl border border-zinc-800/70 bg-zinc-900/35 p-3.5">
                <div>
                  <span className="mb-2 block font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
                    Tu color (Anfitrión)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'w', label: 'Blancas' },
                        { id: 'b', label: 'Negras' },
                        { id: 'random', label: 'Aleatorio' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          void onUpdateConfig(opt.id, room.timeControl)
                        }
                        className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                          room.hostColorPreference === opt.id
                            ? selectedCardClass
                            : inactiveCardClass
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-2 block font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
                    Control de tiempo
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          void onUpdateConfig(
                            room.hostColorPreference,
                            preset.config,
                          )
                        }
                        className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                          activeTimeId === preset.id
                            ? selectedCardClass
                            : inactiveCardClass
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 px-4 py-3 text-xs text-zinc-300">
                Configuración de partida:{' '}
                <span className="font-semibold text-white">
                  {TIME_PRESETS.find((p) => p.id === activeTimeId)?.label}
                </span>{' '}
                · Anfitrión eligió:{' '}
                <span className="font-semibold text-[#e4d3ba]">
                  {room.hostColorPreference === 'w'
                    ? 'Blancas'
                    : room.hostColorPreference === 'b'
                      ? 'Negras'
                      : 'Aleatorio'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-zinc-800/60 pt-3.5">
              <button
                type="button"
                onClick={() => void onLeaveRoom()}
                className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-950/45 sm:text-sm"
              >
                Salir de la sala
              </button>

              {myRole === 'guest' ? (
                <button
                  type="button"
                  onClick={() => void onToggleReady()}
                  className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                    room.guest?.isReady
                      ? 'border border-emerald-500/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      : 'bg-[#b58863] text-[#1e130b] hover:bg-[#c99a6b]'
                  }`}
                >
                  {room.guest?.isReady ? 'Listo ✓ (Cancelar)' : 'Estoy Listo'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canHostStart}
                  onClick={() => void onStartMatch()}
                  className="rounded-xl bg-[#b58863] px-5 py-2.5 text-sm font-semibold text-[#1e130b] transition hover:bg-[#c99a6b] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {!room.guest
                    ? 'Esperando amigo...'
                    : !room.guest.isReady
                      ? 'Esperando Listo...'
                      : 'Iniciar partida →'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
              <button
                type="button"
                onClick={() => {
                  onClearError();
                  setTab('create');
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition sm:text-sm ${
                  tab === 'create'
                    ? 'bg-[#b58863] text-[#1e130b]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Crear sala
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearError();
                  setTab('join');
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition sm:text-sm ${
                  tab === 'join'
                    ? 'bg-[#b58863] text-[#1e130b]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Unirse a sala
              </button>
            </div>

            {tab === 'create' ? (
              <form onSubmit={handleCreateSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-zinc-300">
                    <span>Nombre de la sala (opcional)</span>
                    <input
                      type="text"
                      maxLength={32}
                      placeholder="Ej. Mesa de Juan"
                      value={createCode}
                      onChange={(e) => setCreateCode(e.target.value)}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#b58863] focus:outline-none"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-300">
                    <span>Contraseña *</span>
                    <input
                      type="password"
                      required
                      placeholder="Contraseña de la sala"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#b58863] focus:outline-none"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1 text-xs text-zinc-300">
                  <span>Tu apodo (opcional)</span>
                  <input
                    type="text"
                    maxLength={24}
                    placeholder="Anfitrión"
                    value={createNickname}
                    onChange={(e) => setCreateNickname(e.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#b58863] focus:outline-none"
                  />
                </label>

                <div>
                  <span className="mb-1.5 block font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
                    Tu color
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'w', label: 'Blancas' },
                        { id: 'b', label: 'Negras' },
                        { id: 'random', label: 'Aleatorio' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setHostColorPref(opt.id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          hostColorPref === opt.id
                            ? selectedCardClass
                            : inactiveCardClass
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
                    Control de tiempo
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {TIME_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setTimePreset(preset.id)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          timePreset === preset.id
                            ? selectedCardClass
                            : inactiveCardClass
                        }`}
                      >
                        <span className="block text-xs font-semibold">
                          {preset.label}
                        </span>
                        <span className="block text-[10px] text-zinc-400">
                          {preset.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 border-t border-zinc-800/60 pt-3.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isBusy || !createPassword.trim()}
                    className="rounded-xl bg-[#b58863] px-5 py-2 text-sm font-semibold text-[#1e130b] transition hover:bg-[#c99a6b] disabled:opacity-50"
                  >
                    {isBusy ? 'Creando...' : 'Crear sala →'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleJoinSubmit} className="space-y-3.5">
                <label className="flex flex-col gap-1 text-xs text-zinc-300">
                  <span>Nombre de la sala *</span>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="Ej. Mesa de Juan"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#b58863] focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-zinc-300">
                  <span>Contraseña *</span>
                  <input
                    type="password"
                    required
                    placeholder="Contraseña de la sala"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#b58863] focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-zinc-300">
                  <span>Tu apodo (opcional)</span>
                  <input
                    type="text"
                    maxLength={24}
                    placeholder="Invitado"
                    value={joinNickname}
                    onChange={(e) => setJoinNickname(e.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#b58863] focus:outline-none"
                  />
                </label>

                <div className="flex justify-end gap-2.5 border-t border-zinc-800/60 pt-3.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isBusy || !joinCode.trim() || !joinPassword.trim()}
                    className="rounded-xl bg-[#b58863] px-5 py-2 text-sm font-semibold text-[#1e130b] transition hover:bg-[#c99a6b] disabled:opacity-50"
                  >
                    {isBusy ? 'Entrando...' : 'Entrar a sala →'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
