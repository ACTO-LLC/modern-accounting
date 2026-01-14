/**
 * In-memory session store for QBO OAuth tokens.
 * In production, this should be backed by a database.
 */

export interface QBOSession {
    sessionId: string;
    realmId?: string;
    companyName?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: Date;
    createdAt: Date;
    lastUsedAt: Date;
}

class SessionStore {
    private sessions: Map<string, QBOSession> = new Map();

    create(sessionId: string): QBOSession {
        const session: QBOSession = {
            sessionId,
            createdAt: new Date(),
            lastUsedAt: new Date()
        };
        this.sessions.set(sessionId, session);
        return session;
    }

    get(sessionId: string): QBOSession | undefined {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastUsedAt = new Date();
        }
        return session;
    }

    getOrCreate(sessionId: string): QBOSession {
        return this.get(sessionId) || this.create(sessionId);
    }

    update(sessionId: string, data: Partial<QBOSession>): QBOSession | undefined {
        const session = this.sessions.get(sessionId);
        if (!session) return undefined;

        Object.assign(session, data, { lastUsedAt: new Date() });
        return session;
    }

    setTokens(sessionId: string, tokens: {
        accessToken: string;
        refreshToken: string;
        realmId: string;
        companyName?: string;
        expiresIn?: number;
    }): QBOSession {
        const session = this.getOrCreate(sessionId);
        session.accessToken = tokens.accessToken;
        session.refreshToken = tokens.refreshToken;
        session.realmId = tokens.realmId;
        session.companyName = tokens.companyName;
        session.tokenExpiry = new Date(Date.now() + (tokens.expiresIn || 3600) * 1000);
        session.lastUsedAt = new Date();
        return session;
    }

    delete(sessionId: string): boolean {
        return this.sessions.delete(sessionId);
    }

    isConnected(sessionId: string): boolean {
        const session = this.get(sessionId);
        return !!(session?.refreshToken && session?.realmId);
    }

    isTokenExpired(sessionId: string): boolean {
        const session = this.get(sessionId);
        if (!session?.tokenExpiry) return true;
        return new Date() >= session.tokenExpiry;
    }

    // Cleanup expired sessions (call periodically)
    cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
        const now = new Date();
        for (const [id, session] of this.sessions) {
            if (now.getTime() - session.lastUsedAt.getTime() > maxAgeMs) {
                this.sessions.delete(id);
            }
        }
    }
}

export const sessionStore = new SessionStore();
