import { Hono } from 'hono';
import { authMiddleware, type Bindings } from '../middleware/auth';
import { getCurrentUserId } from '../utils/auth';

const transactions = new Hono<{ Bindings: Bindings }>();

// Apply auth middleware
transactions.use('*', authMiddleware);

// Get transactions for a book
transactions.get('/book/:bookId', async (c) => {
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
      .prepare('SELECT * FROM transactions WHERE book_id = ? ORDER BY date DESC, created_at DESC')
      .bind(bookId)
      .all();

    return c.json({ transactions: result.results || [] });
  } catch (error: any) {
    console.error('Get transactions error:', error);
    return c.json({ error: error.message || 'Failed to get transactions' }, 500);
  }
});

// Create transaction
transactions.post('/book/:bookId', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const bookId = c.req.param('bookId');
    const transaction = await c.req.json();
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
      .prepare(
        `INSERT INTO transactions 
         (book_id, date, description, debit_account, debit_sub_account, debit_amount, 
          credit_account, credit_sub_account, credit_amount, receipt_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        bookId,
        transaction.date,
        transaction.description || null,
        transaction.debit_account || null,
        transaction.debit_sub_account || null,
        transaction.debit_amount || 0,
        transaction.credit_account || null,
        transaction.credit_sub_account || null,
        transaction.credit_amount || 0,
        transaction.receipt_id || null
      )
      .run();

    const newTransaction = await db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return c.json({ transaction: newTransaction }, 201);
  } catch (error: any) {
    console.error('Create transaction error:', error);
    return c.json({ error: error.message || 'Failed to create transaction' }, 500);
  }
});

// Update transaction
transactions.put('/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const transactionId = c.req.param('id');
    const updates = await c.req.json();
    const db: D1Database = c.env.DB;

    // Verify ownership through book
    const transaction = await db
      .prepare(
        `SELECT t.* FROM transactions t
         JOIN books b ON t.book_id = b.id
         WHERE t.id = ? AND b.user_id = ?`
      )
      .bind(transactionId, userId)
      .first();

    if (!transaction) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.date !== undefined) {
      setParts.push('date = ?');
      values.push(updates.date);
    }
    if (updates.description !== undefined) {
      setParts.push('description = ?');
      values.push(updates.description);
    }
    if (updates.debit_account !== undefined) {
      setParts.push('debit_account = ?');
      values.push(updates.debit_account);
    }
    if (updates.debit_sub_account !== undefined) {
      setParts.push('debit_sub_account = ?');
      values.push(updates.debit_sub_account);
    }
    if (updates.debit_amount !== undefined) {
      setParts.push('debit_amount = ?');
      values.push(updates.debit_amount);
    }
    if (updates.credit_account !== undefined) {
      setParts.push('credit_account = ?');
      values.push(updates.credit_account);
    }
    if (updates.credit_sub_account !== undefined) {
      setParts.push('credit_sub_account = ?');
      values.push(updates.credit_sub_account);
    }
    if (updates.credit_amount !== undefined) {
      setParts.push('credit_amount = ?');
      values.push(updates.credit_amount);
    }

    if (setParts.length === 0) {
      return c.json({ error: 'No valid updates provided' }, 400);
    }

    setParts.push('updated_at = CURRENT_TIMESTAMP');
    values.push(transactionId);

    await db
      .prepare(`UPDATE transactions SET ${setParts.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const updatedTransaction = await db
      .prepare('SELECT * FROM transactions WHERE id = ?')
      .bind(transactionId)
      .first();

    return c.json({ transaction: updatedTransaction });
  } catch (error: any) {
    console.error('Update transaction error:', error);
    return c.json({ error: error.message || 'Failed to update transaction' }, 500);
  }
});

// Delete transaction
transactions.delete('/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const transactionId = c.req.param('id');
    const db: D1Database = c.env.DB;

    // Verify ownership through book
    const transaction = await db
      .prepare(
        `SELECT t.id FROM transactions t
         JOIN books b ON t.book_id = b.id
         WHERE t.id = ? AND b.user_id = ?`
      )
      .bind(transactionId, userId)
      .first();

    if (!transaction) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    await db
      .prepare('DELETE FROM transactions WHERE id = ?')
      .bind(transactionId)
      .run();

    return c.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error: any) {
    console.error('Delete transaction error:', error);
    return c.json({ error: error.message || 'Failed to delete transaction' }, 500);
  }
});

export default transactions;
