import { Hono } from 'hono';
import { authMiddleware, type Bindings } from '../middleware/auth';
import { getCurrentUserId } from '../utils/auth';

const accounts = new Hono<{ Bindings: Bindings }>();

// Apply auth middleware
accounts.use('*', authMiddleware);

// ============================================
// Account Subjects Management
// ============================================

// Get account subjects for a book
accounts.get('/subjects/book/:bookId', async (c) => {
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

    const subjects = await db
      .prepare('SELECT * FROM account_subjects WHERE book_id = ? ORDER BY sort_order, name')
      .bind(bookId)
      .all();

    // Get sub-accounts for each subject
    const accountSubjects = await Promise.all(
      (subjects.results || []).map(async (subject: any) => {
        const subAccounts = await db
          .prepare('SELECT * FROM sub_accounts WHERE subject_id = ? ORDER BY sort_order, name')
          .bind(subject.id)
          .all();

        return {
          ...subject,
          sub_accounts: subAccounts.results || []
        };
      })
    );

    return c.json({ accountSubjects });
  } catch (error: any) {
    console.error('Get account subjects error:', error);
    return c.json({ error: error.message || 'Failed to get account subjects' }, 500);
  }
});

// Create account subject
accounts.post('/subjects/book/:bookId', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const bookId = c.req.param('bookId');
    const { name, sort_order = 0 } = await c.req.json();
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
      .prepare('INSERT INTO account_subjects (book_id, name, sort_order) VALUES (?, ?, ?)')
      .bind(bookId, name, sort_order)
      .run();

    const subject = await db
      .prepare('SELECT * FROM account_subjects WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return c.json({ subject }, 201);
  } catch (error: any) {
    console.error('Create account subject error:', error);
    return c.json({ error: error.message || 'Failed to create account subject' }, 500);
  }
});

// Delete account subject
accounts.delete('/subjects/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const subjectId = c.req.param('id');
    const db: D1Database = c.env.DB;

    // Verify ownership through book
    const subject = await db
      .prepare(
        `SELECT s.id FROM account_subjects s
         JOIN books b ON s.book_id = b.id
         WHERE s.id = ? AND b.user_id = ?`
      )
      .bind(subjectId, userId)
      .first();

    if (!subject) {
      return c.json({ error: 'Account subject not found' }, 404);
    }

    await db
      .prepare('DELETE FROM account_subjects WHERE id = ?')
      .bind(subjectId)
      .run();

    return c.json({ success: true, message: 'Account subject deleted successfully' });
  } catch (error: any) {
    console.error('Delete account subject error:', error);
    return c.json({ error: error.message || 'Failed to delete account subject' }, 500);
  }
});

// Create sub-account
accounts.post('/sub-accounts/subject/:subjectId', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const subjectId = c.req.param('subjectId');
    const { name, sort_order = 0 } = await c.req.json();
    const db: D1Database = c.env.DB;

    // Verify ownership through book
    const subject = await db
      .prepare(
        `SELECT s.id FROM account_subjects s
         JOIN books b ON s.book_id = b.id
         WHERE s.id = ? AND b.user_id = ?`
      )
      .bind(subjectId, userId)
      .first();

    if (!subject) {
      return c.json({ error: 'Account subject not found' }, 404);
    }

    const result = await db
      .prepare('INSERT INTO sub_accounts (subject_id, name, sort_order) VALUES (?, ?, ?)')
      .bind(subjectId, name, sort_order)
      .run();

    const subAccount = await db
      .prepare('SELECT * FROM sub_accounts WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();

    return c.json({ subAccount }, 201);
  } catch (error: any) {
    console.error('Create sub-account error:', error);
    return c.json({ error: error.message || 'Failed to create sub-account' }, 500);
  }
});

// Delete sub-account
accounts.delete('/sub-accounts/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const subAccountId = c.req.param('id');
    const db: D1Database = c.env.DB;

    // Verify ownership through book
    const subAccount = await db
      .prepare(
        `SELECT sa.id FROM sub_accounts sa
         JOIN account_subjects s ON sa.subject_id = s.id
         JOIN books b ON s.book_id = b.id
         WHERE sa.id = ? AND b.user_id = ?`
      )
      .bind(subAccountId, userId)
      .first();

    if (!subAccount) {
      return c.json({ error: 'Sub-account not found' }, 404);
    }

    await db
      .prepare('DELETE FROM sub_accounts WHERE id = ?')
      .bind(subAccountId)
      .run();

    return c.json({ success: true, message: 'Sub-account deleted successfully' });
  } catch (error: any) {
    console.error('Delete sub-account error:', error);
    return c.json({ error: error.message || 'Failed to delete sub-account' }, 500);
  }
});

