import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BOARD_THEMES,
  type MatchEndReason,
  type PieceColor,
} from '@chess-platform/shared-domain';
import { MobileBoard3DView } from '../features/chess-board/MobileBoard3DView';
import { MobileBoardView } from '../features/chess-board/MobileBoardView';
import { RoomCodeModal } from '../features/lobby/RoomCodeModal';
import { PlayerBarView } from '../features/player-hud/PlayerBarView';
import { useMatchController } from '../hooks/useMatchController';

function getGameOverCopy(
  reason: MatchEndReason,
  winner: PieceColor | null,
): { title: string; subtitle: string } {
  const winnerText =
    winner === 'w' ? 'Blancas' : winner === 'b' ? 'Negras' : null;
  switch (reason) {
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
        subtitle: 'El rey no tiene jugadas legales.',
      };
    case 'threefold_repetition':
      return {
        title: 'Tablas por triple repetición',
        subtitle: 'Posición repetida tres veces.',
      };
    case 'insufficient_material':
      return {
        title: 'Material insuficiente',
        subtitle: 'Ningún bando puede dar mate.',
      };
    case 'fifty_move_rule':
      return {
        title: 'Tablas (50 jugadas)',
        subtitle: '50 jugadas sin capturas ni peones.',
      };
  }
}

