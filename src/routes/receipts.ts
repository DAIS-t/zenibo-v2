import { Hono } from 'hono';
import { authMiddleware, type Bindings } from '../middleware/auth';
import { getCurrentUserId } from '../utils/auth';

const receipts = new Hono<{ Bindings: Bindings }>();

receipts.use('*', authMiddleware);

// Upload receipt (stub - R2 storage needed for full implementation)
receipts.post('/book/:bookId/upload', async (c) => {
  try {
    return c.json({
      success: false,
      error: 'Receipt upload not yet implemented - R2 storage required'
    }, 501);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get receipts for a book
receipts.get('/book/:bookId', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const bookId = c.req.param('bookId');
    const db: D1Database = c.env.DB;

    // Verify book ownership
    const book = await db
      .prepare('SELECT id FROM books WHERE id = ? AND user_id = ?')
      .bind(bookId, userId)
      .first();

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    const result = await db
      .prepare('SELECT * FROM receipts WHERE book_id = ? ORDER BY uploaded_at DESC')
      .bind(bookId)
      .all();

    return c.json({ receipts: result.results || [] });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Download receipt (stub)
receipts.get('/:id/download', async (c) => {
  return c.json({
    error: 'Receipt download not yet implemented - R2 storage required'
  }, 501);
});

// Delete receipt
receipts.delete('/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const receiptId = c.req.param('id');
    const db: D1Database = c.env.DB;

    const receipt = await db
      .prepare(
        `SELECT r.id FROM receipts r
         JOIN books b ON r.book_id = b.id
         WHERE r.id = ? AND b.user_id = ?`
      )
      .bind(receiptId, userId)
      .first();

    if (!receipt) {
      return c.json({ error: 'Receipt not found' }, 404);
    }

    await db
      .prepare('DELETE FROM receipts WHERE id = ?')
      .bind(receiptId)
      .run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default receipts;
