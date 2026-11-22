export type AiDifficultyLevel = 'easy' | 'medium' | 'hard';

export interface AiDifficultyConfig {
  level: AiDifficultyLevel;
  label: string;
  skillLevel: number;
  depth: number;
  movetimeMs: number;
}

export const AI_DIFFICULTIES: Record<AiDifficultyLevel, AiDifficultyConfig> = {
  easy: {
    level: 'easy',
    label: 'Fácil',
    skillLevel: 2,
    depth: 4,
    movetimeMs: 250,
  },
  medium: {
    level: 'medium',
    label: 'Medio',
    skillLevel: 10,
    depth: 10,
    movetimeMs: 650,
  },
  hard: {
    level: 'hard',
    label: 'Difícil',
    skillLevel: 20,
    depth: 16,
    movetimeMs: 1400,
  },
};

/**
 * Value Object: niveles de IA (Fácil, Medio, Difícil).
 */
export class AiDifficulty {
  public readonly config: AiDifficultyConfig;

  private constructor(config: AiDifficultyConfig) {
    this.config = config;
  }

  public static create(level: AiDifficultyLevel): AiDifficulty {
    if (!Object.prototype.hasOwnProperty.call(AI_DIFFICULTIES, level)) {
      throw new Error(`Invalid AI difficulty level: "${level}"`);
    }
    return new AiDifficulty(AI_DIFFICULTIES[level]);
  }

  public get level(): AiDifficultyLevel {
    return this.config.level;
  }

  public equals(other: AiDifficulty): boolean {
    return this.config.level === other.config.level;
  }
}
