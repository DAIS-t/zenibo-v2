import { Hono } from 'hono';
import { authMiddleware, type Bindings } from '../middleware/auth';
import { getCurrentUserId } from '../utils/auth';

const books = new Hono<{ Bindings: Bindings }>();

// Apply auth middleware to all routes
books.use('*', authMiddleware);

// Get all books for current user
books.get('/', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const db: D1Database = c.env.DB;

    const result = await db
      .prepare('SELECT * FROM books WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all();

    return c.json({ books: result.results || [] });
  } catch (error: any) {
    console.error('Get books error:', error);
    return c.json({ error: error.message || 'Failed to get books' }, 500);
  }
});

// Get single book
books.get('/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const bookId = c.req.param('id');
    const db: D1Database = c.env.DB;

    const book = await db
      .prepare('SELECT * FROM books WHERE id = ? AND user_id = ?')
      .bind(bookId, userId)
      .first();

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    return c.json({ book });
  } catch (error: any) {
    console.error('Get book error:', error);
    return c.json({ error: error.message || 'Failed to get book' }, 500);
  }
});

// Create book
books.post('/', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const { business_name, account_name, opening_balance = 0, export_format = 'mf' } = await c.req.json();

    if (!business_name || !account_name) {
      return c.json({ error: 'Business name and account name are required' }, 400);
    }

    const db: D1Database = c.env.DB;

    const result = await db
      .prepare(
        `INSERT INTO books (user_id, business_name, account_name, opening_balance, export_format) 
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(userId, business_name, account_name, opening_balance, export_format)
      .run();

    const bookId = result.meta.last_row_id;

    const book = await db
      .prepare('SELECT * FROM books WHERE id = ?')
      .bind(bookId)
      .first();

    return c.json({ book }, 201);
  } catch (error: any) {
    console.error('Create book error:', error);
    return c.json({ error: error.message || 'Failed to create book' }, 500);
  }
});

// Update book
books.put('/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const bookId = c.req.param('id');
    const updates = await c.req.json();

    const db: D1Database = c.env.DB;

    // Verify ownership
    const book = await db
      .prepare('SELECT id FROM books WHERE id = ? AND user_id = ?')
      .bind(bookId, userId)
      .first();

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.business_name !== undefined) {
      setParts.push('business_name = ?');
      values.push(updates.business_name);
    }
    if (updates.account_name !== undefined) {
      setParts.push('account_name = ?');
      values.push(updates.account_name);
    }
    if (updates.opening_balance !== undefined) {
      setParts.push('opening_balance = ?');
      values.push(updates.opening_balance);
    }
    if (updates.export_format !== undefined) {
      setParts.push('export_format = ?');
      values.push(updates.export_format);
    }

    if (setParts.length === 0) {
      return c.json({ error: 'No valid updates provided' }, 400);
    }

    setParts.push('updated_at = CURRENT_TIMESTAMP');
    values.push(bookId);

    await db
      .prepare(`UPDATE books SET ${setParts.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const updatedBook = await db
      .prepare('SELECT * FROM books WHERE id = ?')
      .bind(bookId)
      .first();

    return c.json({ book: updatedBook });
  } catch (error: any) {
    console.error('Update book error:', error);
    return c.json({ error: error.message || 'Failed to update book' }, 500);
  }
});

// Delete book
books.delete('/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const bookId = c.req.param('id');
    const db: D1Database = c.env.DB;

    // Verify ownership
    const book = await db
      .prepare('SELECT id FROM books WHERE id = ? AND user_id = ?')
      .bind(bookId, userId)
      .first();

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    await db
      .prepare('DELETE FROM books WHERE id = ?')
      .bind(bookId)
      .run();

    return c.json({ success: true, message: 'Book deleted successfully' });
  } catch (error: any) {
    console.error('Delete book error:', error);
    return c.json({ error: error.message || 'Failed to delete book' }, 500);
  }
});

export default books;
