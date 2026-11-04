import { UserRole } from '../../../common/enums/user-role.enum';

export type TokenKind = 'access' | 'socket';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  institutionId: string;
  agentId: string | null;
  kind: TokenKind;
}

/** The authenticated principal attached to each request (req.user). */
export interface AuthUser {
  userId: string;
  role: UserRole;
  institutionId: string;
  agentId: string | null;
}
