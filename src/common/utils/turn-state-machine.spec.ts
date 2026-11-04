import { ConflictException } from '@nestjs/common';
import { TurnStatus } from '../enums/turn-status.enum';
import { assertTransition, canTransition } from './turn-state-machine';

describe('turn state machine', () => {
  it.each([
    [TurnStatus.CREATED, TurnStatus.CALLED],
    [TurnStatus.CREATED, TurnStatus.CANCELLED],
    [TurnStatus.CALLED, TurnStatus.IN_SERVICE],
    [TurnStatus.CALLED, TurnStatus.ABSENT],
    [TurnStatus.CALLED, TurnStatus.CANCELLED],
    [TurnStatus.IN_SERVICE, TurnStatus.COMPLETED],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    [TurnStatus.CREATED, TurnStatus.IN_SERVICE],
    [TurnStatus.CREATED, TurnStatus.COMPLETED],
    [TurnStatus.IN_SERVICE, TurnStatus.CANCELLED],
    [TurnStatus.IN_SERVICE, TurnStatus.ABSENT],
    [TurnStatus.COMPLETED, TurnStatus.CALLED],
    [TurnStatus.CANCELLED, TurnStatus.CALLED],
    [TurnStatus.ABSENT, TurnStatus.IN_SERVICE],
  ])('rejects %s -> %s with 409', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(ConflictException);
  });
});
