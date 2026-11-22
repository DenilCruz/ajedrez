import { WebSocketGateway } from '@nestjs/websockets';

/**
 * WebSockets (@WebSocketGateway) ultra delgado.
 * TODO: Conectar eventos de Socket.io con los UseCases de game.
 */
@WebSocketGateway()
export class GameGateway {}
