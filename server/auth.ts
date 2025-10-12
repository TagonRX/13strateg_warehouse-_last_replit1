import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";

const SALT_ROUNDS = 10;
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Session storage with expiry
interface Session {
  userId: string;
  role: string;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function createSession(userId: string, role: string): string {
  const token = generateSessionToken();
  const expiresAt = Date.now() + SESSION_EXPIRY;
  sessions.set(token, { userId, role, expiresAt });
  return token;
}

export function getSession(token: string): { userId: string; role: string } | undefined {
  const session = sessions.get(token);
  
  if (!session) {
    return undefined;
  }
  
  // Check if session expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return undefined;
  }
  
  return { userId: session.userId, role: session.role };
}

export function destroySession(token: string) {
  sessions.delete(token);
}

// Cleanup expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of Array.from(sessions.entries())) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const session = getSession(token);
  
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  // Attach user info to request
  (req as any).userId = session.userId;
  (req as any).userRole = session.role;
  
  next();
}

// Middleware to require admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userRole = (req as any).userRole;
  
  if (userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  next();
}
