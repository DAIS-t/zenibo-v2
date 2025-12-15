# ZENIBO v2.1 - 家計簿管理アプリ

## 📋 プロジェクト概要

**ZENIBO**は、個人事業主・フリーランス向けの出納帳管理Webアプリケーションです。
Cloudflare Pages + D1 Database + Hono Frameworkで構築された、軽量で高速なエッジアプリケーションです。

## ✨ 主な機能

### 完成済み機能
- ✅ **ユーザー認証**（登録、ログイン、ログアウト）
- ✅ **出納帳管理**（複数帳簿対応）
- ✅ **取引記録**（借方・貸方仕訳）
- ✅ **勘定科目・補助科目管理**
- ✅ **連絡先管理**（ユーザーレベル + 帳簿割当）
- ✅ **領収書アップロード**（予定）
- ✅ **月次レポートメール送信**
- ✅ **Stripe決済統合**（サブスクリプション）
- ✅ **クーポン管理**

### 未実装機能
- ⏳ メール送信機能の実装（SMTP連携）
- ⏳ 領収書ストレージ（R2統合）
- ⏳ CSVエクスポート機能
- ⏳ レポート機能の充実

## 🌐 デプロイURL

- **本番環境**: （デプロイ後に記載）
- **GitHub**: https://github.com/DAIS-t/zenibo-v2

## 🗄️ データアーキテクチャ

### データモデル
```
users (ユーザー)
├── books (出納帳)
│   ├── transactions (取引)
│   ├── account_subjects (勘定科目)
│   │   └── sub_accounts (補助科目)
│   ├── receipts (領収書)
│   └── recipient_book_assignments
└── recipients (連絡先)
```

### ストレージサービス
- **Cloudflare D1**: リレーショナルデータベース（SQLite）
- **Cloudflare R2**: （予定）領収書ファイルストレージ

## 🚀 ローカル開発環境セットアップ

### 前提条件
- Node.js 18以上
- npm 9以上
- Cloudflare アカウント

### セットアップ手順

```bash
# 1. プロジェクトをクローン
cd C:\Users\dasas\
# tar.gzを展開してzeniboフォルダに移動

# 2. 依存関係をインストール
npm install

# 3. D1データベースを作成
npx wrangler d1 create zenibo-v2-production

# 4. wrangler.jsonc の database_id を更新
# 出力された database_id をコピーして wrangler.jsonc に貼り付け

# 5. ローカルD1マイグレーション実行
npm run db:migrate:local

# 6. ビルド
npm run build

# 7. ローカル開発サーバー起動（要PM2またはsandbox環境）
npm run dev:sandbox
```

## 📦 デプロイ手順（Cloudflare Pages - Direct Upload）

### 1. Cloudflare認証

```bash
npx wrangler login
```

### 2. ビルド

```bash
npm run build
```

### 3. 本番データベースマイグレーション

```bash
npm run db:migrate:prod
```

### 4. デプロイ

```bash
npm run deploy
# または
npx wrangler pages deploy dist --project-name zenibo-v2
```

### 5. D1バインディング設定

Cloudflare Dashboard → Workers & Pages → zenibo-v2 → Settings → Functions → D1 database bindings

- Variable name: `DB`
- D1 database: `zenibo-v2-production`

## 🔧 技術スタック

- **フレームワーク**: Hono v4.11
- **ランタイム**: Cloudflare Workers
- **データベース**: Cloudflare D1 (SQLite)
- **フロントエンド**: Vanilla JavaScript + Tailwind CSS
- **ビルドツール**: Vite
- **デプロイ**: Cloudflare Pages

## 📚 API エンドポイント

### 認証 (`/api/auth`)
- `POST /api/auth/register` - ユーザー登録
- `POST /api/auth/login` - ログイン
- `POST /api/auth/logout` - ログアウト
- `GET /api/auth/me` - 現在のユーザー情報

### 出納帳 (`/api/books`)
- `GET /api/books` - 帳簿一覧取得
- `POST /api/books` - 帳簿作成
- `GET /api/books/:id` - 帳簿詳細
- `PUT /api/books/:id` - 帳簿更新
- `DELETE /api/books/:id` - 帳簿削除

### 取引 (`/api/transactions`)
- `GET /api/transactions?book_id=<id>` - 取引一覧
- `POST /api/transactions` - 取引作成
- `GET /api/transactions/:id` - 取引詳細
- `PUT /api/transactions/:id` - 取引更新
- `DELETE /api/transactions/:id` - 取引削除

### 勘定科目 (`/api/accounts`)
- `GET /api/accounts/subjects?book_id=<id>` - 勘定科目一覧
- `POST /api/accounts/subjects` - 勘定科目作成
- `DELETE /api/accounts/subjects/:id` - 勘定科目削除
- `GET /api/accounts/sub-accounts?subject_id=<id>` - 補助科目一覧
- `POST /api/accounts/sub-accounts` - 補助科目作成
- `DELETE /api/accounts/sub-accounts/:id` - 補助科目削除

### 連絡先 (`/api/emails`)
- `GET /api/emails/recipients` - 連絡先一覧
- `POST /api/emails/recipients` - 連絡先作成
- `PUT /api/emails/recipients/:id` - 連絡先更新
- `DELETE /api/emails/recipients/:id` - 連絡先削除
- `POST /api/emails/recipients/:id/assign` - 帳簿に割当
- `DELETE /api/emails/recipients/:id/unassign` - 帳簿割当解除

### 領収書 (`/api/receipts`)
- `POST /api/receipts/upload` - 領収書アップロード（予定）
- `GET /api/receipts?book_id=<id>` - 領収書一覧
- `GET /api/receipts/:id/download` - 領収書ダウンロード
- `DELETE /api/receipts/:id` - 領収書削除

### Stripe (`/api/stripe`)
- `POST /api/stripe/create-checkout-session` - 決済セッション作成
- `POST /api/stripe/create-customer-portal-session` - 顧客ポータル

### クーポン (`/api/coupons`)
- `POST /api/coupons/validate` - クーポン検証
- 他、管理用CRUD操作

## 🎯 今後の開発予定

1. **メール送信機能の実装** - SendGrid / Resend統合
2. **領収書ストレージ** - R2バケット統合
3. **CSVエクスポート** - MoneyForward / freee対応
4. **月次・年次レポート** - PDF生成
5. **複数ユーザー対応** - 共同編集機能
6. **モバイルアプリ** - PWA対応

## 🔐 セキュリティ

- パスワードは SHA-256 でハッシュ化
- JWT トークンベース認証
- CORS設定済み
- SQL injection 対策（Prepared Statements）

## 📝 ライセンス

Private Project - All Rights Reserved

## 👤 開発者

- **Name**: DAIS-t
- **Email**: da.sasaki.2929@gmail.com
- **GitHub**: https://github.com/DAIS-t

## 📅 最終更新日

2025-12-15

---

**Note**: このプロジェクトは完全に新規作成されたZENIBO v2.1です。過去の設定エラーを回避し、クリーンな環境で構築されています。
