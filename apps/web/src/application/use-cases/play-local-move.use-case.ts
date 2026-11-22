import { MatchEndedEvent } from '@chess-platform/shared-domain';
import type {
  AiDifficultyLevel,
  Match,
  MatchSnapshot,
  Move,
  MoveMadeEvent,
} from '@chess-platform/shared-domain';
import type { AiEnginePort } from '../../domain/ports/ai-engine.port';

export interface LocalMoveResult {
  snapshot: MatchSnapshot;
  moveEvent: MoveMadeEvent;
  endEvent: MatchEndedEvent | null;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}

/**
 * Caso de uso local: aplica jugadas síncronas del jugador y dispara el cálculo
 * asíncrono cancelable del turno de la IA.
 */
export class PlayLocalMoveUseCase {
  private readonly aiEngine: AiEnginePort;

  constructor(aiEngine: AiEnginePort) {
    this.aiEngine = aiEngine;
  }

  public executePlayerMove(match: Match, move: Move): LocalMoveResult {
    const moveEvent = match.playMove(move);
    const events = match.pullDomainEvents();

    let endEvent: MatchEndedEvent | null = null;
    for (const event of events) {
      if (event instanceof MatchEndedEvent) {
        endEvent = event;
      }
    }

    return {
      snapshot: match.getSnapshot(),
      moveEvent,
      endEvent,
    };
  }

  public async executeAiTurn(
    match: Match,
    difficulty: AiDifficultyLevel,
    signal?: AbortSignal,
  ): Promise<LocalMoveResult | null> {
    if (signal?.aborted || match.getStatus() === 'ended') {
      return null;
    }

    const fenBefore = match.getFen();
    let aiMove: Move;
    try {
      aiMove = await this.aiEngine.getBestMove(fenBefore, difficulty, signal);
    } catch (error: unknown) {
      if (isAbortError(error) || signal?.aborted) {
        return null;
      }
      throw error;
    }

    if (signal?.aborted || match.getStatus() === 'ended' || match.getFen() !== fenBefore) {
      return null;
    }

    return this.executePlayerMove(match, aiMove);
  }
}
