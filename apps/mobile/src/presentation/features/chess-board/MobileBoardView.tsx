import { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type {
  BoardThemeConfig,
  LegalMoveOption,
  PieceColor,
  PromotionPiece,
} from '@chess-platform/shared-domain';
import type { PendingPromotion } from '../../hooks/useMatchController';

export interface MobileBoardViewProps {
  fen: string;
  theme: BoardThemeConfig;
  orientation: 'white' | 'black';
  legalMoves: LegalMoveOption[];
  lastMove: { from: string; to: string } | null;
  kingInCheckSquare: string | null;
  selectedSquare: string | null;
  pendingPromotion: PendingPromotion | null;
  gameOverCopy: { title: string; subtitle: string } | null;
  isOnlineMatch: boolean;
  onSquarePress: (square: string) => void;
  onSelectPromotion: (piece: PromotionPiece) => void;
  onCancelPromotion: () => void;
  onReturnToLobby: () => void;
  onRestartLocal: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

const PIECE_GLYPHS: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

function parseFenBoard(fen: string): Record<string, { color: PieceColor; glyph: string }> {
  const boardPart = fen.split(' ')[0] ?? '';
  const ranks = boardPart.split('/');
  const map: Record<string, { color: PieceColor; glyph: string }> = {};

  for (let r = 0; r < 8; r += 1) {
    const rankStr = ranks[r] ?? '';
    let fileIdx = 0;
    for (const ch of rankStr) {
      const emptyCount = Number(ch);
      if (Number.isInteger(emptyCount) && emptyCount >= 1 && emptyCount <= 8) {
        fileIdx += emptyCount;
      } else {
        const square = `${FILES[fileIdx]}${8 - r}`;
        const isWhite = ch === ch.toUpperCase();
        map[square] = {
          color: isWhite ? 'w' : 'b',
          glyph: PIECE_GLYPHS[ch] ?? '',
        };
        fileIdx += 1;
      }
    }
  }
  return map;
}

export function MobileBoardView({
  fen,
  theme,
  orientation,
  legalMoves,
  lastMove,
  kingInCheckSquare,
  selectedSquare,
  pendingPromotion,
  gameOverCopy,
  isOnlineMatch,
  onSquarePress,
  onSelectPromotion,
  onCancelPromotion,
  onReturnToLobby,
  onRestartLocal,
}: MobileBoardViewProps) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 24, 420);
  const squareSize = Math.floor((boardSize - 12) / 8);

  const pieceMap = useMemo(() => parseFenBoard(fen), [fen]);

  const legalTargets = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of legalMoves) {
      const isCapture = m.san.includes('x') || Boolean(pieceMap[m.to]);
      map.set(m.to, (map.get(m.to) ?? false) || isCapture);
    }
    return map;
  }, [legalMoves, pieceMap]);

  const rankIndices =
    orientation === 'white'
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];
  const fileIndices =
    orientation === 'white'
      ? [0, 1, 2, 3, 4, 5, 6, 7]
      : [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <View
      style={[
        styles.frame,
        { width: squareSize * 8 + 12, height: squareSize * 8 + 12 },
      ]}
    >
      <View style={styles.grid}>
        {rankIndices.map((rankIdx) => (
          <View key={rankIdx} style={styles.row}>
            {fileIndices.map((fileIdx) => {
              const square = `${FILES[fileIdx]}${rankIdx + 1}`;
              const isLight = (fileIdx + rankIdx) % 2 === 1;
              const isSelected = selectedSquare === square;
              const isLast =
                lastMove?.from === square || lastMove?.to === square;
              const isCheck = kingInCheckSquare === square;
              const piece = pieceMap[square];
              const isLegalTarget = legalTargets.has(square);
              const isCaptureTarget = legalTargets.get(square) === true;

              let bgColor = isLight ? theme.lightSquare : theme.darkSquare;
              if (isCheck) {
                bgColor = '#dc2626';
              } else if (isSelected) {
                bgColor = '#d4a359';
              } else if (isLast) {
                bgColor = isLight ? '#d8cf7a' : '#9ca84c';
              }

              return (
                <Pressable
                  key={square}
                  onPress={() => onSquarePress(square)}
                  style={[
                    styles.square,
                    {
                      width: squareSize,
                      height: squareSize,
                      backgroundColor: bgColor,
                    },
                  ]}
                >
                  {piece ? (
                    <Text
                      style={[
                        styles.pieceText,
                        {
                          fontSize: Math.round(squareSize * 0.68),
                          color: piece.color === 'w' ? '#ffffff' : '#111111',
                          textShadowColor:
                            piece.color === 'w'
                              ? 'rgba(0,0,0,0.65)'
                              : 'rgba(255,255,255,0.22)',
                          textShadowRadius: 2,
                        },
                      ]}
                    >
                      {piece.glyph}
                    </Text>
                  ) : null}

                  {isLegalTarget ? (
                    isCaptureTarget ? (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.captureRing,
                          {
                            width: squareSize * 0.8,
                            height: squareSize * 0.8,
                            borderRadius: squareSize * 0.4,
                          },
                        ]}
                      />
                    ) : (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.moveDot,
                          {
                            width: squareSize * 0.28,
                            height: squareSize * 0.28,
                            borderRadius: squareSize * 0.14,
                          },
                        ]}
                      />
                    )
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {pendingPromotion ? (
        <View style={styles.overlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Elige pieza de promoción</Text>
            <View style={styles.promoRow}>
              {(
                [
                  { piece: 'q', label: 'Dama' },
                  { piece: 'r', label: 'Torre' },
                  { piece: 'b', label: 'Alfil' },
                  { piece: 'n', label: 'Caballo' },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.piece}
                  onPress={() => onSelectPromotion(opt.piece)}
                  style={styles.promoBtn}
                >
                  <Text style={styles.promoBtnText}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={onCancelPromotion} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {gameOverCopy ? (
        <View style={styles.overlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>{gameOverCopy.title}</Text>
            <Text style={styles.dialogSub}>{gameOverCopy.subtitle}</Text>
            <Pressable
              onPress={isOnlineMatch ? onReturnToLobby : onRestartLocal}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>
                {isOnlineMatch ? 'Volver a la sala' : 'Reiniciar'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#543b23',
    borderRadius: 12,
    padding: 6,
    borderWidth: 1,
    borderColor: '#754d2a',
    position: 'relative',
    alignSelf: 'center',
  },
  grid: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pieceText: {
    fontWeight: '600',
    lineHeight: undefined,
  },
  moveDot: {
    position: 'absolute',
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
  },
  captureRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: 'rgba(16, 185, 129, 0.8)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(10, 10, 12, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 16,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: '#121215',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(197, 168, 128, 0.5)',
    padding: 16,
    alignItems: 'center',
  },
  dialogTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  dialogSub: {
    color: '#e4d3ba',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  promoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  promoBtn: {
    backgroundColor: '#18181c',
    borderColor: '#232328',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promoBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelBtnText: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#c5a880',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: '#0a0a0c',
    fontSize: 14,
    fontWeight: '700',
  },
});
