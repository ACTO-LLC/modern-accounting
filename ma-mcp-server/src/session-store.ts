interface Session {
  id: string;
  userId: string | null;
  createdAt: Date;
  lastAccessedAt: Date;
}

class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Clean up expired sessions every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }

  createSession(sessionId: string, userId?: string): Session {
    const session: Session = {
      id: sessionId,
      userId: userId || null,
      createdAt: new Date(),
      lastAccessedAt: new Date()
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check if expired
    const now = new Date().getTime();
    if (now - session.lastAccessedAt.getTime() > this.SESSION_TIMEOUT_MS) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last accessed time
    session.lastAccessedAt = new Date();
    return session;
  }

  setUserId(sessionId: string, userId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;
    session.userId = userId;
    return true;
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  private cleanupExpiredSessions(): void {
    const now = new Date().getTime();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt.getTime() > this.SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }
}

export const sessionStore = new SessionStore();
