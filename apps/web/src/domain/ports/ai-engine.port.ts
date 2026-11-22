import type { AiDifficultyLevel, Move } from '@chess-platform/shared-domain';

/**
 * Contrato de motor de IA: calcula la mejor jugada para un FEN y dificultad dados.
 */
export interface AiEnginePort {
  getBestMove(fen: string, difficulty: AiDifficultyLevel, signal?: AbortSignal): Promise<Move>;
  dispose(): void;
}