// ============================================
// Recipient Management (User-Level with Book Assignments)
// ============================================

// Get all recipients for current user with their book assignments
accounts.get('/recipients', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const db: D1Database = c.env.DB;

    const recipients = await db
      .prepare('SELECT * FROM recipients WHERE user_id = ? ORDER BY sort_order, name')
      .bind(userId)
      .all();

    // Get book assignments for each recipient
    const recipientsWithBooks = await Promise.all(
      (recipients.results || []).map(async (recipient: any) => {
        const assignments = await db
          .prepare(
            `SELECT b.id, b.business_name, b.account_name
             FROM books b
             JOIN recipient_book_assignments rba ON b.id = rba.book_id
             WHERE rba.recipient_id = ?`
          )
          .bind(recipient.id)
          .all();

        return {
          ...recipient,
          assigned_books: assignments.results || []
        };
      })
    );

    return c.json({ recipients: recipientsWithBooks });
  } catch (error: any) {
    console.error('Get recipients error:', error);
    return c.json({ error: error.message || 'Failed to get recipients' }, 500);
  }
});

// Create new recipient with optional book assignments
accounts.post('/recipients', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const { name, email, book_ids = [], sort_order = 0 } = await c.req.json();
    const db: D1Database = c.env.DB;

    if (!name || !email) {
      return c.json({ error: 'Name and email are required' }, 400);
    }

    // Create recipient
    const result = await db
      .prepare('INSERT INTO recipients (user_id, name, email, sort_order) VALUES (?, ?, ?, ?)')
      .bind(userId, name, email, sort_order)
      .run();

    const recipientId = result.meta.last_row_id;

    // Assign to books if book_ids provided
    if (Array.isArray(book_ids) && book_ids.length > 0) {
      for (const bookId of book_ids) {
        // Verify book ownership
        const book = await db
          .prepare('SELECT id FROM books WHERE id = ? AND user_id = ?')
          .bind(bookId, userId)
          .first();

        if (book) {
          await db
            .prepare('INSERT INTO recipient_book_assignments (recipient_id, book_id) VALUES (?, ?)')
            .bind(recipientId, bookId)
            .run();
        }
      }
    }

    const recipient = await db
      .prepare('SELECT * FROM recipients WHERE id = ?')
      .bind(recipientId)
      .first();

    return c.json({ recipient }, 201);
  } catch (error: any) {
    console.error('Create recipient error:', error);
    return c.json({ error: error.message || 'Failed to create recipient' }, 500);
  }
});

