import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Import routes
import auth from './routes/auth';
import books from './routes/books';
import transactions from './routes/transactions';
import accounts from './routes/accounts';
import receipts from './routes/receipts';
import emails from './routes/emails';
import stripe from './routes/stripe';
import coupons from './routes/coupons';

export type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for all API routes
app.use('/api/*', cors());

// API routes
app.route('/api/auth', auth);
app.route('/api/books', books);
app.route('/api/transactions', transactions);
app.route('/api/accounts', accounts);
app.route('/api/receipts', receipts);
app.route('/api/emails', emails);
app.route('/api/stripe', stripe);
app.route('/api/coupons', coupons);

// Root route - health check
app.get('/api', (c) => {
  return c.json({
    message: 'ZENIBO API v2.0',
    status: 'operational',
    version: '2.0.0',
    features: {
      authentication: 'active',
      books: 'active',
      transactions: 'active',
      accounts: 'active',
      recipients: 'active',
      recipient_book_assignments: 'active',
      receipts: 'partial',
      emails: 'not_implemented',
      stripe: 'not_implemented',
      coupons: 'active'
    },
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET /api/auth/me',
        'POST /api/auth/subscribe',
        'POST /api/auth/unsubscribe'
      ],
      books: [
        'GET /api/books',
        'GET /api/books/:id',
        'POST /api/books',
        'PUT /api/books/:id',
        'DELETE /api/books/:id'
      ],
      transactions: [
        'GET /api/transactions/book/:bookId',
        'POST /api/transactions/book/:bookId',
        'PUT /api/transactions/:id',
        'DELETE /api/transactions/:id'
      ],
      accounts: [
        'GET /api/accounts/subjects/book/:bookId',
        'POST /api/accounts/subjects/book/:bookId',
        'DELETE /api/accounts/subjects/:id',
        'POST /api/accounts/sub-accounts/subject/:subjectId',
        'DELETE /api/accounts/sub-accounts/:id',
        'GET /api/accounts/recipients',
        'POST /api/accounts/recipients',
        'PUT /api/accounts/recipients/:id',
        'DELETE /api/accounts/recipients/:id',
        'POST /api/accounts/recipients/:id/books/:bookId',
        'DELETE /api/accounts/recipients/:id/books/:bookId',
        'GET /api/accounts/recipients/book/:bookId'
      ],
      coupons: [
        'POST /api/coupons/validate',
        'GET /api/coupons',
        'POST /api/coupons',
        'PUT /api/coupons/:id',
        'DELETE /api/coupons/:id',
        'GET /api/coupons/stats',
        'GET /api/coupons/redemptions',
        'GET /api/coupons/:id/history'
      ]
    }
  });
});

export default app;
