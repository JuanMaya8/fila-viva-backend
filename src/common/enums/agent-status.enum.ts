/**
 * Advisor availability. AVAILABLE and BUSY count as active capacity for
 * the queue simulation; ON_BREAK advisors are expected back soon, and
 * OFFLINE advisors are ignored.
 */
export enum AgentStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  ON_BREAK = 'on_break',
  OFFLINE = 'offline',
}
