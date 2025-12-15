import { Context } from 'hono';

// Simple password hashing (for demo - use bcrypt in production)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

// JWT utilities (simplified for Cloudflare Workers)
export async function generateToken(userId: number): Promise<string> {
  const payload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) // 30 days
  };
  return btoa(JSON.stringify(payload));
}

export async function verifyToken(token: string): Promise<{ userId: number } | null> {
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export function getCurrentUserId(c: Context): number {
  const user = c.get('user');
  if (!user || !user.id) {
    throw new Error('Unauthorized');
  }
  return user.id;
}
