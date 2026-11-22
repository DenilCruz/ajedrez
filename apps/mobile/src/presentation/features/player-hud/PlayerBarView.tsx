import { StyleSheet, Text, View } from 'react-native';

export interface PlayerBarViewProps {
  label: string;
  timeMs: number | null;
  isWhite: boolean;
  isActive: boolean;
}

function formatTime(ms: number | null): string {
  if (ms === null) return 'Sin reloj';
  const safe = Math.max(0, ms);
  if (safe === 0) return '00:00.0';
  if (safe < 10_000) {
    const tenths = Math.min(99, Math.ceil(safe / 100));
    return `00:${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
  }
  const totalSec = Math.ceil(safe / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PlayerBarView({
  label,
  timeMs,
  isWhite,
  isActive,
}: PlayerBarViewProps) {
  return (
    <View style={[styles.card, isActive && styles.cardActive]}>
      <View style={styles.left}>
        <View
          style={[
            styles.swatch,
            isWhite ? styles.swatchWhite : styles.swatchBlack,
          ]}
        />
        <Text style={styles.name} numberOfLines={1}>
          {label}
        </Text>
        {isActive ? (
          <View style={styles.turnPill}>
            <Text style={styles.turnText}>Turno</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.clockBox, isActive && styles.clockBoxActive]}>
        <Text style={[styles.clockText, isActive && styles.clockTextActive]}>
          {formatTime(timeMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: '#232328',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cardActive: {
    borderColor: '#c5a880',
    borderWidth: 1.5,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
  },
  swatchWhite: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ffffff',
  },
  swatchBlack: {
    backgroundColor: '#18181c',
    borderColor: '#52525b',
  },
  name: {
    color: '#e5e5e5',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  turnPill: {
    backgroundColor: 'rgba(197, 168, 128, 0.14)',
    borderColor: 'rgba(197, 168, 128, 0.35)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  turnText: {
    color: '#c5a880',
    fontSize: 11,
    fontWeight: '600',
  },
  clockBox: {
    backgroundColor: '#0a0a0c',
    borderWidth: 1,
    borderColor: '#232328',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clockBoxActive: {
    borderColor: 'rgba(197, 168, 128, 0.5)',
  },
  clockText: {
    color: '#a1a1aa',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  clockTextActive: {
    color: '#ffffff',
  },
});
