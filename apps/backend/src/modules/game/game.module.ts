import { Module } from '@nestjs/common';
import { ROOM_REPOSITORY } from './domain/repositories/room.repository.port.js';
import { GameGateway } from './infrastructure/gateways/game.gateway.js';
import { InMemoryRoomRepository } from './infrastructure/persistence/in-memory-room.repository.js';

@Module({
  providers: [
    {
      provide: ROOM_REPOSITORY,
      useClass: InMemoryRoomRepository,
    },
    GameGateway,
  ],
  exports: [ROOM_REPOSITORY],
})
export class GameModule {}
