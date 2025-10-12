import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Simple session storage (in-memory for now)
const sessions = new Map<string, { userId: string; role: string }>();

export function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function createSession(userId: string, role: string): string {
  const token = generateSessionToken();
  sessions.set(token, { userId, role });
  return token;
}

export function getSession(token: string) {
  return sessions.get(token);
}

export function destroySession(token: string) {
  sessions.delete(token);
}

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
