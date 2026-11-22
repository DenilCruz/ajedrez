import type { BoardThemeId } from '@chess-platform/shared-domain';

/**
 * Contrato de almacenamiento local para preferencias del usuario.
 */
export interface StoragePort {
  saveTheme(theme: BoardThemeId): void;
  getTheme(): BoardThemeId;
}
