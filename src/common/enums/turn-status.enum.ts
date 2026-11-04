/**
 * Lifecycle of a single turn, from the moment it is created until it
 * leaves the queue. Allowed transitions live in
 * common/utils/turn-state-machine.ts; every transition is published as an
 * internal event (see common/events/queue-events.ts).
 */
export enum TurnStatus {
  CREATED = 'created',
  CALLED = 'called',
  IN_SERVICE = 'in_service',
  COMPLETED = 'completed',
  ABSENT = 'absent',
  CANCELLED = 'cancelled',
}

export const WAITING_STATUSES = [TurnStatus.CREATED];
export const ATTENDING_STATUSES = [TurnStatus.CALLED, TurnStatus.IN_SERVICE];
export const OPEN_STATUSES = [...WAITING_STATUSES, ...ATTENDING_STATUSES];
