// API Client for Cashbook App
class APIClient {
    constructor() {
        this.baseURL = window.location.origin;
        this.token = localStorage.getItem('auth_token');
    }

    // Token management
    setToken(token) {
        this.token = token;
        localStorage.setItem('auth_token', token);
    }

    getToken() {
        return this.token || localStorage.getItem('auth_token');
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('auth_token');
    }

    isAuthenticated() {
        return !!this.getToken();
    }

    // Generic request helper
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // Auth endpoints
    async register(email, password, name) {
        const data = await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
            skipAuth: true
        });
        
        if (data.token) {
            this.setToken(data.token);
        }
        
        return data;
    }

    async login(email, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            skipAuth: true
        });
        
        if (data.token) {
            this.setToken(data.token);
        }
        
        return data;
    }

    async getCurrentUser() {
        return await this.request('/api/auth/me');
    }

    logout() {
        this.clearToken();
    }

    // Books endpoints
    async getBooks() {
        const data = await this.request('/api/books');
        return data || { books: [] };
    }

    async getBook(bookId) {
        const data = await this.request(`/api/books/${bookId}`);
        return data.book;
    }

    async createBook(businessName, accountName, openingBalance = 0, exportFormat = 'mf') {
        const data = await this.request('/api/books', {
            method: 'POST',
            body: JSON.stringify({
                business_name: businessName,
                account_name: accountName,
                opening_balance: openingBalance,
                export_format: exportFormat
            })
        });
        return data.book;
    }

    async updateBook(bookId, updates) {
        const body = {};
        if (updates.businessName) body.business_name = updates.businessName;
        if (updates.accountName) body.account_name = updates.accountName;
        if (updates.openingBalance !== undefined) body.opening_balance = updates.openingBalance;
        if (updates.exportFormat) body.export_format = updates.exportFormat;

        const data = await this.request(`/api/books/${bookId}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        return data.book;
    }

    async deleteBook(bookId) {
        return await this.request(`/api/books/${bookId}`, {
            method: 'DELETE'
        });
    }

    // Transactions endpoints
    async getTransactions(bookId) {
        const data = await this.request(`/api/transactions/book/${bookId}`);
        return data.transactions || [];
    }

    async createTransaction(bookId, transaction) {
        const data = await this.request(`/api/transactions/book/${bookId}`, {
            method: 'POST',
            body: JSON.stringify(transaction)
        });
        return data.transaction;
    }

    async updateTransaction(transactionId, updates) {
        const data = await this.request(`/api/transactions/${transactionId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
        return data.transaction;
    }

    async deleteTransaction(transactionId) {
        return await this.request(`/api/transactions/${transactionId}`, {
            method: 'DELETE'
        });
    }

    // Account subjects endpoints
    async getAccountSubjects(bookId) {
        const data = await this.request(`/api/accounts/subjects/book/${bookId}`);
        return data.accountSubjects || [];
    }

    async createAccountSubject(bookId, name, sortOrder = 0) {
        const data = await this.request(`/api/accounts/subjects/book/${bookId}`, {
            method: 'POST',
            body: JSON.stringify({ name, sort_order: sortOrder })
        });
        return data;
    }

    async deleteAccountSubject(subjectId) {
        return await this.request(`/api/accounts/subjects/${subjectId}`, {
            method: 'DELETE'
        });
    }

    async createSubAccount(subjectId, name, sortOrder = 0) {
        const data = await this.request(`/api/accounts/sub-accounts/subject/${subjectId}`, {
            method: 'POST',
            body: JSON.stringify({ name, sort_order: sortOrder })
        });
        return data;
    }

    async deleteSubAccount(subAccountId) {
        return await this.request(`/api/accounts/sub-accounts/${subAccountId}`, {
            method: 'DELETE'
        });
    }

    // Recipient emails endpoints (User-level management)
    async getAllRecipients() {
        const data = await this.request('/api/accounts/recipients');
        return data.recipients || [];
    }

    async createRecipientWithBooks(name, email, bookIds = [], sortOrder = 0) {
        const data = await this.request('/api/accounts/recipients', {
            method: 'POST',
            body: JSON.stringify({ name, email, book_ids: bookIds, sort_order: sortOrder })
        });
        return data;
    }

    async updateRecipient(recipientId, name, email, bookIds = [], sortOrder = 0) {
        const data = await this.request(`/api/accounts/recipients/${recipientId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, email, book_ids: bookIds, sort_order: sortOrder })
        });
        return data;
    }

    async deleteRecipient(recipientId) {
        return await this.request(`/api/accounts/recipients/${recipientId}`, {
            method: 'DELETE'
        });
    }

    // Legacy methods (for backward compatibility)
    async getRecipients(bookId) {
        const data = await this.request(`/api/accounts/recipients/book/${bookId}`);
        return data.recipients || [];
    }

    // Receipts endpoints
    async uploadReceipt(bookId, file) {
        const formData = new FormData();
        formData.append('file', file);

        const url = `${this.baseURL}/api/receipts/book/${bookId}/upload`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        return data;
    }

    async getReceipts(bookId) {
        const data = await this.request(`/api/receipts/book/${bookId}`);
        return data.receipts || [];
    }

    async downloadReceipt(receiptId) {
        const url = `${this.baseURL}/api/receipts/${receiptId}/download`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Download failed');
        }

        return response.blob();
    }

    async deleteReceipt(receiptId) {
        return await this.request(`/api/receipts/${receiptId}`, {
            method: 'DELETE'
        });
    }

    // Subscription API
    async getSubscription() {
        const response = await this.request('/api/auth/me');
        return response.subscription;
    }

    async subscribe(plan, cardLast4, cardName) {
        return await this.request('/api/auth/subscribe', {
            method: 'POST',
            body: JSON.stringify({
                plan: plan,
                card_last4: cardLast4,
                card_name: cardName
            })
        });
    }

    async unsubscribe() {
        return await this.request('/api/auth/unsubscribe', {
            method: 'POST'
        });
    }

    // Email endpoints
    async sendMonthlyReport(params) {
        return await this.request('/api/emails/monthly-report', {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    async sendTestEmail(recipientEmail) {
        return await this.request('/api/emails/test', {
            method: 'POST',
            body: JSON.stringify({ recipientEmail })
        });
    }

    // Stripe payment endpoints
    async createCheckoutSession(plan, returnUrl, couponCode) {
        return await this.request('/api/stripe/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ plan, returnUrl, couponCode })
        });
    }

    async getCustomerPortalUrl() {
        return await this.request('/api/stripe/customer-portal', {
            method: 'POST'
        });
    }

    // Coupon endpoints
    async validateCoupon(code, plan) {
        return await this.request('/api/coupons/validate', {
            method: 'POST',
            body: JSON.stringify({ code, plan })
        });
    }

    async getAllCoupons() {
        return await this.request('/api/coupons');
    }

    async createCoupon(couponData) {
        return await this.request('/api/coupons', {
            method: 'POST',
            body: JSON.stringify(couponData)
        });
    }

    async updateCoupon(couponId, updates) {
        return await this.request(`/api/coupons/${couponId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    async deleteCoupon(couponId) {
        return await this.request(`/api/coupons/${couponId}`, {
            method: 'DELETE'
        });
    }

    async getCouponRedemptions(couponId, userId) {
        const params = new URLSearchParams();
        if (couponId) params.append('coupon_id', couponId);
        if (userId) params.append('user_id', userId);
        
        return await this.request(`/api/coupons/redemptions?${params.toString()}`);
    }

    async syncCouponWithStripe(couponId) {
        return await this.request(`/api/coupons/${couponId}/sync-stripe`, {
            method: 'POST'
        });
    }

    async getCouponStats() {
        return await this.request('/api/coupons/stats');
    }

    async getCouponHistory(couponId, params) {
        const queryString = params ? `?${params.toString()}` : '';
        return await this.request(`/api/coupons/${couponId}/history${queryString}`);
    }

    // ========================================
    // User-Level Recipient Management APIs
    // ========================================

    // ユーザーの全連絡先を取得（出納帳の割り当て情報含む）
    async getRecipientsWithBooks() {
        return await this.request('/api/accounts/recipients');
    }

    // 新規連絡先を作成
    async createRecipient(name, email) {
        return await this.request('/api/accounts/recipients', {
            method: 'POST',
            body: JSON.stringify({ name, email })
        });
    }

    // 連絡先を更新
    async updateRecipient(recipientId, name, email) {
        return await this.request(`/api/accounts/recipients/${recipientId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, email })
        });
    }

    // 連絡先を削除
    async deleteRecipient(recipientId) {
        return await this.request(`/api/accounts/recipients/${recipientId}`, {
            method: 'DELETE'
        });
    }

    // 連絡先を出納帳に割り当て
    async assignRecipientToBook(recipientId, bookId) {
        return await this.request(`/api/accounts/recipients/${recipientId}/books/${bookId}`, {
            method: 'POST'
        });
    }

    // 連絡先の出納帳割り当てを解除
    async unassignRecipientFromBook(recipientId, bookId) {
        return await this.request(`/api/accounts/recipients/${recipientId}/books/${bookId}`, {
            method: 'DELETE'
        });
    }
}

// Export singleton instance
window.apiClient = new APIClient();
