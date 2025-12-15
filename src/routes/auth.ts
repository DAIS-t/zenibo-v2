import { Hono } from 'hono';
import { hashPassword, verifyPassword, generateToken } from '../utils/auth';
import { authMiddleware, type Bindings } from '../middleware/auth';

const auth = new Hono<{ Bindings: Bindings }>();

// Register
auth.post('/register', async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: 'Email, password, and name are required' }, 400);
    }

    const db: D1Database = c.env.DB;

    // Check if user exists
    const existing = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (existing) {
      return c.json({ error: 'Email already registered' }, 409);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await db
      .prepare(
        'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
      )
      .bind(email, passwordHash, name)
      .run();

    const userId = result.meta.last_row_id;

    // Generate token
    const token = await generateToken(userId);

    return c.json({
      success: true,
      token,
      user: { id: userId, email, name }
    });
  } catch (error: any) {
    console.error('Register error:', error);
    return c.json({ error: error.message || 'Registration failed' }, 500);
  }
});

// Login
auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const db: D1Database = c.env.DB;

    // Find user
    const user = await db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash as string);

    if (!valid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Generate token
    const token = await generateToken(user.id as number);

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_plan: user.subscription_plan,
        subscription_status: user.subscription_status
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return c.json({ error: error.message || 'Login failed' }, 500);
  }
});

// Get current user
auth.get('/me', authMiddleware, async (c) => {
  try {
    const user = c.get('user');

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_plan: user.subscription_plan || 'free',
        subscription_status: user.subscription_status || 'inactive',
        subscription_start_date: user.subscription_start_date,
        subscription_end_date: user.subscription_end_date
      },
      subscription: {
        plan: user.subscription_plan || 'free',
        status: user.subscription_status || 'inactive',
        startDate: user.subscription_start_date,
        endDate: user.subscription_end_date
      }
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    return c.json({ error: error.message || 'Failed to get user' }, 500);
  }
});

// Subscribe (simplified)
auth.post('/subscribe', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { plan, card_last4, card_name } = await c.req.json();

    const db: D1Database = c.env.DB;

    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .prepare(
        `UPDATE users 
         SET subscription_plan = ?, 
             subscription_status = 'active',
             subscription_start_date = ?,
             subscription_end_date = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(plan, startDate, endDate, user.id)
      .run();

    return c.json({
      success: true,
      subscription: {
        plan,
        status: 'active',
        startDate,
        endDate
      }
    });
  } catch (error: any) {
    console.error('Subscribe error:', error);
    return c.json({ error: error.message || 'Subscription failed' }, 500);
  }
});

// Unsubscribe
auth.post('/unsubscribe', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const db: D1Database = c.env.DB;

    await db
      .prepare(
        `UPDATE users 
         SET subscription_status = 'cancelled',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(user.id)
      .run();

    return c.json({
      success: true,
      message: 'Subscription cancelled'
    });
  } catch (error: any) {
    console.error('Unsubscribe error:', error);
    return c.json({ error: error.message || 'Failed to cancel subscription' }, 500);
  }
});

export default auth;
