import { ConflictException } from '@nestjs/common';
import { TurnStatus } from '../enums/turn-status.enum';

const TRANSITIONS: Record<TurnStatus, TurnStatus[]> = {
  [TurnStatus.CREATED]: [TurnStatus.CALLED, TurnStatus.CANCELLED],
  [TurnStatus.CALLED]: [
    TurnStatus.IN_SERVICE,
    TurnStatus.ABSENT,
    TurnStatus.CANCELLED,
  ],
  [TurnStatus.IN_SERVICE]: [TurnStatus.COMPLETED],
  [TurnStatus.COMPLETED]: [],
  [TurnStatus.ABSENT]: [],
  [TurnStatus.CANCELLED]: [],
};

export function canTransition(from: TurnStatus, to: TurnStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws 409 Conflict when the requested transition is not allowed. */
export function assertTransition(from: TurnStatus, to: TurnStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(
      `Invalid turn transition from '${from}' to '${to}'`,
    );
  }
}