// Update recipient
accounts.put('/recipients/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const recipientId = c.req.param('id');
    const { name, email, book_ids, sort_order } = await c.req.json();
    const db: D1Database = c.env.DB;

    // Verify ownership
    const recipient = await db
      .prepare('SELECT id FROM recipients WHERE id = ? AND user_id = ?')
      .bind(recipientId, userId)
      .first();

    if (!recipient) {
      return c.json({ error: 'Recipient not found' }, 404);
    }

    const setParts: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      setParts.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      setParts.push('email = ?');
      values.push(email);
    }
    if (sort_order !== undefined) {
      setParts.push('sort_order = ?');
      values.push(sort_order);
    }

    if (setParts.length > 0) {
      setParts.push('updated_at = CURRENT_TIMESTAMP');
      values.push(recipientId);

      await db
        .prepare(`UPDATE recipients SET ${setParts.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();
    }

    // Update book assignments if book_ids provided
    if (Array.isArray(book_ids)) {
      // Delete existing assignments
      await db
        .prepare('DELETE FROM recipient_book_assignments WHERE recipient_id = ?')
        .bind(recipientId)
        .run();

      // Add new assignments
      for (const bookId of book_ids) {
        // Verify book ownership
        const book = await db
          .prepare('SELECT id FROM books WHERE id = ? AND user_id = ?')
          .bind(bookId, userId)
          .first();

        if (book) {
          await db
            .prepare('INSERT INTO recipient_book_assignments (recipient_id, book_id) VALUES (?, ?)')
            .bind(recipientId, bookId)
            .run();
        }
      }
    }

    const updatedRecipient = await db
      .prepare('SELECT * FROM recipients WHERE id = ?')
      .bind(recipientId)
      .first();

    return c.json({ recipient: updatedRecipient });
  } catch (error: any) {
    console.error('Update recipient error:', error);
    return c.json({ error: error.message || 'Failed to update recipient' }, 500);
  }
});

// Delete recipient
accounts.delete('/recipients/:id', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const recipientId = c.req.param('id');
    const db: D1Database = c.env.DB;

    // Verify ownership
    const recipient = await db
      .prepare('SELECT id FROM recipients WHERE id = ? AND user_id = ?')
      .bind(recipientId, userId)
      .first();

    if (!recipient) {
      return c.json({ error: 'Recipient not found' }, 404);
    }

    await db
      .prepare('DELETE FROM recipients WHERE id = ?')
      .bind(recipientId)
      .run();

    return c.json({ success: true, message: 'Recipient deleted successfully' });
  } catch (error: any) {
    console.error('Delete recipient error:', error);
    return c.json({ error: error.message || 'Failed to delete recipient' }, 500);
  }
});

// Assign recipient to a specific book (NEW!)
accounts.post('/recipients/:id/books/:bookId', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const recipientId = c.req.param('id');
    const bookId = c.req.param('bookId');
    const db: D1Database = c.env.DB;

    // Verify recipient ownership
    const recipient = await db
      .prepare('SELECT id FROM recipients WHERE id = ? AND user_id = ?')
      .bind(recipientId, userId)
      .first();

    if (!recipient) {
      return c.json({ error: 'Recipient not found' }, 404);
    }

    // Verify book ownership
    const book = await db
      .prepare('SELECT id FROM books WHERE id = ? AND user_id = ?')
      .bind(bookId, userId)
      .first();

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    // Check if assignment already exists
    const existing = await db
      .prepare('SELECT id FROM recipient_book_assignments WHERE recipient_id = ? AND book_id = ?')
      .bind(recipientId, bookId)
      .first();

    if (existing) {
      return c.json({ success: true, message: 'Assignment already exists' });
    }

    // Create assignment
    await db
      .prepare('INSERT INTO recipient_book_assignments (recipient_id, book_id) VALUES (?, ?)')
      .bind(recipientId, bookId)
      .run();

    return c.json({ success: true, message: 'Recipient assigned to book successfully' }, 201);
  } catch (error: any) {
    console.error('Assign recipient to book error:', error);
    return c.json({ error: error.message || 'Failed to assign recipient to book' }, 500);
  }
});

// Unassign recipient from a specific book (NEW!)
accounts.delete('/recipients/:id/books/:bookId', async (c) => {
  try {
    const userId = getCurrentUserId(c);
    const recipientId = c.req.param('id');
    const bookId = c.req.param('bookId');
    const db: D1Database = c.env.DB;

    // Verify recipient ownership
    const recipient = await db
      .prepare('SELECT id FROM recipients WHERE id = ? AND user_id = ?')
      .bind(recipientId, userId)
      .first();

    if (!recipient) {
      return c.json({ error: 'Recipient not found' }, 404);
    }

    // Verify book ownership
    const book = await db
      .prepare('SELECT id FROM books WHERE id = ? AND user_id = ?')
      .bind(bookId, userId)
      .first();

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    // Delete assignment
    await db
      .prepare('DELETE FROM recipient_book_assignments WHERE recipient_id = ? AND book_id = ?')
      .bind(recipientId, bookId)
      .run();

    return c.json({ success: true, message: 'Recipient unassigned from book successfully' });
  } catch (error: any) {
    console.error('Unassign recipient from book error:', error);
    return c.json({ error: error.message || 'Failed to unassign recipient from book' }, 500);
  }
});

// Legacy endpoint for backward compatibility
accounts.get('/recipients/book/:bookId', async (c) => {
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

    const recipients = await db
      .prepare(
        `SELECT r.* FROM recipients r
         JOIN recipient_book_assignments rba ON r.id = rba.recipient_id
         WHERE rba.book_id = ?
         ORDER BY r.sort_order, r.name`
      )
      .bind(bookId)
      .all();

    return c.json({ recipients: recipients.results || [] });
  } catch (error: any) {
    console.error('Get recipients for book error:', error);
    return c.json({ error: error.message || 'Failed to get recipients' }, 500);
  }
});

export default accounts;
