import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';

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

// Serve static files from public directory
app.use('/static/*', serveStatic({ root: './public' }));

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

// Default route - serve index.html
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZENIBO - 家計簿アプリ</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        max-width: 800px;
        margin: 50px auto;
        padding: 20px;
        line-height: 1.6;
      }
      h1 { color: #2563eb; }
      .status { color: #16a34a; font-weight: bold; }
      code {
        background: #f1f5f9;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.9em;
      }
      .section {
        background: #f8fafc;
        padding: 20px;
        margin: 20px 0;
        border-radius: 8px;
      }
    </style>
</head>
<body>
    <h1>✅ ZENIBO API v2.0 is Running</h1>
    <p class="status">Status: Operational</p>
    
    <div class="section">
      <h2>📋 次のステップ</h2>
      <ol>
        <li>D1データベースを作成: <code>npx wrangler d1 create zenibo-production</code></li>
        <li>wrangler.jsonc にdatabase_idを設定</li>
        <li>マイグレーション実行: <code>npm run db:migrate:local</code></li>
        <li>フロントエンドを追加して再デプロイ</li>
      </ol>
    </div>

    <div class="section">
      <h2>🔗 API エンドポイント</h2>
      <p>API仕様: <a href="/api">/api</a></p>
    </div>

    <div class="section">
      <h2>📝 Test Account</h2>
      <p>Email: <code>da.sasaki.2929@gmail.com</code></p>
      <p>Password: <code>test1234</code></p>
    </div>
</body>
</html>`);
});

export default app;
