import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import { Server, Socket } from 'socket.io';
import {
  ADVISOR_DISCONNECTED,
  AdvisorPresencePayload,
} from '../../common/events/queue-events';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';

export const Rooms = {
  turn: (turnId: string) => `turn:${turnId}`,
  queue: (serviceTypeId: string) => `queue:${serviceTypeId}`,
  display: (institutionId: string) => `display:${institutionId}`,
  admin: (institutionId: string) => `admin:${institutionId}`,
  advisor: (agentId: string) => `advisor:${agentId}`,
};

export const ServerEvents = {
  TURN_UPDATE: 'turnUpdate',
  QUEUE_UPDATE: 'queueUpdate',
  DISPLAY_UPDATE: 'displayUpdate',
  DASHBOARD_UPDATE: 'dashboardUpdate',
  ADVISOR_UPDATE: 'advisorUpdate',
  AUTH_ERROR: 'authError',
};

type Ack = { ok: boolean; error?: string };

/**
 * Real-time gateway. Public sockets join rooms by unguessable ids (turn,
 * queue, display). Admin and advisor sockets authenticate in the handshake
 * with a short-lived socket token (POST /auth/socket-token) and are placed
 * in their private rooms automatically. CORS is restricted to FRONTEND_URL
 * by RealtimeIoAdapter (see main.ts).
 */
@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly advisorSockets = new Map<string, Set<string>>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly graceMs: number;

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService,
  ) {
    this.graceMs =
      configService.get<number>('queue.advisorDisconnectGraceSeconds')! * 1000;
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
      return;
    }
    try {
      const user = await this.authService.verify(token, 'socket');
      client.data.user = user;
      this.joinPrivateRooms(client, user);
    } catch {
      client.emit(ServerEvents.AUTH_ERROR, { message: 'Invalid session' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user: AuthUser | undefined = client.data.user;
    if (!user?.agentId) {
      return;
    }
    const sockets = this.advisorSockets.get(user.agentId);
    sockets?.delete(client.id);
    if (sockets && sockets.size === 0) {
      this.advisorSockets.delete(user.agentId);
      this.scheduleAdvisorOffline(user.agentId);
    }
  }

  onModuleDestroy(): void {
    this.disconnectTimers.forEach((timer) => clearTimeout(timer));
    this.disconnectTimers.clear();
  }

  @SubscribeMessage('joinTurn')
  joinTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() turnId: unknown,
  ): Ack {
    return this.joinById(client, turnId, Rooms.turn);
  }

  @SubscribeMessage('leaveTurn')
  leaveTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() turnId: unknown,
  ): Ack {
    return this.leaveById(client, turnId, Rooms.turn);
  }

  @SubscribeMessage('joinQueue')
  joinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() serviceTypeId: unknown,
  ): Ack {
    return this.joinById(client, serviceTypeId, Rooms.queue);
  }

  @SubscribeMessage('leaveQueue')
  leaveQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() serviceTypeId: unknown,
  ): Ack {
    return this.leaveById(client, serviceTypeId, Rooms.queue);
  }

  @SubscribeMessage('joinDisplay')
  joinDisplay(
    @ConnectedSocket() client: Socket,
    @MessageBody() institutionId: unknown,
  ): Ack {
    return this.joinById(client, institutionId, Rooms.display);
  }

  @SubscribeMessage('leaveDisplay')
  leaveDisplay(
    @ConnectedSocket() client: Socket,
    @MessageBody() institutionId: unknown,
  ): Ack {
    return this.leaveById(client, institutionId, Rooms.display);
  }

  /** True when the advisor has at least one live socket. */
  isAdvisorConnected(agentId: string): boolean {
    return (this.advisorSockets.get(agentId)?.size ?? 0) > 0;
  }

  hasMembers(room: string): boolean {
    return (this.server?.sockets.adapter.rooms.get(room)?.size ?? 0) > 0;
  }

  emitTo(room: string, event: string, payload: unknown): void {
    this.server?.to(room).emit(event, payload);
  }

  private joinPrivateRooms(client: Socket, user: AuthUser): void {
    if (user.role === UserRole.ADMIN) {
      client.join(Rooms.admin(user.institutionId));
      return;
    }
    if (user.agentId) {
      client.join(Rooms.advisor(user.agentId));
      const sockets = this.advisorSockets.get(user.agentId) ?? new Set();
      sockets.add(client.id);
      this.advisorSockets.set(user.agentId, sockets);
      const timer = this.disconnectTimers.get(user.agentId);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(user.agentId);
      }
    }
  }

  private scheduleAdvisorOffline(agentId: string): void {
    const existing = this.disconnectTimers.get(agentId);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(agentId);
      if (this.isAdvisorConnected(agentId)) {
        return;
      }
      this.logger.log(`Advisor ${agentId} disconnected`);
      this.eventEmitter.emit(ADVISOR_DISCONNECTED, {
        agentId,
      } satisfies AdvisorPresencePayload);
    }, this.graceMs);
    this.disconnectTimers.set(agentId, timer);
  }

  private joinById(
    client: Socket,
    id: unknown,
    room: (id: string) => string,
  ): Ack {
    if (typeof id !== 'string' || !isUUID(id)) {
      return { ok: false, error: 'Invalid id' };
    }
    client.join(room(id));
    return { ok: true };
  }

  private leaveById(
    client: Socket,
    id: unknown,
    room: (id: string) => string,
  ): Ack {
    if (typeof id !== 'string' || !isUUID(id)) {
      return { ok: false, error: 'Invalid id' };
    }
    client.leave(room(id));
    return { ok: true };
  }
}
