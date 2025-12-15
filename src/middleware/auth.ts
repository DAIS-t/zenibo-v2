import { Context, Next } from 'hono';
import { verifyToken } from '../utils/auth';

export type Bindings = {
  DB: D1Database;
};

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Fetch user from database
  const db: D1Database = c.env.DB;
  const user = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(payload.userId)
    .first();

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  // Store user in context
  c.set('user', user);

  await next();
}
