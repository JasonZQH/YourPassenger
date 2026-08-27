import type {
  SessionRecord,
  UserProfile,
} from '@yourpassenger/contracts';

export interface RealtimeConnectionContext {
  userId: string;
  sessionId: string;
  profile: UserProfile | null;
  session: SessionRecord;
}
