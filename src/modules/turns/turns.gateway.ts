import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * Real-time gateway for queue updates.
 *
 * Clients join a room per service type ("queue:<serviceTypeId>") so a
 * recalculation only reaches the people actually waiting in that queue,
 * instead of broadcasting every update to every connected client.
 *
 * TODO: once the event bus (Kafka) is provisioned, this gateway should
 * subscribe to a 'turn.recalculated' topic instead of being called
 * directly from TurnsService. See README.md, "Bus de eventos".
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class TurnsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TurnsGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinQueue')
  handleJoinQueue(client: Socket, serviceTypeId: string): void {
    client.join(this.queueRoom(serviceTypeId));
  }

  broadcastQueueUpdate(serviceTypeId: string, payload: unknown): void {
    this.server.to(this.queueRoom(serviceTypeId)).emit('queueUpdate', payload);
  }

  private queueRoom(serviceTypeId: string): string {
    return `queue:${serviceTypeId}`;
  }
}
