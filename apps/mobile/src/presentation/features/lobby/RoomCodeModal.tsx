import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  RoomColorPreference,
  RoomRole,
  RoomStatePayload,
  TimeControlConfig,
} from '@chess-platform/shared-domain';

export interface RoomCodeModalProps {
  visible: boolean;
  room: RoomStatePayload | null;
  myRole: RoomRole | null;
  isBusy: boolean;
  error: string | null;
  serverUrl: string;
  onChangeServerUrl: (url: string) => void;
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

const TIME_PRESETS: ReadonlyArray<{
  id: 'none' | 'blitz' | 'rapid';
  label: string;
  config: TimeControlConfig | null;
}> = [
  { id: 'none', label: 'Sin reloj', config: null },
  {
    id: 'blitz',
    label: '3+2 Blitz',
    config: { initialMs: 180_000, incrementMs: 2_000 },
  },
  {
    id: 'rapid',
    label: '10+0 Rápida',
    config: { initialMs: 600_000, incrementMs: 0 },
  },
];

export function RoomCodeModal({
  visible,
  room,
  myRole,
  isBusy,
  error,
  serverUrl,
  onChangeServerUrl,
  onClearError,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onUpdateConfig,
  onStartMatch,
  onLeaveRoom,
}: RoomCodeModalProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [colorPref, setColorPref] = useState<RoomColorPreference>('w');
  const [timePreset, setTimePreset] = useState<'none' | 'blitz' | 'rapid'>(
    'rapid',
  );
  const [urlDraft, setUrlDraft] = useState(serverUrl);

  const inLobby = room !== null && room.phase === 'lobby';
  const canHostStart = Boolean(
    room &&
      myRole === 'host' &&
      room.guest &&
      room.guest.connected &&
      room.guest.isReady &&
      !isBusy,
  );

  const handleCreate = async () => {
    onChangeServerUrl(urlDraft);
    const chosenTime =
      TIME_PRESETS.find((t) => t.id === timePreset)?.config ?? null;
    await onCreateRoom({
      code: roomName.trim() || undefined,
      password,
      nickname: nickname.trim() || undefined,
      hostColorPreference: colorPref,
      timeControl: chosenTime,
    });
  };

  const handleJoin = async () => {
    onChangeServerUrl(urlDraft);
    await onJoinRoom({
      code: roomName.trim(),
      password,
      nickname: nickname.trim() || undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!inLobby) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>GAMBIT • MULTIJUGADOR</Text>
                <Text style={styles.title}>
                  {inLobby ? `Sala: ${room.code}` : 'Jugar con un amigo'}
                </Text>
              </View>
              {!inLobby ? (
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={onClearError}>
                  <Text style={styles.errorDismiss}>Ocultar</Text>
                </Pressable>
              </View>
            ) : null}

            {inLobby ? (
              <View style={styles.section}>
                <View style={styles.playerBox}>
                  <Text style={styles.label}>
                    Anfitrión {myRole === 'host' ? '(Tú)' : ''}
                  </Text>
                  <Text style={styles.playerName}>{room.host.nickname}</Text>
                </View>

                <View style={styles.playerBox}>
                  <Text style={styles.label}>
                    Amigo {myRole === 'guest' ? '(Tú)' : ''}
                  </Text>
                  <Text style={styles.playerName}>
                    {room.guest
                      ? `${room.guest.nickname} · ${
                          room.guest.isReady ? 'Listo ✓' : 'Esperando Listo'
                        }`
                      : 'Esperando a tu amigo...'}
                  </Text>
                </View>

                {myRole === 'host' ? (
                  <View style={styles.section}>
                    <Text style={styles.label}>Tu color</Text>
                    <View style={styles.rowGap}>
                      {(
                        [
                          { id: 'w', label: 'Blancas' },
                          { id: 'b', label: 'Negras' },
                          { id: 'random', label: 'Aleatorio' },
                        ] as const
                      ).map((opt) => (
                        <Pressable
                          key={opt.id}
                          onPress={() =>
                            void onUpdateConfig(opt.id, room.timeControl)
                          }
                          style={[
                            styles.chip,
                            room.hostColorPreference === opt.id &&
                              styles.chipActive,
                          ]}
                        >
                          <Text style={styles.chipText}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.footerRow}>
                  <Pressable
                    onPress={() => void onLeaveRoom()}
                    style={styles.dangerBtn}
                  >
                    <Text style={styles.dangerBtnText}>Salir</Text>
                  </Pressable>

                  {myRole === 'guest' ? (
                    <Pressable
                      onPress={() => void onToggleReady()}
                      style={styles.primaryBtn}
                    >
                      <Text style={styles.primaryBtnText}>
                        {room.guest?.isReady ? 'Listo ✓' : 'Estoy Listo'}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      disabled={!canHostStart}
                      onPress={() => void onStartMatch()}
                      style={[
                        styles.primaryBtn,
                        !canHostStart && styles.btnDisabled,
                      ]}
                    >
                      <Text style={styles.primaryBtnText}>
                        {!room.guest
                          ? 'Esperando...'
                          : !room.guest.isReady
                            ? 'Falta Listo'
                            : 'Iniciar partida'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.tabRow}>
                  <Pressable
                    onPress={() => {
                      onClearError();
                      setTab('create');
                    }}
                    style={[styles.tabBtn, tab === 'create' && styles.tabActive]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === 'create' && styles.tabTextActive,
                      ]}
                    >
                      Crear sala
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      onClearError();
                      setTab('join');
                    }}
                    style={[styles.tabBtn, tab === 'join' && styles.tabActive]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === 'join' && styles.tabTextActive,
                      ]}
                    >
                      Unirse a sala
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>
                  Nombre de la sala {tab === 'create' ? '(opcional)' : '*'}
                </Text>
                <TextInput
                  value={roomName}
                  onChangeText={setRoomName}
                  maxLength={32}
                  placeholder="Ej. Mesa de Juan"
                  placeholderTextColor="#52525b"
                  style={styles.input}
                />

                <Text style={styles.label}>Contraseña *</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Contraseña de la sala"
                  placeholderTextColor="#52525b"
                  style={styles.input}
                />

                <Text style={styles.label}>Tu apodo (opcional)</Text>
                <TextInput
                  value={nickname}
                  onChangeText={setNickname}
                  maxLength={24}
                  placeholder={tab === 'create' ? 'Anfitrión' : 'Invitado'}
                  placeholderTextColor="#52525b"
                  style={styles.input}
                />

                {tab === 'create' ? (
                  <>
                    <Text style={styles.label}>Tu color</Text>
                    <View style={styles.rowGap}>
                      {(
                        [
                          { id: 'w', label: 'Blancas' },
                          { id: 'b', label: 'Negras' },
                          { id: 'random', label: 'Aleatorio' },
                        ] as const
                      ).map((opt) => (
                        <Pressable
                          key={opt.id}
                          onPress={() => setColorPref(opt.id)}
                          style={[
                            styles.chip,
                            colorPref === opt.id && styles.chipActive,
                          ]}
                        >
                          <Text style={styles.chipText}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.label}>Control de tiempo</Text>
                    <View style={styles.rowGap}>
                      {TIME_PRESETS.map((preset) => (
                        <Pressable
                          key={preset.id}
                          onPress={() => setTimePreset(preset.id)}
                          style={[
                            styles.chip,
                            timePreset === preset.id && styles.chipActive,
                          ]}
                        >
                          <Text style={styles.chipText}>{preset.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={styles.label}>Servidor Socket.io</Text>
                <TextInput
                  value={urlDraft}
                  onChangeText={setUrlDraft}
                  autoCapitalize="none"
                  placeholder="http://192.168.1.X:3000"
                  placeholderTextColor="#52525b"
                  style={styles.input}
                />

                <Pressable
                  disabled={
                    isBusy ||
                    !password.trim() ||
                    (tab === 'join' && !roomName.trim())
                  }
                  onPress={() =>
                    void (tab === 'create' ? handleCreate() : handleJoin())
                  }
                  style={[
                    styles.primaryBtn,
                    (isBusy ||
                      !password.trim() ||
                      (tab === 'join' && !roomName.trim())) &&
                      styles.btnDisabled,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {isBusy
                      ? 'Conectando...'
                      : tab === 'create'
                        ? 'Crear sala'
                        : 'Entrar a sala'}
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    backgroundColor: '#121215',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232328',
    padding: 18,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  eyebrow: {
    color: '#a1a1aa',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '600',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#18181c',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  closeBtnText: {
    color: '#d4d4d8',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: 'rgba(127, 29, 29, 0.35)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 12,
    flex: 1,
  },
  errorDismiss: {
    color: '#fca5a5',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  section: {
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0c',
    borderRadius: 10,
    padding: 4,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#b58863',
  },
  tabText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#1e130b',
  },
  label: {
    color: '#d4d4d8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0a0a0c',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    backgroundColor: '#18181c',
    borderWidth: 1,
    borderColor: '#232328',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: '#c5a880',
    backgroundColor: 'rgba(197, 168, 128, 0.16)',
  },
  chipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  playerBox: {
    backgroundColor: '#18181c',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#232328',
    padding: 12,
  },
  playerName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#b58863',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#1e130b',
    fontSize: 14,
    fontWeight: '700',
  },
  dangerBtn: {
    backgroundColor: 'rgba(127, 29, 29, 0.25)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
  },
  dangerBtnText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.45,
  },
});
