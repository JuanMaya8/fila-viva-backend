/**
 * Lifecycle of a single turn, from the moment it is created until it
 * leaves the queue. Every transition is a candidate event to publish on
 * the message bus once Kafka is provisioned (see README.md).
 */
export enum TurnStatus {
  CREATED = 'created',
  CALLED = 'called',
  IN_SERVICE = 'in_service',
  COMPLETED = 'completed',
  ABSENT = 'absent',
  CANCELLED = 'cancelled',
}
