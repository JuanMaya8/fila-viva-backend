/**
 * Internal domain events, published with EventEmitter2.
 *
 * Every event carries the institution whose queues must be recalculated.
 * The QueueOrchestrator listens to 'queue.**' and coalesces bursts into a
 * single batch call to fila-viva-ai.
 *
 * Kafka integration point: each constant below maps 1:1 to a topic
 * (e.g. 'queue.turn.created' -> topic 'fila-viva.turn.created'). To move
 * to Kafka, replace EventEmitter2.emit/emitAsync in the publishers with a
 * Kafka producer and register QueueOrchestrator as a consumer of those
 * topics; payloads are already plain JSON.
 */
export const QueueEvents = {
  TURN_CREATED: 'queue.turn.created',
  TURN_CANCELLED: 'queue.turn.cancelled',
  TURN_CALLED: 'queue.turn.called',
  TURN_STARTED: 'queue.turn.started',
  TURN_ABSENT: 'queue.turn.absent',
  TURN_COMPLETED: 'queue.turn.completed',
  PROGRESS_UPDATED: 'queue.progress.updated',
  AGENT_STATUS_CHANGED: 'queue.agent.status.changed',
  CONFIG_CHANGED: 'queue.config.changed',
  REFRESH: 'queue.refresh',
} as const;

export type QueueEventName = (typeof QueueEvents)[keyof typeof QueueEvents];

export interface QueueEventPayload {
  institutionId: string;
  turnId?: string;
  agentId?: string;
}

/** Emitted by the realtime gateway when an advisor has no sockets left. */
export const ADVISOR_DISCONNECTED = 'realtime.advisor.disconnected';

/** Emitted by AuthController when an advisor logs out. */
export const ADVISOR_LOGGED_OUT = 'auth.advisor.logged_out';

export interface AdvisorPresencePayload {
  agentId: string;
}
