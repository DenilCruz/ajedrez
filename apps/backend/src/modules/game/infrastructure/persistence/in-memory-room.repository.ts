import { RoomRepositoryPort } from '../../domain/repositories/room.repository.port.js';

/**
 * Implementación en memoria de RoomRepositoryPort (reemplazable por Redis).
 * TODO: Implementar gestión de salas activas.
 */
export class InMemoryRoomRepository implements RoomRepositoryPort {}