export function MatchScreen() {
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');
  const ctrl = useMatchController();

  const gameOverCopy =
    ctrl.snapshot.status === 'ended' && ctrl.snapshot.endReason
      ? getGameOverCopy(ctrl.snapshot.endReason, ctrl.snapshot.winner)
      : null;

  const whiteLabel =
    ctrl.isOnlineMatchActive && ctrl.room
      ? ctrl.room.host.color === 'w'
        ? `${ctrl.room.host.nickname}${ctrl.myRole === 'host' ? ' (Tú)' : ''}`
        : `${ctrl.room.guest?.nickname ?? 'Amigo'}${ctrl.myRole === 'guest' ? ' (Tú)' : ''}`
      : 'Blancas';

  const blackLabel =
    ctrl.isOnlineMatchActive && ctrl.room
      ? ctrl.room.host.color === 'b'
        ? `${ctrl.room.host.nickname}${ctrl.myRole === 'host' ? ' (Tú)' : ''}`
        : `${ctrl.room.guest?.nickname ?? 'Amigo'}${ctrl.myRole === 'guest' ? ' (Tú)' : ''}`
      : 'Negras';

  const topIsWhite = ctrl.orientation === 'black';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>GAMBIT</Text>
            <Text style={styles.subtitle}>
              {ctrl.isOnlineMatchActive && ctrl.room
                ? `Online · ${ctrl.room.code}`
                : '2 Jugadores Local'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {ctrl.isOnlineMatchActive ? (
              <Pressable
                onPress={() => void ctrl.leaveRoom()}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Salir</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => setIsRoomModalOpen(true)}
                  style={styles.goldBtn}
                >
                  <Text style={styles.goldBtnText}>Jugar Online</Text>
                </Pressable>
                <Pressable
                  onPress={ctrl.flipLocalBoard}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>Rotar</Text>
                </Pressable>
                <Pressable
                  onPress={ctrl.restartLocal}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>Reiniciar</Text>
                </Pressable>
              </>
            )}

            <Pressable
              disabled={ctrl.snapshot.status === 'ended'}
              onPress={() => void ctrl.resign()}
              style={[
                styles.dangerBtn,
                ctrl.snapshot.status === 'ended' && styles.btnDisabled,
              ]}
            >
              <Text style={styles.dangerBtnText}>Rendirse</Text>
            </Pressable>
          </View>
        </View>

        <PlayerBarView
          label={topIsWhite ? whiteLabel : blackLabel}
          timeMs={
            topIsWhite ? ctrl.snapshot.whiteTimeMs : ctrl.snapshot.blackTimeMs
          }
          isWhite={topIsWhite}
          isActive={
            ctrl.snapshot.status === 'playing' &&
            ctrl.snapshot.turn === (topIsWhite ? 'w' : 'b')
          }
        />

        {viewMode === '3d' ? (
          <MobileBoard3DView
            fen={ctrl.snapshot.fen}
            theme={ctrl.theme}
            orientation={ctrl.orientation}
            legalMoves={ctrl.legalMovesForSelected}
            lastMove={ctrl.snapshot.lastMove}
            kingInCheckSquare={ctrl.snapshot.kingInCheckSquare}
            selectedSquare={ctrl.selectedSquare}
            pendingPromotion={ctrl.pendingPromotion}
            gameOverCopy={gameOverCopy}
            isOnlineMatch={ctrl.isOnlineMatchActive}
            onSquarePress={ctrl.handleSquareSelect}
            onSelectPromotion={ctrl.selectPromotion}
            onCancelPromotion={ctrl.cancelPromotion}
            onReturnToLobby={() => void ctrl.returnToLobby()}
            onRestartLocal={ctrl.restartLocal}
          />
        ) : (
          <MobileBoardView
            fen={ctrl.snapshot.fen}
            theme={ctrl.theme}
            orientation={ctrl.orientation}
            legalMoves={ctrl.legalMovesForSelected}
            lastMove={ctrl.snapshot.lastMove}
            kingInCheckSquare={ctrl.snapshot.kingInCheckSquare}
            selectedSquare={ctrl.selectedSquare}
            pendingPromotion={ctrl.pendingPromotion}
            gameOverCopy={gameOverCopy}
            isOnlineMatch={ctrl.isOnlineMatchActive}
            onSquarePress={ctrl.handleSquareSelect}
            onSelectPromotion={ctrl.selectPromotion}
            onCancelPromotion={ctrl.cancelPromotion}
            onReturnToLobby={() => void ctrl.returnToLobby()}
            onRestartLocal={ctrl.restartLocal}
          />
        )}

        <PlayerBarView
          label={topIsWhite ? blackLabel : whiteLabel}
          timeMs={
            topIsWhite ? ctrl.snapshot.blackTimeMs : ctrl.snapshot.whiteTimeMs
          }
          isWhite={!topIsWhite}
          isActive={
            ctrl.snapshot.status === 'playing' &&
            ctrl.snapshot.turn === (topIsWhite ? 'b' : 'w')
          }
        />

        <View style={styles.themeRow}>
          <Pressable
            onPress={() => setViewMode('2d')}
            style={[styles.themeChip, viewMode === '2d' && styles.themeChipActive]}
          >
            <Text
              style={[
                styles.themeChipText,
                viewMode === '2d' && styles.themeChipTextActive,
              ]}
            >
              Vista 2D
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('3d')}
            style={[styles.themeChip, viewMode === '3d' && styles.themeChipActive]}
          >
            <Text
              style={[
                styles.themeChipText,
                viewMode === '3d' && styles.themeChipTextActive,
              ]}
            >
              Vista 3D
            </Text>
          </Pressable>
        </View>

        <View style={styles.themeRow}>
          {Object.values(BOARD_THEMES).map((t) => {
            const active = t.id === ctrl.themeId;
            return (
              <Pressable
                key={t.id}
                onPress={() => ctrl.setThemeId(t.id)}
                style={[styles.themeChip, active && styles.themeChipActive]}
              >
                <Text
                  style={[
                    styles.themeChipText,
                    active && styles.themeChipTextActive,
                  ]}
                >
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <RoomCodeModal
        visible={isRoomModalOpen || ctrl.room?.phase === 'lobby'}
        room={ctrl.room}
        myRole={ctrl.myRole}
        isBusy={ctrl.isBusy}
        error={ctrl.error}
        serverUrl={ctrl.serverUrl}
        onChangeServerUrl={ctrl.setServerUrl}
        onClearError={ctrl.clearError}
        onClose={() => setIsRoomModalOpen(false)}
        onCreateRoom={ctrl.createRoom}
        onJoinRoom={ctrl.joinRoom}
        onToggleReady={ctrl.toggleReady}
        onUpdateConfig={ctrl.updateConfig}
        onStartMatch={ctrl.startMatch}
        onLeaveRoom={async () => {
          await ctrl.leaveRoom();
          setIsRoomModalOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  container: {
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 4,
  },
  brand: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
  },
  subtitle: {
    color: '#c5a880',
    fontSize: 12,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goldBtn: {
    backgroundColor: 'rgba(197, 168, 128, 0.16)',
    borderWidth: 1,
    borderColor: '#c5a880',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  goldBtnText: {
    color: '#e4d3ba',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#18181c',
    borderWidth: 1,
    borderColor: '#232328',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  secondaryBtnText: {
    color: '#e5e5e5',
    fontSize: 12,
    fontWeight: '600',
  },
  dangerBtn: {
    backgroundColor: 'rgba(127, 29, 29, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dangerBtnText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  themeChip: {
    flex: 1,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#232328',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  themeChipActive: {
    borderColor: '#c5a880',
    backgroundColor: '#18181c',
  },
  themeChipText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  themeChipTextActive: {
    color: '#e4d3ba',
  },
});
