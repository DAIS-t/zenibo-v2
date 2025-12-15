import { Hono } from 'hono';
import { authMiddleware, type Bindings } from '../middleware/auth';
import { getCurrentUserId } from '../utils/auth';

const coupons = new Hono<{ Bindings: Bindings }>();

coupons.use('*', authMiddleware);

// Validate coupon
coupons.post('/validate', async (c) => {
  try {
    const { code, plan } = await c.req.json();
    const db: D1Database = c.env.DB;

    const coupon = await db
      .prepare(
        `SELECT * FROM coupons 
         WHERE code = ? AND is_active = 1
         AND (valid_from IS NULL OR valid_from <= datetime('now'))
         AND (valid_until IS NULL OR valid_until >= datetime('now'))
         AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
         AND (plan_restriction IS NULL OR plan_restriction = ?)`
      )
      .bind(code, plan)
      .first();

    if (!coupon) {
      return c.json({ error: 'Invalid or expired coupon' }, 400);
    }

    return c.json({ coupon, valid: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get all coupons (admin only - simplified)
coupons.get('/', async (c) => {
  try {
    const db: D1Database = c.env.DB;

    const result = await db
      .prepare('SELECT * FROM coupons ORDER BY created_at DESC')
      .all();

    return c.json({ coupons: result.results || [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create coupon (admin only - simplified)
coupons.post('/', async (c) => {
  try {
    const couponData = await c.req.json();
    const db: D1Database = c.env.DB;

    const result = await db
      .prepare(
        `INSERT INTO coupons 
         (code, discount_type, discount_value, plan_restriction, max_redemptions, valid_from, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        couponData.code,
        couponData.discount_type,
        couponData.discount_value,
        couponData.plan_restriction || null,
        couponData.max_redemptions || null,
        couponData.valid_from || null,
        couponData.valid_until || null
      )
      .run();

    const coupon = await db
      .prepare('SELECT * FROM coupons WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return c.json({ coupon }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update coupon
coupons.put('/:id', async (c) => {
  try {
    const couponId = c.req.param('id');
    const updates = await c.req.json();
    const db: D1Database = c.env.DB;

    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.is_active !== undefined) {
      setParts.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.max_redemptions !== undefined) {
      setParts.push('max_redemptions = ?');
      values.push(updates.max_redemptions);
    }

    if (setParts.length > 0) {
      setParts.push('updated_at = CURRENT_TIMESTAMP');
      values.push(couponId);

      await db
        .prepare(`UPDATE coupons SET ${setParts.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    }

    const coupon = await db
      .prepare('SELECT * FROM coupons WHERE id = ?')
      .bind(couponId)
      .first();

    return c.json({ coupon });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete coupon
coupons.delete('/:id', async (c) => {
  try {
    const couponId = c.req.param('id');
    const db: D1Database = c.env.DB;

    await db
      .prepare('DELETE FROM coupons WHERE id = ?')
      .bind(couponId)
      .run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get coupon stats
coupons.get('/stats', async (c) => {
  try {
    const db: D1Database = c.env.DB;

    const result = await db
      .prepare(
        `SELECT 
          COUNT(*) as total_coupons,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_coupons,
          SUM(redemption_count) as total_redemptions
         FROM coupons`
      )
      .first();

    return c.json({ stats: result });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get redemptions
coupons.get('/redemptions', async (c) => {
  try {
    const couponId = c.req.query('coupon_id');
    const userId = c.req.query('user_id');
    const db: D1Database = c.env.DB;

    let query = 'SELECT * FROM coupon_redemptions WHERE 1=1';
    const params: any[] = [];

    if (couponId) {
      query += ' AND coupon_id = ?';
      params.push(couponId);
    }

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY redeemed_at DESC';

    const result = await db.prepare(query).bind(...params).all();

    return c.json({ redemptions: result.results || [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Sync with Stripe (stub)
coupons.post('/:id/sync-stripe', async (c) => {
  return c.json({
    success: false,
    message: 'Stripe sync not yet implemented'
  }, 501);
});

// Get coupon history
coupons.get('/:id/history', async (c) => {
  try {
    const couponId = c.req.param('id');
    const db: D1Database = c.env.DB;

    const result = await db
      .prepare(
        `SELECT cr.*, u.email, u.name 
         FROM coupon_redemptions cr
         JOIN users u ON cr.user_id = u.id
         WHERE cr.coupon_id = ?
         ORDER BY cr.redeemed_at DESC`
      )
      .bind(couponId)
      .all();

    return c.json({ history: result.results || [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default coupons;
