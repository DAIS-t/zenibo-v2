// Cash Book Application - Frontend Logic with Multiple Books Support

class CashBookApp {
    constructor() {
        this.books = []; // All cash books
        this.currentBookId = null; // Currently selected book ID
        this.subscription = null; // Subscription info
        this.selectedPlan = null; // Selected plan for payment
        this.currentReceiptImage = null; // Current receipt image data
        this.currentReceiptMetadata = null; // Metadata for PDF filename
        this.accountSubjects = []; // Account subjects
        this.pendingReceipts = []; // Pending receipts (quick save)
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupTabs();
        this.setDefaultDate();
        
        // Check authentication
        if (!window.apiClient.isAuthenticated()) {
            this.showAuthModal();
            return;
        }

        // Load data from API
        try {
            this.showLoading();
            await this.loadBooksFromAPI();
            await this.loadSubscriptionFromAPI();
            this.hideAuthModal();
            this.hideLoading();
            
            this.updateUIBasedOnPlan();
            this.updatePendingCount();
            
            // If no books exist, show modal
            if (this.books.length === 0) {
                this.showBookModal();
            } else {
                // Load last used book or first book
                const lastBookId = localStorage.getItem('cashbook_last_book_id');
                const book = this.books.find(b => b.id == lastBookId);
                if (book) {
                    await this.switchToBook(book.id);
                } else {
                    await this.switchToBook(this.books[0].id);
                }
            }
        } catch (error) {
            this.hideLoading();
            console.error('Initialization error:', error);
            
            // Check if it's an authentication error
            if (error.message && (error.message.includes('401') || error.message.includes('403') || error.message.includes('Unauthorized'))) {
                this.showAuthModal();
                this.showAuthError('セッションが無効です。再度ログインしてください。');
                window.apiClient.clearToken();
            } else {
                // Other errors - still show auth modal but with different message
                console.error('Unexpected error during initialization:', error);
                this.showAuthModal();
                this.showAuthError('データの読み込みに失敗しました。再度ログインしてください。');
                window.apiClient.clearToken();
            }
        }
    }

    // Book Management (API-integrated)
    getCurrentBook() {
        return this.books.find(b => b.id == this.currentBookId);
    }

    async createBook(businessName, accountName) {
        try {
            const book = await window.apiClient.createBook(businessName, accountName);
            
            // Convert API format to app format
            const appBook = {
                id: book.id,
                businessName: book.business_name,
                accountName: book.account_name,
                settings: {
                    recipientEmails: [],
                    openingBalance: book.opening_balance || 0,
                    exportFormat: book.export_format || 'mf'
                },
                transactions: [],
                createdAt: book.created_at
            };
            
            this.books.push(appBook);
            return appBook;
        } catch (error) {
            console.error('Failed to create book:', error);
            throw error;
        }
    }

    async switchToBook(bookId) {
        this.currentBookId = bookId;
        localStorage.setItem('cashbook_last_book_id', bookId);
        
        this.updateBookDisplay();
        
        // Load data for this book from API
        await this.loadAccountSubjectsFromAPI(bookId);
        await this.loadTransactionsFromAPI(bookId);
        
        this.renderTransactions();
        this.loadSettings();
        this.loadPendingReceipts(); // Load pending receipts for this book
        this.updatePendingCount(); // Update UI
        this.populateMonthFilter();
    }

    updateBookDisplay() {
        const book = this.getCurrentBook();
        if (book) {
            const displayName = `${book.businessName} - ${book.accountName}`;
            document.getElementById('current-book-name').textContent = displayName;
        } else {
            document.getElementById('current-book-name').textContent = '出納帳を選択';
        }
    }

    async deleteBook(bookId) {
        try {
            this.showLoading();
            await window.apiClient.deleteBook(bookId);
            
            // Remove from local list
            this.books = this.books.filter(b => b.id != bookId);

            if (this.currentBookId == bookId) {
                if (this.books.length > 0) {
                    await this.switchToBook(this.books[0].id);
                } else {
                    this.currentBookId = null;
                    this.updateBookDisplay();
                    this.renderTransactions();
                }
            }
            
            this.hideLoading();
            this.showToast('出納帳を削除しました');
        } catch (error) {
            this.hideLoading();
            console.error('Delete book error:', error);
            alert('出納帳の削除に失敗しました: ' + error.message);
        }
    }

    // Modal Management
    showBookModal() {
        document.getElementById('book-modal').classList.remove('hidden');
        this.renderBookList();
    }

    hideBookModal() {
        document.getElementById('book-modal').classList.add('hidden');
    }

    renderBookList() {
        const bookList = document.getElementById('book-list');
        const emptyState = document.getElementById('empty-book-state');

        if (this.books.length === 0) {
            bookList.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        bookList.innerHTML = this.books.map(book => {
            const isActive = book.id === this.currentBookId;
            const transactionCount = book.transactions.length;
            const displayName = `${book.businessName} - ${book.accountName}`;

            return `
                <div class="border ${isActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white'} rounded-lg p-4 hover:shadow-md transition">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-bold text-gray-800">${this.escapeHtml(displayName)}</h4>
                                ${isActive ? '<span class="px-2 py-1 bg-indigo-500 text-white text-xs rounded">使用中</span>' : ''}
                            </div>
                            <p class="text-sm text-gray-600">取引件数: ${transactionCount}件</p>
                            <p class="text-xs text-gray-400 mt-1">作成日: ${this.formatDate(book.createdAt.split('T')[0])}</p>
                        </div>
                        <div class="flex gap-2">
                            ${!isActive ? `
                                <button onclick="app.switchToBook('${book.id}')" class="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-sm">
                                    選択
                                </button>
                            ` : ''}
                            <button onclick="app.confirmDeleteBook('${book.id}')" class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    confirmDeleteBook(bookId) {
        const book = this.books.find(b => b.id === bookId);
        if (confirm(`「${book.businessName} - ${book.accountName}」を削除しますか？\n\nこの操作は取り消せません。取引データも全て削除されます。`)) {
            this.deleteBook(bookId);
            this.renderBookList();
            this.showToast('出納帳を削除しました');
        }
    }

    // Data Management
    getCurrentTransactions() {
        const book = this.getCurrentBook();
        return book ? book.transactions : [];
    }

    saveCurrentTransactions(transactions) {
        const book = this.getCurrentBook();
        if (book) {
            book.transactions = transactions;
            this.saveBooks();
        }
    }

    getCurrentSettings() {
        const book = this.getCurrentBook();
        return book ? book.settings : { recipientEmail: '', openingBalance: 0 };
    }

    saveCurrentSettings(settings) {
        const book = this.getCurrentBook();
        if (book) {
            book.settings = settings;
            this.saveBooks();
        }
    }

    // Tab Management
    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
            btn.classList.add('text-gray-500');
        });
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        activeBtn.classList.remove('text-gray-500');
        activeBtn.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Refresh data when switching tabs
        if (tabName === 'list') {
            this.renderTransactions();
        } else if (tabName === 'invoice') {
            this.updateUIBasedOnPlan();
            loadPlanInfo(); // Load pricing plan info for invoice tab
        } else if (tabName === 'receipt') {
            this.renderReceiptFiles();
        } else if (tabName === 'accounts') {
            this.renderAccountsList();
            this.populateAccountSelects();
        } else if (tabName === 'members') {
            loadTeamMembers();
        } else if (tabName === 'settings') {
            this.updateUIBasedOnPlan();
        } else if (tabName === 'entry') {
            this.updatePendingCount();
            this.renderPendingReceipts();
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Auth forms
        document.getElementById('show-register-btn').addEventListener('click', () => {
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('register-form').classList.remove('hidden');
            document.getElementById('auth-error').classList.add('hidden');
        });

        document.getElementById('show-login-btn').addEventListener('click', () => {
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('auth-error').classList.add('hidden');
        });

        document.getElementById('login-form-element').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        document.getElementById('register-form-element').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });

        // Book switcher
        document.getElementById('switch-book-btn').addEventListener('click', () => {
            this.showBookModal();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.hideBookModal();
        });

        // New book form
        document.getElementById('new-book-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateBook();
        });

        // Entry form
        document.getElementById('entry-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddTransaction();
        });

        // Date range filter
        document.getElementById('apply-filter-btn').addEventListener('click', () => {
            this.renderTransactions();
        });

        document.getElementById('clear-filter-btn').addEventListener('click', () => {
            document.getElementById('filter-start-date').value = '';
            document.getElementById('filter-end-date').value = '';
            document.getElementById('filter-keyword').value = '';
            document.getElementById('filter-min-amount').value = '';
            document.getElementById('filter-max-amount').value = '';
            document.getElementById('filter-account-subject').value = '';
            this.renderTransactions();
        });

        // Print button
        document.getElementById('print-btn').addEventListener('click', () => {
            window.print();
        });

        // Monthly closing
        document.getElementById('preview-btn').addEventListener('click', () => {
            this.previewMonthlyClosing();
        });

        document.getElementById('export-csv-btn').addEventListener('click', () => {
            this.exportToCSV();
        });

        document.getElementById('send-email-btn').addEventListener('click', () => {
            this.sendMonthlyClosing();
        });

        // Settings
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            this.handleSaveSettings();
        });

        // Export format selection
        document.querySelectorAll('.export-format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const format = e.currentTarget.dataset.format;
                this.selectExportFormat(format);
            });
        });

        document.getElementById('export-all-btn').addEventListener('click', () => {
            this.exportAllData();
        });

        document.getElementById('clear-data-btn').addEventListener('click', () => {
            if (confirm('本当に全てのデータを削除しますか？この操作は取り消せません。')) {
                this.clearAllData();
            }
        });

        // Account subject change - update sub-account options
        document.getElementById('account-subject').addEventListener('change', () => {
            this.updateSubAccountSelect();
        });

        // Receipt image upload
        document.getElementById('receipt-image').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.currentReceiptImage = event.target.result;
                    document.getElementById('receipt-preview-img').src = event.target.result;
                    document.getElementById('receipt-preview').classList.remove('hidden');
                    this.updatePendingCount(); // Show quick save button
                };
                reader.readAsDataURL(file);
            }
        });

        // Quick save buttons (multiple locations)
        document.getElementById('quick-save-btn').addEventListener('click', () => {
            this.handleQuickSave();
        });
        
        document.getElementById('header-quick-save-btn').addEventListener('click', () => {
            this.handleQuickSave();
        });
        
        document.getElementById('inline-quick-save-btn').addEventListener('click', () => {
            this.handleQuickSave();
        });

        // Edit modal
        document.getElementById('close-edit-modal-btn').addEventListener('click', () => {
            this.hideEditModal();
        });

        document.getElementById('cancel-edit-btn').addEventListener('click', () => {
            this.hideEditModal();
        });

        document.getElementById('edit-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEditTransaction();
        });

        // Edit account subject change
        document.getElementById('edit-account-subject').addEventListener('change', () => {
            this.updateEditSubAccountSelect();
        });

        // Payment modal
        document.getElementById('close-payment-modal-btn').addEventListener('click', () => {
            this.hidePaymentModal();
        });

        document.getElementById('payment-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePayment();
        });

        // Card number formatting
        document.getElementById('card-number').addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s/g, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });

        // Expiry date formatting
        document.getElementById('card-expiry').addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.slice(0, 2) + '/' + value.slice(2, 4);
            }
            e.target.value = value;
        });

        // CVV number only
        document.getElementById('card-cvv').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
    }

    // Book Creation
    async handleCreateBook() {
        const businessName = document.getElementById('new-business-name').value.trim();
        const accountName = document.getElementById('new-account-name').value.trim();

        if (!businessName || !accountName) {
            alert('事業者名と管理口は必須です');
            return;
        }

        try {
            this.showLoading();
            
            const newBook = await this.createBook(businessName, accountName);
            await this.switchToBook(newBook.id);
            
            this.hideLoading();
            this.hideBookModal();
            this.showToast('新しい出納帳を作成しました');

            // Reset form
            document.getElementById('new-book-form').reset();
        } catch (error) {
            this.hideLoading();
            console.error('Create book error:', error);
            
            // Check if it's a plan limit error
            if (error.message.includes('limit')) {
                alert(error.message);
                this.hideBookModal();
                this.switchTab('invoice');
            } else {
                alert('出納帳の作成に失敗しました: ' + error.message);
            }
        }
    }

    // Transaction Management
    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
    }

    async handleAddTransaction() {
        if (!this.currentBookId) {
            alert('出納帳を選択してください');
            this.showBookModal();
            return;
        }

        try {
            this.showLoading();
            
            const date = document.getElementById('date').value;
            const client = document.getElementById('client').value;
            const amount = parseInt(document.getElementById('amount').value);
            const accountSubjectId = document.getElementById('account-subject').value;
            const subAccount = document.getElementById('sub-account').value;
            
            // Upload receipt if exists
            let receiptId = null;
            if ((this.subscription?.plan === 'basic' || this.subscription?.plan === 'professional') && this.currentReceiptImage) {
                try {
                    // Convert base64 to file
                    const blob = await fetch(this.currentReceiptImage).then(r => r.blob());
                    const file = new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
                    
                    const uploadResult = await window.apiClient.uploadReceipt(this.currentBookId, file);
                    receiptId = uploadResult.receipt_id;
                } catch (uploadError) {
                    console.error('Receipt upload failed:', uploadError);
                    // Continue without receipt
                }
            }
            
            const transactionData = {
                date: date,
                type: document.getElementById('type').value,
                description: document.getElementById('description').value,
                client: client || null,
                amount: amount,
                account_subject_id: accountSubjectId ? parseInt(accountSubjectId) : null,
                sub_account_id: subAccount ? parseInt(subAccount) : null,
                tax_code: document.getElementById('tax-type').value || null,
                receipt_id: receiptId
            };

            const newTransaction = await window.apiClient.createTransaction(this.currentBookId, transactionData);
            console.log('Transaction created:', newTransaction);

            // Reload transactions
            await this.loadTransactionsFromAPI(this.currentBookId);
            
            this.hideLoading();
            this.showToast('取引を登録しました');
            
            document.getElementById('entry-form').reset();
            this.setDefaultDate();
            this.removeReceiptImage();
            this.renderTransactions();
        } catch (error) {
            this.hideLoading();
            console.error('Add transaction error:', error);
            
            // Check if it's a plan limit error
            if (error.message.includes('limit')) {
                alert(error.message);
                this.switchTab('invoice');
            } else {
                alert('取引の登録に失敗しました: ' + error.message);
            }
        }
    }

    async deleteTransaction(id) {
        if (!confirm('この取引を削除しますか？')) {
            return;
        }

        try {
            this.showLoading();
            await window.apiClient.deleteTransaction(id);
            
            // Reload transactions
            await this.loadTransactionsFromAPI(this.currentBookId);
            
            this.hideLoading();
            this.renderTransactions();
            this.showToast('取引を削除しました');
        } catch (error) {
            this.hideLoading();
            console.error('Delete transaction error:', error);
            alert('取引の削除に失敗しました: ' + error.message);
        }
    }

    // Rendering
    renderTransactions() {
        // Get all filter values
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        const keyword = document.getElementById('filter-keyword').value.toLowerCase().trim();
        const minAmount = document.getElementById('filter-min-amount').value;
        const maxAmount = document.getElementById('filter-max-amount').value;
        const accountSubjectId = document.getElementById('filter-account-subject').value;
        
        let filtered = this.getCurrentTransactions();
        const filterConditions = [];

        // Apply date range filter
        if (startDate && endDate) {
            filtered = filtered.filter(t => t.date >= startDate && t.date <= endDate);
            filterConditions.push(`期間: ${startDate} ～ ${endDate}`);
        } else if (startDate) {
            filtered = filtered.filter(t => t.date >= startDate);
            filterConditions.push(`期間: ${startDate} 以降`);
        } else if (endDate) {
            filtered = filtered.filter(t => t.date <= endDate);
            filterConditions.push(`期間: ${endDate} まで`);
        }
        
        // Apply keyword filter (search in description and client)
        if (keyword) {
            filtered = filtered.filter(t => 
                t.description.toLowerCase().includes(keyword) ||
                t.client.toLowerCase().includes(keyword)
            );
            filterConditions.push(`キーワード: "${keyword}"`);
        }
        
        // Apply amount range filter
        if (minAmount || maxAmount) {
            const min = minAmount ? parseFloat(minAmount) : 0;
            const max = maxAmount ? parseFloat(maxAmount) : Infinity;
            filtered = filtered.filter(t => t.amount >= min && t.amount <= max);
            if (minAmount && maxAmount) {
                filterConditions.push(`金額: ¥${this.formatNumber(min)} ～ ¥${this.formatNumber(max)}`);
            } else if (minAmount) {
                filterConditions.push(`金額: ¥${this.formatNumber(min)} 以上`);
            } else {
                filterConditions.push(`金額: ¥${this.formatNumber(max)} 以下`);
            }
        }
        
        // Apply account subject filter
        if (accountSubjectId) {
            filtered = filtered.filter(t => t.account_subject_id == accountSubjectId);
            const subjectName = this.getAccountSubjectName(parseInt(accountSubjectId));
            filterConditions.push(`勘定科目: ${subjectName}`);
        }
        
        // Update filter status
        if (filterConditions.length > 0) {
            this.updateFilterStatus(`絞込中（${filtered.length}件）: ${filterConditions.join(', ')}`);
        } else {
            this.updateFilterStatus(`全期間の取引を表示中（${filtered.length}件）`);
        }

        const tbody = document.getElementById('transaction-list');
        const emptyState = document.getElementById('empty-state');

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
            this.updateTotals([], 0);
            return;
        }

        emptyState.classList.add('hidden');

        const settings = this.getCurrentSettings();
        let balance = settings.openingBalance || 0;
        let totalIncome = 0;
        let totalExpense = 0;

        tbody.innerHTML = filtered.map(transaction => {
            const income = transaction.type === 'income' ? transaction.amount : 0;
            const expense = transaction.type === 'expense' ? transaction.amount : 0;
            balance += income - expense;
            totalIncome += income;
            totalExpense += expense;

            const taxLabel = this.getTaxLabel(transaction.taxType);

            // PDF icon for receipt attachment
            const pdfIcon = transaction.receiptPDF 
                ? `<button onclick="app.viewReceiptPDF(${transaction.id})" class="text-blue-500 hover:text-blue-700 mr-2" title="証憑PDFを表示">
                       <i class="fas fa-file-pdf"></i>
                   </button>`
                : '';

            // Get account subject names
            const accountSubjectName = transaction.account_subject_id 
                ? this.getAccountSubjectName(transaction.account_subject_id)
                : '<span class="text-gray-400 text-xs">未設定</span>';
            
            const subAccountName = transaction.sub_account_id 
                ? this.getSubAccountName(transaction.sub_account_id)
                : '<span class="text-gray-400 text-xs">未設定</span>';

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 whitespace-nowrap">${this.formatDate(transaction.date)}</td>
                    <td class="px-4 py-3">${this.escapeHtml(transaction.description)}</td>
                    <td class="px-4 py-3">${this.escapeHtml(transaction.client)}</td>
                    <td class="px-4 py-3 text-sm">${accountSubjectName}</td>
                    <td class="px-4 py-3 text-sm">${subAccountName}</td>
                    <td class="px-4 py-3 text-right text-blue-600">${income > 0 ? this.formatCurrency(income) : ''}</td>
                    <td class="px-4 py-3 text-right text-red-600">${expense > 0 ? this.formatCurrency(expense) : ''}</td>
                    <td class="px-4 py-3 text-right font-semibold">${this.formatCurrency(balance)}</td>
                    <td class="px-4 py-3 text-center text-xs">${taxLabel}</td>
                    <td class="px-4 py-3 text-center no-print">
                        ${pdfIcon}
                        <button onclick="app.showEditModal(${transaction.id})" class="text-indigo-500 hover:text-indigo-700 mr-2" title="編集">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="app.deleteTransaction(${transaction.id})" class="text-red-500 hover:text-red-700" title="削除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        this.updateTotals(filtered, balance);
    }

    updateTotals(transactions, finalBalance) {
        const totalIncome = transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalExpense = transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        document.getElementById('total-income').textContent = this.formatCurrency(totalIncome);
        document.getElementById('total-expense').textContent = this.formatCurrency(totalExpense);
        document.getElementById('final-balance').textContent = this.formatCurrency(finalBalance);
    }

    updateFilterStatus(message) {
        const statusElement = document.getElementById('filter-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    populateMonthFilter() {
        // This function is no longer needed but kept for compatibility
        // Date range filter is now used instead
    }

    // Monthly Closing
    previewMonthlyClosing() {
        const startMonth = document.getElementById('closing-start-month').value;
        const endMonth = document.getElementById('closing-end-month').value;
        
        if (!startMonth || !endMonth) {
            alert('開始年月と終了年月を選択してください');
            return;
        }

        if (startMonth > endMonth) {
            alert('開始年月は終了年月より前に設定してください');
            return;
        }

        // Filter transactions within the month range
        const filtered = this.getCurrentTransactions().filter(t => {
            const transMonth = t.date.substring(0, 7); // YYYY-MM
            return transMonth >= startMonth && transMonth <= endMonth;
        });

        if (filtered.length === 0) {
            alert('指定された期間の取引データがありません');
            return;
        }

        const totalIncome = filtered
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalExpense = filtered
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        // Format period display
        const periodDisplay = startMonth === endMonth 
            ? `${startMonth}`
            : `${startMonth} ～ ${endMonth}`;

        document.getElementById('summary-period').textContent = periodDisplay;
        document.getElementById('summary-count').textContent = `${filtered.length}件`;
        document.getElementById('summary-income').textContent = this.formatCurrency(totalIncome);
        document.getElementById('summary-expense').textContent = this.formatCurrency(totalExpense);
        document.getElementById('summary-balance').textContent = this.formatCurrency(totalIncome - totalExpense);

        document.getElementById('closing-summary').classList.remove('hidden');
        document.getElementById('export-csv-btn').disabled = false;
        document.getElementById('send-email-btn').disabled = false;

        this.showToast('プレビューを表示しました');
    }

    exportToCSV() {
        const startMonth = document.getElementById('closing-start-month').value;
        const endMonth = document.getElementById('closing-end-month').value;
        
        if (!startMonth || !endMonth) {
            alert('開始年月と終了年月を選択してください');
            return;
        }

        // Filter transactions within the month range
        const filtered = this.getCurrentTransactions().filter(t => {
            const transMonth = t.date.substring(0, 7); // YYYY-MM
            return transMonth >= startMonth && transMonth <= endMonth;
        });

        if (filtered.length === 0) {
            alert('指定された期間の取引データがありません');
            return;
        }

        const book = this.getCurrentBook();
        const bookName = book ? `${book.businessName}_${book.accountName}` : '出納帳';
        const plan = this.subscription.plan || 'free';
        
        // 無料プランは基本形式のみ、有料プランは会計ソフト別選択可能
        let format = 'basic'; // デフォルトは基本形式
        if (plan === 'basic' || plan === 'professional') {
            format = book.settings.exportFormat || 'mf';
        }

        let csv = '\uFEFF'; // UTF-8 BOM
        
        // Generate CSV based on selected format
        if (format === 'basic') {
            csv += this.generateBasicCSV(filtered);
        } else {
            switch (format) {
                case 'mf':
                    csv += this.generateMFCloudCSV(filtered);
                    break;
                case 'freee':
                    csv += this.generateFreeeCSV(filtered);
                    break;
                case 'yayoi':
                    csv += this.generateYayoiCSV(filtered);
                    break;
                default:
                    csv += this.generateMFCloudCSV(filtered);
            }
        }

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const formatLabels = {
            'mf': 'MFクラウド',
            'freee': 'freee',
            'yayoi': '弥生'
        };
        
        const periodLabel = startMonth === endMonth 
            ? startMonth
            : `${startMonth}_${endMonth}`;
        
        const formatLabel = format === 'basic' ? '基本形式' : formatLabels[format];
        
        link.setAttribute('href', url);
        link.setAttribute('download', `現金出納帳_${formatLabel}_${bookName}_${periodLabel}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast('CSVファイルをダウンロードしました');
    }

    async sendMonthlyClosing() {
        const startMonth = document.getElementById('closing-start-month').value;
        const endMonth = document.getElementById('closing-end-month').value;
        
        if (!startMonth || !endMonth) {
            alert('開始年月と終了年月を選択してください');
            return;
        }

        const book = this.getCurrentBook();
        const settings = this.getCurrentSettings();
        
        // Get selected recipient
        const recipientSelect = document.getElementById('recipient-select');
        const selectedIndex = recipientSelect.value;
        
        if (!selectedIndex || selectedIndex === '') {
            alert('送付先を選択してください。\n\n設定タブで送付先メールアドレスを登録し、\nこの画面で送付先を選択してください。');
            return;
        }

        const recipientEmails = settings.recipientEmails || [];
        const selectedRecipient = recipientEmails[parseInt(selectedIndex)];
        
        if (!selectedRecipient) {
            alert('選択された送付先が見つかりません。\n\n設定タブで送付先メールアドレスを確認してください。');
            this.switchTab('settings');
            return;
        }

        // Filter transactions within the month range
        const filtered = this.getCurrentTransactions().filter(t => {
            const transMonth = t.date.substring(0, 7); // YYYY-MM
            return transMonth >= startMonth && transMonth <= endMonth;
        });

        if (filtered.length === 0) {
            alert('指定された期間の取引データがありません');
            return;
        }

        const totalIncome = filtered
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalExpense = filtered
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const periodLabel = startMonth === endMonth 
            ? startMonth
            : `${startMonth} ～ ${endMonth}`;

        const bookName = book ? `${book.businessName} - ${book.accountName}` : '出納帳';
        const format = book.settings.exportFormat || 'mf';
        const formatLabels = {
            'mf': 'MFクラウド会計',
            'freee': 'freee会計',
            'yayoi': '弥生会計'
        };

        // Confirm before sending
        const confirmMessage = `以下の内容で月次締めレポートをメールで送信します。\n\n` +
            `送付先: ${selectedRecipient.name} (${selectedRecipient.email})\n` +
            `出納帳: ${bookName}\n` +
            `対象期間: ${periodLabel}\n` +
            `取引件数: ${filtered.length}件\n` +
            `形式: ${formatLabels[format]}\n\n` +
            `送信してよろしいですか？`;

        if (!confirm(confirmMessage)) {
            return;
        }

        // Generate CSV based on export format
        let csvContent;
        if (format === 'mf') {
            csvContent = this.generateMFCloudCSV(filtered);
        } else if (format === 'freee') {
            csvContent = this.generateFreeeCSV(filtered);
        } else if (format === 'yayoi') {
            csvContent = this.generateYayoiCSV(filtered);
        } else {
            csvContent = this.generateBasicCSV(filtered);
        }

        const csvFilename = `月次締め_${bookName}_${startMonth.replace(/\//g, '-')}_${endMonth.replace(/\//g, '-')}.csv`;

        // Show loading
        this.showToast('メール送信中...', 'info');

        // Send email via API
        try {
            const user = await window.apiClient.getCurrentUser();
            await window.apiClient.sendMonthlyReport({
                recipientEmail: selectedRecipient.email,
                userName: selectedRecipient.name,
                businessName: book.businessName,
                accountName: book.accountName,
                startDate: startMonth,
                endDate: endMonth,
                totalIncome: totalIncome,
                totalExpense: totalExpense,
                balance: totalIncome - totalExpense,
                transactionCount: filtered.length,
                csvContent: csvContent,
                csvFilename: csvFilename
            });

            // Success
            this.showToast(`✅ 月次締めレポートを送信しました（${selectedRecipient.email}）`, 'success');
            
            alert(`✅ 月次締めレポートをメール送信しました\n\n` +
                `送付先: ${selectedRecipient.name} (${selectedRecipient.email})\n` +
                `出納帳: ${bookName}\n` +
                `対象期間: ${periodLabel}\n` +
                `取引件数: ${filtered.length}件\n` +
                `入金合計: ${this.formatCurrency(totalIncome)}\n` +
                `出金合計: ${this.formatCurrency(totalExpense)}\n` +
                `差引残高: ${this.formatCurrency(totalIncome - totalExpense)}\n\n` +
                `CSVファイルが添付されています。`);
        } catch (error) {
            console.error('Failed to send monthly report:', error);
            this.showToast('❌ メール送信に失敗しました', 'error');
            alert(`メール送信に失敗しました\n\nエラー: ${error.message}`);
        }
    }

    // 基本形式のCSV生成（無料プラン用）
    generateBasicCSV(transactions) {
        let csv = '取引日,区分,取引内容,取引先,勘定科目,補助科目,入金,出金,残高,消費税区分\n';
        
        let balance = this.getCurrentSettings().openingBalance || 0;
        
        transactions.forEach(t => {
            const type = t.type === 'income' ? '入金' : '出金';
            const income = t.type === 'income' ? t.amount : '';
            const expense = t.type === 'expense' ? t.amount : '';
            
            if (t.type === 'income') {
                balance += t.amount;
            } else {
                balance -= t.amount;
            }
            
            const description = t.description.replace(/"/g, '""');
            const client = t.client.replace(/"/g, '""');
            const accountSubject = this.getAccountSubjectName(t.account_subject_id) || '';
            const subAccount = t.sub_account_id ? this.getSubAccountName(t.account_subject_id, t.sub_account_id) : '';
            
            // 消費税区分のラベル
            const taxLabels = {
                'tax10': '課税10%',
                'tax8': '軽減税率8%',
                'nontax': '非課税',
                'taxfree': '免税',
                'notaxable': '不課税'
            };
            const taxType = taxLabels[t.taxType] || '';
            
            csv += `${t.date},"${type}","${description}","${client}","${accountSubject}","${subAccount}",${income},${expense},${balance},"${taxType}"\n`;
        });
        
        return csv;
    }

    // MFクラウド会計形式のCSV生成
    generateMFCloudCSV(transactions) {
        let csv = '取引No,取引日,借方勘定科目,借方補助科目,借方部門,借方税区分,借方金額,借方税額,貸方勘定科目,貸方補助科目,貸方部門,貸方税区分,貸方金額,貸方税額,摘要,取引先,品目,メモタグ,期日\n';
        
        transactions.forEach((t, index) => {
            const taxCode = this.getMFTaxCode(t.taxType);
            const amount = t.amount;
            const description = t.description.replace(/"/g, '""');
            const client = t.client.replace(/"/g, '""');
            
            if (t.type === 'income') {
                // 入金: 借方=現金、貸方=売上等
                csv += `${index + 1},${t.date},現金,,,,${amount},,売上高,,,,${amount},,"${description}","${client}",,,,\n`;
            } else {
                // 出金: 借方=経費等、貸方=現金
                csv += `${index + 1},${t.date},経費,,,,${amount},,現金,,,,${amount},,"${description}","${client}",,,,\n`;
            }
        });
        
        return csv;
    }

    // freee会計形式のCSV生成
    generateFreeeCSV(transactions) {
        let csv = '収支区分,管理番号,発生日,決済期日,取引先,勘定科目,税区分,金額,税額,備考,品目,部門,メモタグ,セグメント1,セグメント2,セグメント3\n';
        
        transactions.forEach(t => {
            const taxCode = this.getFreeeTaxCode(t.taxType);
            const amount = t.amount;
            const description = t.description.replace(/"/g, '""');
            const client = t.client.replace(/"/g, '""');
            const type = t.type === 'income' ? '収入' : '支出';
            const account = t.type === 'income' ? '売上高' : '経費';
            
            csv += `${type},,${t.date},,${client},${account},${taxCode},${amount},,"${description}",,,,,,\n`;
        });
        
        return csv;
    }

    // 弥生会計形式のCSV生成
    generateYayoiCSV(transactions) {
        let csv = '伝票No,決算,取引日付,借方勘定科目,借方補助科目,借方部門,借方税区分,借方金額,借方税額,貸方勘定科目,貸方補助科目,貸方部門,貸方税区分,貸方金額,貸方税額,摘要,期日,証憑番号,入力マシン,入力ユーザ,入力アプリ,入力会社,入力日付\n';
        
        transactions.forEach((t, index) => {
            const taxCode = this.getYayoiTaxCode(t.taxType);
            const amount = t.amount;
            const description = t.description.replace(/"/g, '""');
            
            if (t.type === 'income') {
                // 入金: 借方=現金、貸方=売上高
                csv += `${index + 1},,${t.date},現金,,,${taxCode},${amount},,売上高,,,${taxCode},${amount},,"${description}",,,,,,,,\n`;
            } else {
                // 出金: 借方=経費、貸方=現金
                csv += `${index + 1},,${t.date},経費,,,${taxCode},${amount},,現金,,,${taxCode},${amount},,"${description}",,,,,,,,\n`;
            }
        });
        
        return csv;
    }

    // 勘定科目名を取得
    getAccountSubjectName(accountSubjectId) {
        if (!accountSubjectId) return '';
        const subject = this.accountSubjects.find(s => s.id === accountSubjectId);
        return subject ? subject.name : '';
    }

    // 税区分コード変換
    getMFTaxCode(taxType) {
        const codes = {
            'taxable-10': '課税売上10%',
            'taxable-8': '課税売上8%',
            'non-taxable': '非課税売上',
            'tax-exempt': '免税売上',
            'out-of-scope': '対象外'
        };
        return codes[taxType] || '課税売上10%';
    }

    getFreeeTaxCode(taxType) {
        const codes = {
            'taxable-10': '課税売上10%',
            'taxable-8': '軽減税率8%',
            'non-taxable': '非課税売上',
            'tax-exempt': '免税売上',
            'out-of-scope': '対象外'
        };
        return codes[taxType] || '課税売上10%';
    }

    getYayoiTaxCode(taxType) {
        const codes = {
            'taxable-10': '課売10%',
            'taxable-8': '課売8%',
            'non-taxable': '非課税',
            'tax-exempt': '免税',
            'out-of-scope': '対象外'
        };
        return codes[taxType] || '課売10%';
    }

    // Settings
    async loadSettings() {
        const book = this.getCurrentBook();
        if (!book) return;

        // 注: 連絡先管理は新仕様（ユーザーレベル）に移行しました
        // 設定タブの「連絡先を管理」ボタンからモーダルで管理します

        document.getElementById('business-name').value = book.businessName || '';
        document.getElementById('account-name').value = book.accountName || '';
        document.getElementById('opening-balance').value = book.settings.openingBalance || 0;
        
        // Load export format setting
        const format = book.settings.exportFormat || 'mf';
        this.selectExportFormat(format);
    }

    async selectExportFormat(format) {
        const book = this.getCurrentBook();
        if (book) {
            book.settings.exportFormat = format;
            
            // Save to API if we have a current book ID
            if (this.currentBookId) {
                try {
                    await window.apiClient.updateBook(this.currentBookId, {
                        exportFormat: format
                    });
                } catch (error) {
                    console.error('Failed to update export format:', error);
                }
            }
        }

        // Update UI
        document.querySelectorAll('.export-format-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.format === format) {
                btn.classList.add('active');
            }
        });

        // Update label
        const formatLabels = {
            'mf': 'MFクラウド会計',
            'freee': 'freee会計',
            'yayoi': '弥生会計'
        };
        const label = document.getElementById('current-format-label');
        if (label) {
            label.textContent = formatLabels[format] || 'MFクラウド会計';
        }
    }

    updateRecipientSelect() {
        const book = this.getCurrentBook();
        if (!book) return;

        const select = document.getElementById('recipient-select');
        if (!select) return;

        // Clear existing options except the first one
        select.innerHTML = '<option value="">送付先を選択してください</option>';

        const recipientEmails = book.settings.recipientEmails || [];
        recipientEmails.forEach((recipient, index) => {
            if (recipient.email) {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${recipient.name} (${recipient.email})`;
                select.appendChild(option);
            }
        });

        // Disable send button if no recipients
        const sendBtn = document.getElementById('send-email-btn');
        if (sendBtn) {
            sendBtn.disabled = recipientEmails.length === 0;
        }
    }

    async handleSaveSettings() {
        const book = this.getCurrentBook();
        if (!book) {
            alert('出納帳を選択してください');
            return;
        }

        try {
            this.showLoading();
            
            // 1. Update book settings (business name, account name, opening balance, export format)
            const businessName = document.getElementById('business-name').value.trim();
            const accountName = document.getElementById('account-name').value.trim();
            const openingBalance = parseInt(document.getElementById('opening-balance').value) || 0;
            
            if (businessName && accountName) {
                await window.apiClient.updateBook(this.currentBookId, {
                    businessName,
                    accountName,
                    openingBalance,
                    exportFormat: book.settings.exportFormat || 'mf'
                });
                
                // Update local book data
                book.businessName = businessName;
                book.accountName = accountName;
                book.settings.openingBalance = openingBalance;
            }
            
            // 2. Save recipient emails via API
            // First, get existing recipients and delete them
            const existingRecipients = await window.apiClient.getRecipients(this.currentBookId);
            for (const recipient of existingRecipients) {
                await window.apiClient.deleteRecipient(recipient.id);
            }
            
            // Then create new recipients
            const recipientEmails = [];
            for (let i = 1; i <= 3; i++) {
                const name = document.getElementById(`recipient-name-${i}`).value.trim();
                const email = document.getElementById(`recipient-email-${i}`).value.trim();
                if (email) {
                    const recipientName = name || `送付先${i}`;
                    await window.apiClient.createRecipient(this.currentBookId, recipientName, email, i - 1);
                    recipientEmails.push({ name: recipientName, email });
                }
            }
            
            // Update local cache
            book.settings.recipientEmails = recipientEmails;
            
            this.hideLoading();
            this.updateBookDisplay();
            this.renderTransactions(); // Update balance calculations
            this.updateRecipientSelect(); // Update recipient dropdown
            this.showToast('設定を保存しました');
        } catch (error) {
            this.hideLoading();
            console.error('Save settings error:', error);
            alert('設定の保存に失敗しました: ' + error.message);
        }
    }

    // Data Export/Clear
    exportAllData() {
        const data = {
            books: this.books,
            currentBookId: this.currentBookId,
            exportDate: new Date().toISOString()
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `現金出納帳_全データ_${new Date().toISOString().split('T')[0]}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast('全データをエクスポートしました');
    }

    clearAllData() {
        if (!this.currentBookId) {
            alert('出納帳を選択してください');
            return;
        }

        const book = this.getCurrentBook();
        book.transactions = [];
        this.saveBooks();
        this.renderTransactions();
        this.populateMonthFilter();
        this.showToast('現在の出納帳のデータを削除しました');
    }

    // Utility Functions
    getTaxLabel(taxType) {
        const labels = {
            'taxable-10': '課税10%',
            'taxable-8': '軽減8%',
            'non-taxable': '非課税',
            'tax-exempt': '免税',
            'out-of-scope': '不課税'
        };
        return labels[taxType] || taxType;
    }

    getAccountSubjectName(accountSubjectId) {
        if (!this.accountSubjects || this.accountSubjects.length === 0) {
            return '';
        }
        const subject = this.accountSubjects.find(s => s.id === accountSubjectId);
        return subject ? this.escapeHtml(subject.name) : '';
    }

    getSubAccountName(subAccountId) {
        if (!this.accountSubjects || this.accountSubjects.length === 0) {
            return '';
        }
        // Find sub-account across all account subjects
        for (const subject of this.accountSubjects) {
            if (subject.sub_accounts && subject.sub_accounts.length > 0) {
                const subAccount = subject.sub_accounts.find(s => s.id === subAccountId);
                if (subAccount) {
                    return this.escapeHtml(subAccount.name);
                }
            }
        }
        return '';
    }

    formatDate(dateString) {
        // For transaction list, show full date in YYYY/MM/DD format
        if (dateString.includes('-')) {
            return dateString.replace(/-/g, '/');
        }
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}/${month}/${day}`;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('ja-JP', {
            style: 'currency',
            currency: 'JPY'
        }).format(amount);
    }
    
    formatNumber(number) {
        return new Intl.NumberFormat('ja-JP').format(number);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        
        // Reset classes
        toast.className = 'fixed bottom-4 right-4 px-6 py-3 bg-green-500 text-white rounded shadow-lg z-50';
        
        // Apply type-specific styling
        if (type === 'error') {
            toast.classList.add('bg-red-500');
            toast.classList.remove('bg-green-500', 'bg-blue-500');
        } else if (type === 'info') {
            toast.classList.add('bg-blue-500');
            toast.classList.remove('bg-green-500', 'bg-red-500');
        }
        
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    // Subscription Management
    loadSubscription() {
        const saved = localStorage.getItem('cashbook_subscription');
        if (saved) {
            this.subscription = JSON.parse(saved);
        }
    }

    // Deprecated: Subscription is now managed via API
    // saveSubscription() {
    //     localStorage.setItem('cashbook_subscription', JSON.stringify(this.subscription));
    // }

    // Account Subjects Management
    loadAccountSubjects() {
        const saved = localStorage.getItem('cashbook_account_subjects');
        if (saved) {
            this.accountSubjects = JSON.parse(saved);
        } else {
            // Initialize with default accounts for cash book
            this.accountSubjects = this.getDefaultAccountSubjects();
            this.saveAccountSubjects();
        }
    }

    saveAccountSubjects() {
        localStorage.setItem('cashbook_account_subjects', JSON.stringify(this.accountSubjects));
    }

    getDefaultAccountSubjects() {
        return [
            {
                id: 1,
                name: '売上高',
                subAccounts: ['講演料', 'コンサルティング料', '原稿料', '業務委託収入']
            },
            {
                id: 2,
                name: '外注費',
                subAccounts: ['デザイン外注', 'プログラミング外注', '専門家報酬']
            },
            {
                id: 3,
                name: '旅費交通費',
                subAccounts: ['電車代', 'タクシー代', '航空券', '宿泊費', '駐車場代']
            },
            {
                id: 4,
                name: '通信費',
                subAccounts: ['携帯電話', 'インターネット', '郵送料']
            },
            {
                id: 5,
                name: '消耗品費',
                subAccounts: ['文房具', '事務用品', 'PC周辺機器']
            },
            {
                id: 6,
                name: '会議費',
                subAccounts: ['打ち合わせ', '接待']
            },
            {
                id: 7,
                name: '広告宣伝費',
                subAccounts: ['Web広告', 'チラシ', '名刺']
            },
            {
                id: 8,
                name: '水道光熱費',
                subAccounts: ['電気代', 'ガス代', '水道代']
            },
            {
                id: 9,
                name: '地代家賃',
                subAccounts: ['事務所家賃', 'レンタルオフィス', '駐車場代']
            },
            {
                id: 10,
                name: '支払手数料',
                subAccounts: ['振込手数料', 'カード手数料', '税理士報酬']
            }
        ];
    }

    async addAccountSubject() {
        const name = document.getElementById('new-account-subject-name').value.trim();
        if (!name) {
            alert('勘定科目名を入力してください');
            return;
        }

        try {
            this.showLoading();
            await window.apiClient.createAccountSubject(this.currentBookId, name, this.accountSubjects.length);
            
            // Reload account subjects
            await this.loadAccountSubjectsFromAPI(this.currentBookId);
            
            this.hideLoading();
            this.renderAccountsList();
            document.getElementById('new-account-subject-name').value = '';
            this.showToast('勘定科目を追加しました');
        } catch (error) {
            this.hideLoading();
            console.error('Add account subject error:', error);
            alert('勘定科目の追加に失敗しました: ' + error.message);
        }
    }

    async addSubAccount() {
        const parentId = parseInt(document.getElementById('parent-account-select').value);
        const name = document.getElementById('new-sub-account-name').value.trim();

        if (!parentId) {
            alert('勘定科目を選択してください');
            return;
        }

        if (!name) {
            alert('補助科目名を入力してください');
            return;
        }

        try {
            this.showLoading();
            const account = this.accountSubjects.find(a => a.id === parentId);
            const sortOrder = account?.subAccounts?.length || 0;
            
            await window.apiClient.createSubAccount(parentId, name, sortOrder);
            
            // Reload account subjects
            await this.loadAccountSubjectsFromAPI(this.currentBookId);
            
            this.hideLoading();
            this.renderAccountsList();
            document.getElementById('new-sub-account-name').value = '';
            this.showToast('補助科目を追加しました');
        } catch (error) {
            this.hideLoading();
            console.error('Add sub account error:', error);
            alert('補助科目の追加に失敗しました: ' + error.message);
        }
    }

    async deleteAccountSubject(accountId) {
        if (!confirm('この勘定科目を削除しますか？\n補助科目も全て削除されます。')) {
            return;
        }

        try {
            this.showLoading();
            await window.apiClient.deleteAccountSubject(accountId);
            
            // Reload account subjects
            await this.loadAccountSubjectsFromAPI(this.currentBookId);
            
            this.hideLoading();
            this.renderAccountsList();
            this.showToast('勘定科目を削除しました');
        } catch (error) {
            this.hideLoading();
            console.error('Delete account subject error:', error);
            alert('勘定科目の削除に失敗しました: ' + error.message);
        }
    }

    async deleteSubAccount(accountId, subAccountId) {
        if (!confirm(`補助科目を削除しますか？`)) {
            return;
        }

        try {
            this.showLoading();
            await window.apiClient.deleteSubAccount(subAccountId);
            
            // Reload account subjects
            await this.loadAccountSubjectsFromAPI(this.currentBookId);
            
            this.hideLoading();
            this.renderAccountsList();
            this.showToast('補助科目を削除しました');
        } catch (error) {
            this.hideLoading();
            console.error('Delete sub account error:', error);
            alert('補助科目の削除に失敗しました: ' + error.message);
        }
    }

    // Fix renderAccountsList to use sub-account IDs
    renderAccountsListOld_BACKUP(accountId, subAccountName) {
        const account = this.accountSubjects.find(a => a.id === accountId);
        if (account) {
            account.subAccounts = account.subAccounts.filter(s => s !== subAccountName);
            this.saveAccountSubjects();
            this.renderAccountsList();
            this.populateAccountSelects();
            this.showToast('補助科目を削除しました');
        }
    }

    renderAccountsList() {
        const container = document.getElementById('accounts-list');
        if (!container) return;

        if (this.accountSubjects.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-8">勘定科目が登録されていません</p>';
            return;
        }

        container.innerHTML = this.accountSubjects.map(account => `
            <div class="border border-gray-300 rounded-lg p-4">
                <div class="flex justify-between items-start mb-3">
                    <h4 class="text-lg font-semibold text-gray-800">${this.escapeHtml(account.name)}</h4>
                    <button onclick="app.deleteAccountSubject(${account.id})" class="text-red-500 hover:text-red-700">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                ${account.subAccounts && account.subAccounts.length > 0 ? `
                    <div class="pl-4 space-y-2">
                        ${account.subAccounts.map(sub => {
                            const subId = typeof sub === 'object' ? sub.id : account.id;
                            const subName = typeof sub === 'object' ? sub.name : sub;
                            return `
                            <div class="flex justify-between items-center bg-gray-50 px-3 py-2 rounded">
                                <span class="text-sm text-gray-700">
                                    <i class="fas fa-angle-right mr-2 text-gray-400"></i>
                                    ${this.escapeHtml(subName)}
                                </span>
                                <button onclick="app.deleteSubAccount(${account.id}, ${subId})" class="text-red-400 hover:text-red-600 text-sm">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `}).join('')}
                    </div>
                ` : '<p class="text-sm text-gray-400 pl-4">補助科目なし</p>'}
            </div>
        `).join('');
    }

    populateAccountSelects() {
        // Populate account subject select in entry form
        const accountSelect = document.getElementById('account-subject');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">選択しない</option>' +
                this.accountSubjects.map(account => 
                    `<option value="${account.id}">${this.escapeHtml(account.name)}</option>`
                ).join('');
        }

        // Populate parent account select in accounts tab
        const parentSelect = document.getElementById('parent-account-select');
        if (parentSelect) {
            parentSelect.innerHTML = '<option value="">勘定科目を選択</option>' +
                this.accountSubjects.map(account => 
                    `<option value="${account.id}">${this.escapeHtml(account.name)}</option>`
                ).join('');
        }
        
        // Populate filter account subject select
        const filterSelect = document.getElementById('filter-account-subject');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">すべて</option>' +
                this.accountSubjects.map(account => 
                    `<option value="${account.id}">${this.escapeHtml(account.name)}</option>`
                ).join('');
        }
    }

    updateSubAccountSelect() {
        const accountId = parseInt(document.getElementById('account-subject').value);
        const subAccountSelect = document.getElementById('sub-account');
        
        if (!subAccountSelect) return;

        subAccountSelect.innerHTML = '<option value="">選択しない</option>';

        if (accountId) {
            const account = this.accountSubjects.find(a => a.id === accountId);
            if (account && account.sub_accounts && account.sub_accounts.length > 0) {
                subAccountSelect.innerHTML += account.sub_accounts.map(sub => 
                    `<option value="${sub.id}">${this.escapeHtml(sub.name)}</option>`
                ).join('');
                subAccountSelect.disabled = false;
            } else {
                subAccountSelect.disabled = true;
            }
        } else {
            subAccountSelect.disabled = true;
        }
    }

    // Pending Receipts Management (Quick Save)
    loadPendingReceipts() {
        const book = this.getCurrentBook();
        if (!book) return;
        
        const saved = localStorage.getItem(`pendingReceipts_${book.id}`);
        if (saved) {
            this.pendingReceipts = JSON.parse(saved);
        } else {
            this.pendingReceipts = [];
        }
    }

    savePendingReceipts() {
        const book = this.getCurrentBook();
        if (!book) return;
        
        localStorage.setItem(`pendingReceipts_${book.id}`, JSON.stringify(this.pendingReceipts));
    }

    handleQuickSave() {
        // Basic or Professional plan required
        if (this.subscription?.plan === 'free') {
            alert('証憑添付機能はBasic/Professionalプラン限定です。\n\nBasicプラン（¥330/月）またはProfessionalプラン（¥990/月〜）にアップグレードしてください。');
            this.switchTab('invoice');
            return;
        }

        if (!this.currentReceiptImage) {
            alert('証憑画像を撮影またはアップロードしてください');
            return;
        }

        const pendingReceipt = {
            id: Date.now(),
            image: this.currentReceiptImage,
            createdAt: new Date().toISOString()
        };

        this.pendingReceipts.push(pendingReceipt);
        this.savePendingReceipts();
        this.updatePendingCount();
        
        // Clear current receipt
        this.currentReceiptImage = null;
        document.getElementById('receipt-preview').classList.add('hidden');
        document.getElementById('receipt-image').value = '';
        
        this.showToast('証憑を「KEEP」しました');
    }

    renderPendingReceipts() {
        const container = document.getElementById('pending-receipts-list');
        if (!container) return;

        if (this.pendingReceipts.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this.pendingReceipts.map(receipt => {
            const date = new Date(receipt.createdAt);
            const dateStr = date.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="flex items-center gap-3 bg-white border border-orange-200 rounded-lg p-3">
                    <img src="${receipt.image}" alt="証憑画像" class="w-16 h-16 object-cover rounded border border-gray-300">
                    <div class="flex-1">
                        <div class="text-sm text-gray-600">
                            <i class="fas fa-calendar mr-1"></i>${dateStr}
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="app.usePendingReceipt(${receipt.id})" class="px-3 py-1 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600" title="この証憑を使って取引を入力">
                            <i class="fas fa-edit mr-1"></i>入力
                        </button>
                        <button onclick="app.deletePendingReceipt(${receipt.id})" class="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600" title="削除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    usePendingReceipt(receiptId) {
        const receipt = this.pendingReceipts.find(r => r.id === receiptId);
        if (!receipt) return;

        // Set as current receipt image
        this.currentReceiptImage = receipt.image;
        document.getElementById('receipt-preview-img').src = receipt.image;
        document.getElementById('receipt-preview').classList.remove('hidden');

        // Remove from pending list
        this.pendingReceipts = this.pendingReceipts.filter(r => r.id !== receiptId);
        this.savePendingReceipts();
        this.updatePendingCount();

        // Scroll to form
        document.getElementById('entry-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        this.showToast('証憑を読み込みました。取引詳細を入力してください');
    }

    deletePendingReceipt(receiptId) {
        if (!confirm('この証憑を削除してもよろしいですか？')) return;

        this.pendingReceipts = this.pendingReceipts.filter(r => r.id !== receiptId);
        this.savePendingReceipts();
        this.updatePendingCount();
        
        this.showToast('証憑を削除しました');
    }

    removeReceiptImage() {
        this.currentReceiptImage = null;
        document.getElementById('receipt-preview').classList.add('hidden');
        document.getElementById('receipt-image').value = '';
        this.updatePendingCount(); // Hide quick save buttons
    }

    updatePendingCount() {
        const count = this.pendingReceipts.length;
        const badge = document.getElementById('pending-todo-badge');
        const countEl = document.getElementById('pending-count');
        const quickSaveBtn = document.getElementById('quick-save-btn');
        
        if (countEl) {
            countEl.textContent = count;
        }
        
        if (badge) {
            if (count > 0) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        
        // Show/hide pending receipts section
        const pendingSection = document.getElementById('pending-receipts-section');
        const pendingCountEl = document.getElementById('pending-receipts-count');
        if (pendingSection && pendingCountEl) {
            pendingCountEl.textContent = count;
            if (count > 0) {
                pendingSection.classList.remove('hidden');
                this.renderPendingReceipts();
            } else {
                pendingSection.classList.add('hidden');
            }
        }
        
        // Show/hide quick save buttons based on Premium plan and receipt image
        const plan = this.subscription?.plan || 'free';
        const hasReceipt = this.currentReceiptImage ? true : false;
        
        // Original quick save button (top of entry tab)
        if (quickSaveBtn) {
            if ((plan === 'basic' || plan === 'professional') && hasReceipt) {
                quickSaveBtn.classList.remove('hidden');
            } else {
                quickSaveBtn.classList.add('hidden');
            }
        }
        
        // Header quick save button
        const headerQuickSaveBtn = document.getElementById('header-quick-save-btn');
        if (headerQuickSaveBtn) {
            if ((plan === 'basic' || plan === 'professional') && hasReceipt) {
                headerQuickSaveBtn.classList.remove('hidden');
            } else {
                headerQuickSaveBtn.classList.add('hidden');
            }
        }
        
        // Inline quick save button (in receipt preview)
        const inlineQuickSaveBtn = document.getElementById('inline-quick-save-btn');
        if (inlineQuickSaveBtn) {
            if ((plan === 'basic' || plan === 'professional') && hasReceipt) {
                inlineQuickSaveBtn.classList.remove('hidden');
            } else {
                inlineQuickSaveBtn.classList.add('hidden');
            }
        }
    }

    updateUIBasedOnPlan() {
        const plan = this.subscription?.plan || 'free';
        
        // Update current plan display (check if elements exist)
        const badge = document.getElementById('current-plan-badge');
        const price = document.getElementById('current-plan-price');
        
        if (badge && price) {
            if (plan === 'free') {
                badge.textContent = 'Free Plan';
                badge.className = 'px-4 py-2 bg-gray-300 text-gray-700 rounded-full font-bold text-lg';
                price.textContent = '¥0';
            } else if (plan === 'basic') {
                badge.textContent = 'Basic Plan';
                badge.className = 'px-4 py-2 bg-indigo-500 text-white rounded-full font-bold text-lg';
                price.textContent = '¥330';
            } else if (plan === 'professional') {
                badge.textContent = 'Professional Plan';
                badge.className = 'px-4 py-2 bg-purple-500 text-white rounded-full font-bold text-lg';
                price.textContent = '¥990';
            }
        }

        // Show/hide receipt upload section based on plan (check if element exists)
        const receiptSection = document.getElementById('receipt-upload-section');
        if (receiptSection) {
            if (plan === 'premium' || plan === 'basic' || plan === 'professional') {
                receiptSection.classList.remove('hidden');
            } else {
                receiptSection.classList.add('hidden');
            }
        }

        // Show/hide export format selection based on plan
        const exportFormatSection = document.getElementById('export-format-section');
        const exportFormatUnavailable = document.getElementById('export-format-unavailable');
        const exportFormatInfo = document.getElementById('export-format-info');
        const exportBasicInfo = document.getElementById('export-basic-info');
        const exportFormatBadge = document.getElementById('export-format-plan-badge');
        
        if (plan === 'basic' || plan === 'professional') {
            // Paid plans: Show format selection
            if (exportFormatSection) exportFormatSection.classList.remove('hidden');
            if (exportFormatUnavailable) exportFormatUnavailable.classList.add('hidden');
            if (exportFormatInfo) exportFormatInfo.classList.remove('hidden');
            if (exportBasicInfo) exportBasicInfo.classList.add('hidden');
            if (exportFormatBadge) exportFormatBadge.classList.remove('hidden');
        } else {
            // Free plan: Hide format selection, show basic CSV message
            if (exportFormatSection) exportFormatSection.classList.add('hidden');
            if (exportFormatUnavailable) exportFormatUnavailable.classList.remove('hidden');
            if (exportFormatInfo) exportFormatInfo.classList.add('hidden');
            if (exportBasicInfo) exportBasicInfo.classList.remove('hidden');
            if (exportFormatBadge) exportFormatBadge.classList.add('hidden');
        }

        // Show/hide subscription info (check if elements exist)
        const subscriptionInfo = document.getElementById('subscription-info');
        const paymentHistorySection = document.getElementById('payment-history-section');
        const cancelSection = document.getElementById('cancel-subscription-section');
        
        if (plan !== 'free' && this.subscription) {
            if (subscriptionInfo) {
                subscriptionInfo.classList.remove('hidden');
                
                const nextBillingEl = document.getElementById('next-billing-date');
                const cardInfoEl = document.getElementById('card-info');
                
                if (nextBillingEl) {
                    const nextBilling = new Date(this.subscription.startDate);
                    nextBilling.setMonth(nextBilling.getMonth() + 1);
                    nextBillingEl.textContent = nextBilling.toLocaleDateString('ja-JP');
                }
                
                if (cardInfoEl) {
                    cardInfoEl.textContent = this.subscription.cardLast4 ? `**** **** **** ${this.subscription.cardLast4}` : '未登録';
                }
            }
            
            if (paymentHistorySection) paymentHistorySection.classList.remove('hidden');
            if (cancelSection) cancelSection.classList.remove('hidden');
            
            this.renderPaymentHistory();
        } else {
            if (subscriptionInfo) subscriptionInfo.classList.add('hidden');
            if (paymentHistorySection) paymentHistorySection.classList.add('hidden');
            if (cancelSection) cancelSection.classList.add('hidden');
        }
    }

    selectPlan(plan) {
        this.selectedPlan = plan;
        this.showPaymentModal();
    }

    showPaymentModal() {
        // Redirect to new plan selection modal instead
        this.showPlanModal();
        return;
        
        /* Old payment modal - deprecated
        const plans = {
            basic: { name: 'Basicプラン', price: 330 },
            professional: { name: 'Professionalプラン', price: 990 }
        };
        
        const planInfo = plans[this.selectedPlan];
        document.getElementById('payment-plan-name').textContent = planInfo.name;
        document.getElementById('payment-plan-price').textContent = `¥${planInfo.price}/月`;
        
        document.getElementById('payment-modal').classList.remove('hidden');
        */
    }

    hidePaymentModal() {
        document.getElementById('payment-modal').classList.add('hidden');
        document.getElementById('payment-form').reset();
        this.selectedPlan = null;
    }

    async handlePayment() {
        if (!this.selectedPlan) return;

        const cardNumber = document.getElementById('card-number').value;
        const cardExpiry = document.getElementById('card-expiry').value;
        const cardCvv = document.getElementById('card-cvv').value;
        const cardName = document.getElementById('card-name').value;

        // Validate card fields
        if (!cardNumber || !cardExpiry || !cardCvv || !cardName) {
            alert('すべての項目を入力してください');
            return;
        }

        try {
            this.showLoading();
            
            // Extract last 4 digits of card
            const cardLast4 = cardNumber.replace(/\s/g, '').slice(-4);
            
            // Call API to process subscription
            const response = await window.apiClient.subscribe(this.selectedPlan, cardLast4, cardName);
            
            // Update local subscription data
            this.subscription = {
                plan: response.subscription.plan,
                status: response.subscription.status,
                startDate: response.subscription.start_date,
                endDate: response.subscription.end_date,
                cardLast4: cardLast4,
                cardName: cardName,
                paymentHistory: []
            };

            this.updateUIBasedOnPlan();
            this.hidePaymentModal();
            this.hideLoading();
            const planNames = {
                'basic': 'Basicプラン',
                'professional': 'Professionalプラン'
            };
            const planName = planNames[response.subscription.plan] || 'プラン';
            this.showToast(`${planName}に登録しました！全機能が利用可能です。`);
        } catch (error) {
            console.error('Payment failed:', error);
            this.hideLoading();
            alert('サブスクリプション登録に失敗しました。もう一度お試しください。');
        }
    }

    renderPaymentHistory() {
        if (!this.subscription || !this.subscription.paymentHistory) return;

        const tbody = document.getElementById('payment-history-list');
        tbody.innerHTML = this.subscription.paymentHistory.map(payment => {
            const planName = 'プレミアムプラン';
            return `
                <tr>
                    <td class="px-4 py-3">${new Date(payment.date).toLocaleDateString('ja-JP')}</td>
                    <td class="px-4 py-3">${planName}</td>
                    <td class="px-4 py-3 text-right">¥${payment.amount}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">完了</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async cancelSubscription() {
        if (!confirm('サブスクリプションを解約しますか？\n解約後は無料プランに戻ります。')) {
            return;
        }

        try {
            this.showLoading();
            await window.apiClient.unsubscribe();
            
            this.subscription = {
                plan: 'free',
                status: 'active'
            };
            
            this.updateUIBasedOnPlan();
            this.hideLoading();
            this.showToast('サブスクリプションを解約しました');
        } catch (error) {
            console.error('Unsubscribe failed:', error);
            this.hideLoading();
            alert('解約処理に失敗しました。もう一度お試しください。');
        }
    }

    // Receipt Image Management (PRO Plan)
    removeReceiptImage() {
        this.currentReceiptImage = null;
        this.currentReceiptMetadata = null;
        document.getElementById('receipt-preview').classList.add('hidden');
        document.getElementById('receipt-image').value = '';
    }

    async generateReceiptPDF(imageData, metadata) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Add title
        doc.setFontSize(16);
        doc.text('証憑', 105, 20, { align: 'center' });

        // Add metadata
        doc.setFontSize(10);
        doc.text(`日付: ${metadata.date}`, 20, 35);
        doc.text(`取引先: ${metadata.client}`, 20, 42);
        doc.text(`金額: ${metadata.amount.toLocaleString()}円`, 20, 49);
        doc.text(`内容: ${metadata.description}`, 20, 56);

        // Add image
        const img = new Image();
        img.src = imageData;
        
        return new Promise((resolve) => {
            img.onload = () => {
                const imgWidth = 170;
                const imgHeight = (img.height * imgWidth) / img.width;
                doc.addImage(imageData, 'JPEG', 20, 65, imgWidth, imgHeight);

                // Convert to base64
                const pdfData = doc.output('dataurlstring');
                resolve(pdfData);
            };
        });
    }

    renderReceiptFiles() {
        const plan = this.subscription?.plan || 'free';
        
        // Image attachment is available for basic and professional plans
        if (plan === 'free') {
            document.getElementById('receipt-files-available').classList.add('hidden');
            document.getElementById('receipt-files-unavailable').classList.remove('hidden');
            return;
        }

        document.getElementById('receipt-files-available').classList.remove('hidden');
        document.getElementById('receipt-files-unavailable').classList.add('hidden');

        const transactions = this.getCurrentTransactions();
        const receipts = transactions.filter(t => t.receiptPDF);

        document.getElementById('receipt-count').textContent = `${receipts.length}件`;

        const tbody = document.getElementById('receipt-files-list');
        const emptyState = document.getElementById('empty-receipt-state');

        if (receipts.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
            document.getElementById('select-all-receipts').checked = false;
            this.updateSelectedCount();
            return;
        }

        emptyState.classList.add('hidden');

        tbody.innerHTML = receipts.map(receipt => {
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-center">
                        <input type="checkbox" class="receipt-checkbox w-4 h-4 cursor-pointer" data-transaction-id="${receipt.id}" onchange="app.updateSelectedCount()">
                    </td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-file-pdf text-red-500"></i>
                            <span class="font-mono text-sm">${this.escapeHtml(receipt.receiptPDF.filename)}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3">${this.formatDate(receipt.date)}</td>
                    <td class="px-4 py-3">${this.escapeHtml(receipt.client)}</td>
                    <td class="px-4 py-3 text-right font-semibold">${this.formatCurrency(receipt.amount)}</td>
                    <td class="px-4 py-3 text-center">
                        <div class="flex gap-2 justify-center">
                            <button onclick="app.viewReceiptPDF(${receipt.id})" class="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-xs" title="プレビュー">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="app.downloadReceiptPDF(${receipt.id})" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs" title="ダウンロード">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('select-all-receipts').checked = false;
        this.updateSelectedCount();
    }

    downloadReceiptPDF(transactionId) {
        const transactions = this.getCurrentTransactions();
        const transaction = transactions.find(t => t.id === transactionId);

        if (!transaction || !transaction.receiptPDF) {
            alert('PDFファイルが見つかりません');
            return;
        }

        const link = document.createElement('a');
        link.href = transaction.receiptPDF.data;
        link.download = transaction.receiptPDF.filename;
        link.click();

        this.showToast('PDFをダウンロードしました');
    }

    viewReceiptPDF(transactionId) {
        const transactions = this.getCurrentTransactions();
        const transaction = transactions.find(t => t.id === transactionId);

        if (!transaction || !transaction.receiptPDF) {
            alert('PDFファイルが見つかりません');
            return;
        }

        // Open PDF in new tab
        window.open(transaction.receiptPDF.data, '_blank');
    }

    toggleSelectAllReceipts() {
        const selectAll = document.getElementById('select-all-receipts');
        const checkboxes = document.querySelectorAll('.receipt-checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAll.checked;
        });
        
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const checkboxes = document.querySelectorAll('.receipt-checkbox:checked');
        const count = checkboxes.length;
        
        document.getElementById('selected-count').textContent = `${count}件`;
        
        const bulkDownloadBtn = document.getElementById('bulk-download-btn');
        if (bulkDownloadBtn) {
            bulkDownloadBtn.disabled = count === 0;
        }
        
        // Update select all checkbox state
        const allCheckboxes = document.querySelectorAll('.receipt-checkbox');
        const selectAllCheckbox = document.getElementById('select-all-receipts');
        if (selectAllCheckbox && allCheckboxes.length > 0) {
            selectAllCheckbox.checked = checkboxes.length === allCheckboxes.length;
        }
    }

    bulkDownloadReceipts() {
        const checkboxes = document.querySelectorAll('.receipt-checkbox:checked');
        
        if (checkboxes.length === 0) {
            alert('ダウンロードするファイルを選択してください');
            return;
        }

        const transactions = this.getCurrentTransactions();
        let downloadCount = 0;

        checkboxes.forEach((checkbox, index) => {
            const transactionId = parseInt(checkbox.dataset.transactionId);
            const transaction = transactions.find(t => t.id === transactionId);
            
            if (transaction && transaction.receiptPDF) {
                // Delay each download slightly to avoid browser blocking
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = transaction.receiptPDF.data;
                    link.download = transaction.receiptPDF.filename;
                    link.click();
                    downloadCount++;
                    
                    if (downloadCount === checkboxes.length) {
                        this.showToast(`${downloadCount}件のPDFをダウンロードしました`);
                    }
                }, index * 300); // 300ms delay between downloads
            }
        });
    }

    filterReceipts() {
        const startDate = document.getElementById('receipt-filter-start').value;
        const endDate = document.getElementById('receipt-filter-end').value;

        const plan = this.subscription?.plan || 'free';
        
        // Image attachment is available for basic and professional plans
        if (plan === 'free') {
            document.getElementById('receipt-files-available').classList.add('hidden');
            document.getElementById('receipt-files-unavailable').classList.remove('hidden');
            return;
        }

        document.getElementById('receipt-files-available').classList.remove('hidden');
        document.getElementById('receipt-files-unavailable').classList.add('hidden');

        const transactions = this.getCurrentTransactions();
        let receipts = transactions.filter(t => t.receiptPDF);

        // Apply date filter
        if (startDate) {
            receipts = receipts.filter(r => r.date >= startDate);
        }
        if (endDate) {
            receipts = receipts.filter(r => r.date <= endDate);
        }

        document.getElementById('receipt-count').textContent = `${receipts.length}件`;

        const tbody = document.getElementById('receipt-files-list');
        const emptyState = document.getElementById('empty-receipt-state');

        if (receipts.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
            document.getElementById('select-all-receipts').checked = false;
            this.updateSelectedCount();
            return;
        }

        emptyState.classList.add('hidden');

        tbody.innerHTML = receipts.map(receipt => {
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-center">
                        <input type="checkbox" class="receipt-checkbox w-4 h-4 cursor-pointer" data-transaction-id="${receipt.id}" onchange="app.updateSelectedCount()">
                    </td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-file-pdf text-red-500"></i>
                            <span class="font-mono text-sm">${this.escapeHtml(receipt.receiptPDF.filename)}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3">${this.formatDate(receipt.date)}</td>
                    <td class="px-4 py-3">${this.escapeHtml(receipt.client)}</td>
                    <td class="px-4 py-3 text-right font-semibold">${this.formatCurrency(receipt.amount)}</td>
                    <td class="px-4 py-3 text-center">
                        <div class="flex gap-2 justify-center">
                            <button onclick="app.viewReceiptPDF(${receipt.id})" class="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 text-xs" title="プレビュー">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="app.downloadReceiptPDF(${receipt.id})" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs" title="ダウンロード">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('select-all-receipts').checked = false;
        this.updateSelectedCount();
    }

    clearReceiptFilter() {
        document.getElementById('receipt-filter-start').value = '';
        document.getElementById('receipt-filter-end').value = '';
        this.renderReceiptFiles();
    }

    // Transaction Edit Functions
    showEditModal(transactionId) {
        console.log('showEditModal called with ID:', transactionId, 'type:', typeof transactionId);
        const transactions = this.getCurrentTransactions();
        console.log('Current transactions:', transactions);
        const transaction = transactions.find(t => t.id == transactionId); // Use == for loose comparison
        console.log('Found transaction:', transaction);
        if (!transaction) {
            console.error('Transaction not found!');
            return;
        }

        // Populate form
        document.getElementById('edit-transaction-id').value = transaction.id;
        document.getElementById('edit-date').value = transaction.date;
        document.getElementById('edit-type').value = transaction.type;
        document.getElementById('edit-description').value = transaction.description;
        document.getElementById('edit-client').value = transaction.client;
        document.getElementById('edit-amount').value = transaction.amount;
        document.getElementById('edit-tax-type').value = transaction.taxType;

        // Populate account selects
        this.populateEditAccountSelects();
        
        if (transaction.account_subject_id) {
            document.getElementById('edit-account-subject').value = transaction.account_subject_id;
            this.updateEditSubAccountSelect();
            if (transaction.sub_account_id) {
                document.getElementById('edit-sub-account').value = transaction.sub_account_id;
            }
        }

        document.getElementById('edit-modal').classList.remove('hidden');
    }

    hideEditModal() {
        document.getElementById('edit-modal').classList.add('hidden');
        document.getElementById('edit-form').reset();
    }

    populateEditAccountSelects() {
        const accountSelect = document.getElementById('edit-account-subject');
        if (accountSelect) {
            accountSelect.innerHTML = '<option value="">選択しない</option>' +
                this.accountSubjects.map(account => 
                    `<option value="${account.id}">${this.escapeHtml(account.name)}</option>`
                ).join('');
        }
    }

    updateEditSubAccountSelect() {
        const accountId = parseInt(document.getElementById('edit-account-subject').value);
        const subAccountSelect = document.getElementById('edit-sub-account');
        
        if (!subAccountSelect) return;

        subAccountSelect.innerHTML = '<option value="">選択しない</option>';

        if (accountId) {
            const account = this.accountSubjects.find(a => a.id === accountId);
            if (account && account.sub_accounts && account.sub_accounts.length > 0) {
                subAccountSelect.innerHTML += account.sub_accounts.map(sub => 
                    `<option value="${sub.id}">${this.escapeHtml(sub.name)}</option>`
                ).join('');
                subAccountSelect.disabled = false;
            } else {
                subAccountSelect.disabled = true;
            }
        } else {
            subAccountSelect.disabled = true;
        }
    }

    async handleEditTransaction() {
        const transactionId = parseInt(document.getElementById('edit-transaction-id').value);
        
        try {
            this.showLoading();
            
            const updateData = {
                date: document.getElementById('edit-date').value,
                type: document.getElementById('edit-type').value,
                description: document.getElementById('edit-description').value,
                client: document.getElementById('edit-client').value || null,
                amount: parseInt(document.getElementById('edit-amount').value),
                tax_code: document.getElementById('edit-tax-type').value || null,
                account_subject_id: document.getElementById('edit-account-subject').value ? 
                    parseInt(document.getElementById('edit-account-subject').value) : null,
                sub_account_id: document.getElementById('edit-sub-account').value ? 
                    parseInt(document.getElementById('edit-sub-account').value) : null
            };

            await window.apiClient.updateTransaction(transactionId, updateData);
            
            // Reload transactions
            await this.loadTransactionsFromAPI(this.currentBookId);
            
            this.hideLoading();
            this.renderTransactions();
            this.hideEditModal();
            this.showToast('取引を更新しました');
        } catch (error) {
            this.hideLoading();
            console.error('Update transaction error:', error);
            alert('取引の更新に失敗しました: ' + error.message);
        }
    }

    // ========================================
    // Auth & API Integration Methods
    // ========================================

    showAuthModal() {
        document.getElementById('auth-modal').classList.remove('hidden');
    }

    hideAuthModal() {
        document.getElementById('auth-modal').classList.add('hidden');
    }

    showAuthError(message) {
        const errorEl = document.getElementById('auth-error');
        errorEl.querySelector('p').textContent = message;
        errorEl.classList.remove('hidden');
    }

    hideAuthError() {
        document.getElementById('auth-error').classList.add('hidden');
    }

    showLoading() {
        document.getElementById('loading-overlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            this.hideAuthError();
            this.showLoading();
            
            const data = await window.apiClient.login(email, password);
            console.log('Login successful:', data);
            
            // Reload app with authenticated state
            await this.init();
        } catch (error) {
            this.hideLoading();
            console.error('Login error:', error);
            this.showAuthError(error.message || 'ログインに失敗しました');
        }
    }

    async handleRegister() {
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        try {
            this.hideAuthError();
            this.showLoading();
            
            const data = await window.apiClient.register(email, password, name);
            console.log('Registration successful:', data);
            
            // Reload app with authenticated state
            await this.init();
        } catch (error) {
            this.hideLoading();
            console.error('Registration error:', error);
            this.showAuthError(error.message || '登録に失敗しました');
        }
    }

    async loadBooksFromAPI() {
        try {
            const response = await window.apiClient.getBooks();
            const rawBooks = Array.isArray(response) ? response : (response.books || []);
            
            // Transform API data (snake_case) to frontend format (camelCase)
            this.books = rawBooks.map(book => ({
                id: book.id,
                businessName: book.business_name,
                accountName: book.account_name,
                settings: {
                    recipientEmails: book.recipient_emails || [],
                    openingBalance: book.opening_balance || 0,
                    exportFormat: book.export_format || 'mf'
                },
                transactions: [],
                createdAt: book.created_at,
                updatedAt: book.updated_at
            }));
            
            console.log('Loaded books from API:', this.books);
        } catch (error) {
            console.error('Failed to load books:', error);
            // Don't throw error, just set empty array
            this.books = [];
        }
    }

    async loadSubscriptionFromAPI() {
        try {
            const subscription = await window.apiClient.getSubscription();
            this.subscription = {
                plan: subscription.plan || 'free',
                status: subscription.status || 'active',
                startDate: subscription.start_date,
                endDate: subscription.end_date,
                paymentHistory: [] // Will be loaded separately if needed
            };
            console.log('Loaded subscription:', this.subscription);
        } catch (error) {
            console.error('Failed to load subscription:', error);
            this.subscription = { plan: 'free', status: 'active' };
        }
    }

    async loadAccountSubjectsFromAPI(bookId) {
        try {
            this.accountSubjects = await window.apiClient.getAccountSubjects(bookId);
            console.log('Loaded account subjects:', this.accountSubjects);
            this.populateAccountSelects();
        } catch (error) {
            console.error('Failed to load account subjects:', error);
            this.accountSubjects = [];
        }
    }

    async loadTransactionsFromAPI(bookId) {
        try {
            const transactions = await window.apiClient.getTransactions(bookId);
            console.log('Loaded transactions:', transactions);
            
            // Convert API format to app format
            const book = this.getCurrentBook();
            if (book) {
                book.transactions = transactions.map(t => ({
                    id: t.id.toString(),
                    date: t.date,
                    type: t.type,
                    description: t.description,
                    client: t.client || '',
                    amount: t.amount,
                    account_subject_id: t.account_subject_id || null,
                    sub_account_id: t.sub_account_id || null,
                    taxType: t.tax_code || '',
                    receiptPDF: t.receipt_id ? { id: t.receipt_id } : null
                }));
            }
        } catch (error) {
            console.error('Failed to load transactions:', error);
        }
    }
}


// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new CashBookApp();
    // グローバルに公開（連絡先管理などで使用）
    window.app = app;
    // お知らせ機能の初期化
    loadUnreadCount();
    setInterval(loadUnreadCount, 300000); // 5分ごとに未読数を更新
});

// ==================== お知らせ機能 ====================

let announcements = [];

// 未読お知らせ数を読み込み
async function loadUnreadCount() {
    if (!window.apiClient.isAuthenticated()) return;

    try {
        const response = await fetch('/api/announcements/unread-count', {
            headers: {
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            updateUnreadBadge(data.unread_count);
        }
    } catch (error) {
        console.error('Failed to load unread count:', error);
    }
}

// 未読バッジを更新
function updateUnreadBadge(count) {
    const badge = document.getElementById('unread-badge');
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// お知らせモーダルを表示
async function showAnnouncementsModal() {
    document.getElementById('announcements-modal').classList.remove('hidden');
    await loadAnnouncements();
}

// お知らせモーダルを閉じる
function closeAnnouncementsModal() {
    document.getElementById('announcements-modal').classList.add('hidden');
}

// お知らせ一覧を読み込み
async function loadAnnouncements() {
    try {
        const response = await fetch('/api/announcements', {
            headers: {
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            }
        });

        if (!response.ok) throw new Error('お知らせの取得に失敗しました');

        const data = await response.json();
        announcements = data.announcements;
        renderAnnouncements();
        updateUnreadBadge(data.unread_count);
    } catch (error) {
        console.error('Failed to load announcements:', error);
        document.getElementById('announcements-list').innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p>お知らせの読み込みに失敗しました</p>
            </div>
        `;
    }
}

// お知らせを表示
function renderAnnouncements() {
    const list = document.getElementById('announcements-list');

    if (announcements.length === 0) {
        list.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-inbox text-3xl mb-3"></i>
                <p>お知らせはありません</p>
            </div>
        `;
        return;
    }

    list.innerHTML = announcements.map(announcement => {
        const typeColors = {
            'info': 'bg-blue-50 border-blue-300',
            'success': 'bg-green-50 border-green-300',
            'warning': 'bg-yellow-50 border-yellow-300',
            'error': 'bg-red-50 border-red-300'
        };

        const typeIcons = {
            'info': 'fa-info-circle text-blue-500',
            'success': 'fa-check-circle text-green-500',
            'warning': 'fa-exclamation-triangle text-yellow-500',
            'error': 'fa-times-circle text-red-500'
        };

        const priorityBadges = {
            0: '',
            1: '<span class="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">重要</span>',
            2: '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">緊急</span>'
        };

        return `
            <div class="border-l-4 ${typeColors[announcement.type]} p-4 rounded ${announcement.is_read ? 'opacity-60' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <i class="fas ${typeIcons[announcement.type]}"></i>
                        <h4 class="font-semibold text-gray-800">${announcement.title}</h4>
                        ${priorityBadges[announcement.priority]}
                        ${announcement.is_read ? '<span class="text-xs text-gray-500">(既読)</span>' : ''}
                    </div>
                    <span class="text-xs text-gray-500">${new Date(announcement.published_at).toLocaleDateString('ja-JP')}</span>
                </div>
                <p class="text-gray-700 text-sm whitespace-pre-wrap">${announcement.content}</p>
                ${!announcement.is_read ? `
                    <div class="mt-3">
                        <button onclick="markAsRead(${announcement.id})" class="text-xs text-indigo-600 hover:text-indigo-700">
                            <i class="fas fa-check mr-1"></i>既読にする
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// お知らせを既読にする
async function markAsRead(announcementId) {
    try {
        const response = await fetch(`/api/announcements/${announcementId}/read`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            }
        });

        if (!response.ok) throw new Error('既読処理に失敗しました');

        // ローカルの状態を更新
        const announcement = announcements.find(a => a.id === announcementId);
        if (announcement) {
            announcement.is_read = 1;
        }

        renderAnnouncements();
        loadUnreadCount();
    } catch (error) {
        console.error('Failed to mark as read:', error);
    }
}

// 全てのお知らせを既読にする
async function markAllAsRead() {
    try {
        const response = await fetch('/api/announcements/read-all', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            }
        });

        if (!response.ok) throw new Error('既読処理に失敗しました');

        // ローカルの状態を更新
        announcements.forEach(a => a.is_read = 1);

        renderAnnouncements();
        updateUnreadBadge(0);
    } catch (error) {
        console.error('Failed to mark all as read:', error);
        alert('既読処理に失敗しました');
    }
}

// ==================== メンバー管理機能 ====================

let teamMembers = [];

// メンバー一覧を読み込み
async function loadTeamMembers() {
    try {
        const response = await fetch('/api/team-members', {
            headers: {
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            }
        });

        if (!response.ok) throw new Error('メンバー一覧の取得に失敗しました');

        const data = await response.json();
        teamMembers = data.members || [];
        
        renderTeamMembers();
    } catch (error) {
        console.error('Failed to load team members:', error);
        document.getElementById('members-list').innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-2"></i>
                <p>メンバー一覧の読み込みに失敗しました</p>
            </div>
        `;
    }
}

// メンバー一覧を表示
function renderTeamMembers() {
    const list = document.getElementById('members-list');
    const empty = document.getElementById('members-empty');

    if (teamMembers.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    list.classList.remove('hidden');
    empty.classList.add('hidden');

    list.innerHTML = teamMembers.map(member => {
        const roleLabel = member.role === 'main' ? 
            '<span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs font-semibold">メイン</span>' : 
            '<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">サブ</span>';
        
        const statusLabel = member.status === 'active' ? 
            '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>アクティブ</span>' : 
            '<span class="text-yellow-600"><i class="fas fa-clock mr-1"></i>招待中</span>';

        const deleteBtn = member.role === 'main' ? '' : `
            <button onclick="removeMember(${member.id})" class="text-red-600 hover:text-red-700" title="削除">
                <i class="fas fa-trash"></i>
            </button>
        `;

        return `
            <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <h4 class="font-semibold text-gray-800">${escapeHtml(member.nickname)}</h4>
                            ${roleLabel}
                        </div>
                        <p class="text-sm text-gray-600 mb-1">
                            <i class="fas fa-envelope mr-1"></i>${escapeHtml(member.email)}
                        </p>
                        <p class="text-xs text-gray-500">
                            ${statusLabel}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        ${deleteBtn}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// メンバー追加モーダルを開く
function showAddMemberModal() {
    document.getElementById('add-member-modal').classList.remove('hidden');
    document.getElementById('member-nickname').value = '';
    document.getElementById('member-email').value = '';
}

// メンバー追加モーダルを閉じる
function closeAddMemberModal() {
    document.getElementById('add-member-modal').classList.add('hidden');
}

// メンバーを追加
async function handleAddMember(event) {
    event.preventDefault();

    const nickname = document.getElementById('member-nickname').value.trim();
    const email = document.getElementById('member-email').value.trim();

    if (!nickname || !email) {
        alert('ニックネームとメールアドレスを入力してください');
        return;
    }

    try {
        const response = await fetch('/api/team-members', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            },
            body: JSON.stringify({ nickname, email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'メンバーの追加に失敗しました');
        }

        closeAddMemberModal();
        await loadTeamMembers();
        showToast('メンバーを追加しました', 'success');
    } catch (error) {
        console.error('Failed to add member:', error);
        alert(error.message);
    }
}

// メンバーを削除
async function removeMember(memberId) {
    if (!confirm('このメンバーを削除してもよろしいですか？')) {
        return;
    }

    try {
        const response = await fetch(`/api/team-members/${memberId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'メンバーの削除に失敗しました');
        }

        await loadTeamMembers();
        showToast('メンバーを削除しました', 'success');
    } catch (error) {
        console.error('Failed to remove member:', error);
        alert(error.message);
    }
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', function() {
    // メンバー追加ボタン
    const addMemberBtn = document.getElementById('add-member-btn');
    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', showAddMemberModal);
    }

    // メンバー追加フォーム
    const addMemberForm = document.getElementById('add-member-form');
    if (addMemberForm) {
        addMemberForm.addEventListener('submit', handleAddMember);
    }
});

// エスケープ関数（XSS対策）
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ===== 料金プラン管理機能 =====

// プラン情報をロード
async function loadPlanInfo() {
    try {
        // サブスクリプション情報を取得
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${window.apiClient.getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load user info');
        }

        const data = await response.json();
        const plan = data.subscription?.plan || 'free';
        
        // プラン情報を表示
        updatePlanDisplay(plan, data.subscription);
        
        // 現在の帳簿数を取得して従量課金を計算
        if (plan === 'professional') {
            const booksResponse = await window.apiClient.getBooks();
            const booksCount = booksResponse.books?.length || 0;
            updateMeteredBilling(booksCount);
        }
    } catch (error) {
        console.error('Failed to load plan info:', error);
    }
}

// プラン表示を更新
function updatePlanDisplay(plan, subscription) {
    const planNames = {
        free: 'Free Plan',
        basic: 'Basic Plan',
        professional: 'Professional Plan'
    };
    
    const planPrices = {
        free: '¥0',
        basic: '¥330',
        professional: '¥990'
    };
    
    const planUsers = {
        free: '1名',
        basic: '2名',
        professional: '4名'
    };
    
    const planBooks = {
        free: '1冊',
        basic: '3冊',
        professional: '10冊'
    };
    
    const planTransactions = {
        free: '30件/月',
        basic: '無制限',
        professional: '無制限'
    };
    
    const planImages = {
        free: '不可',
        basic: '可能',
        professional: '可能'
    };
    
    document.getElementById('plan-name').textContent = planNames[plan] || 'Free Plan';
    document.getElementById('plan-price').textContent = planPrices[plan] || '¥0';
    document.getElementById('plan-users').textContent = planUsers[plan] || '1名';
    document.getElementById('plan-books').textContent = planBooks[plan] || '1冊';
    document.getElementById('plan-transactions').textContent = planTransactions[plan] || '30件/月';
    document.getElementById('plan-images').textContent = planImages[plan] || '不可';
    
    // 従量課金表示の制御
    const meteredDisplay = document.getElementById('metered-billing-display');
    if (plan === 'professional') {
        meteredDisplay?.classList.remove('hidden');
    } else {
        meteredDisplay?.classList.add('hidden');
    }
}

// 従量課金を更新
function updateMeteredBilling(booksCount) {
    const baseBooks = 10;
    const pricePerFiveBooks = 550;
    
    let additionalCharge = 0;
    if (booksCount > baseBooks) {
        const additionalBooks = booksCount - baseBooks;
        const chunks = Math.ceil(additionalBooks / 5);
        additionalCharge = chunks * pricePerFiveBooks;
    }
    
    const basePlanPrice = 990;
    const totalPrice = basePlanPrice + additionalCharge;
    
    const additionalChargeEl = document.getElementById('additional-charge');
    const totalPriceEl = document.getElementById('total-price');
    
    if (additionalChargeEl) {
        additionalChargeEl.textContent = `+¥${additionalCharge.toLocaleString()}`;
    }
    
    if (totalPriceEl) {
        totalPriceEl.textContent = `¥${totalPrice.toLocaleString()}`;
    }
}

// プラン変更モーダルを表示
function showPlanChangeModal() {
    const modal = document.getElementById('plan-change-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// プラン変更モーダルを閉じる
function hidePlanChangeModal() {
    const modal = document.getElementById('plan-change-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// 従量課金シミュレーターを更新
function updateMeteredBillingCalculator() {
    const booksCount = parseInt(document.getElementById('books-count-input')?.value || '10');
    const baseBooks = 10;
    const pricePerFiveBooks = 550;
    
    let additionalCharge = 0;
    if (booksCount > baseBooks) {
        const additionalBooks = booksCount - baseBooks;
        const chunks = Math.ceil(additionalBooks / 5);
        additionalCharge = chunks * pricePerFiveBooks;
    }
    
    const basePlanPrice = 990;
    const totalPrice = basePlanPrice + additionalCharge;
    
    document.getElementById('additional-charge-calc').textContent = `¥${additionalCharge.toLocaleString()}`;
    document.getElementById('total-price-calc').textContent = `¥${totalPrice.toLocaleString()}`;
}

// プラン選択処理
async function selectPlan(planName) {
    try {
        // プラン情報
        const planNames = {
            free: 'Freeプラン (¥0/月)',
            basic: 'Basicプラン (¥330/月)',
            professional: 'Professionalプラン (¥990/月〜)'
        };
        
        // Freeプランの場合は従来の処理（デモモード）
        if (planName === 'free') {
            const confirmMessage = `${planNames[planName]}に変更しますか？\n\n※ 有料プランから無料プランへのダウングレードとなります。`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // Loading表示
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'plan-change-loading';
            loadingDiv.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
            loadingDiv.innerHTML = '<div class="bg-white rounded-lg p-6"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div><p class="mt-4 text-gray-700">プランを変更中...</p></div>';
            document.body.appendChild(loadingDiv);
            
            // API呼び出し
            const response = await fetch('/api/auth/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.apiClient.getToken()}`
                },
                body: JSON.stringify({ plan: planName })
            });
            
            // Loading非表示
            document.body.removeChild(loadingDiv);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'プランの変更に失敗しました');
            }
            
            // モーダルを閉じる
            hidePlanChangeModal();
            
            // 成功メッセージ
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast(`${planNames[planName]}に変更しました！`, 'success');
            } else {
                alert(`${planNames[planName]}に変更しました！`);
            }
            
            // プラン情報を再読み込み
            await loadPlanInfo();
            
            // ページをリロードしてUIを更新
            setTimeout(() => {
                location.reload();
            }, 1500);
            return;
        }
        
        // BasicまたはProfessionalプランの場合はStripe Checkoutにリダイレクト
        const confirmMessage = `${planNames[planName]}に変更しますか？\n\nStripe決済画面に移動します。`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Loading表示
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'plan-change-loading';
        loadingDiv.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
        loadingDiv.innerHTML = '<div class="bg-white rounded-lg p-6"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div><p class="mt-4 text-gray-700">決済画面を準備中...</p></div>';
        document.body.appendChild(loadingDiv);
        
        // Stripe Checkout Sessionを作成（クーポンコードがあれば含める）
        const returnUrl = `${window.location.origin}/?payment=success&plan=${planName}`;
        const couponCode = appliedCoupon ? appliedCoupon.code : null;
        const checkoutData = await window.apiClient.createCheckoutSession(planName, returnUrl, couponCode);
        
        // Loading非表示
        document.body.removeChild(loadingDiv);
        
        if (checkoutData.success && checkoutData.url) {
            // Stripe Checkoutページにリダイレクト
            window.location.href = checkoutData.url;
        } else {
            throw new Error('決済画面の準備に失敗しました');
        }
        
    } catch (error) {
        console.error('Failed to change plan:', error);
        
        // Loading非表示（エラー時）
        const loadingDiv = document.getElementById('plan-change-loading');
        if (loadingDiv) {
            document.body.removeChild(loadingDiv);
        }
        
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('プランの変更に失敗しました: ' + error.message, 'error');
        } else {
            alert('プランの変更に失敗しました: ' + error.message);
        }
    }
}

// クーポン適用処理
let appliedCoupon = null;

async function applyCoupon() {
    const couponInput = document.getElementById('plan-change-coupon-input');
    const resultDiv = document.getElementById('coupon-result');
    const applyBtn = document.getElementById('apply-coupon-btn');
    
    if (!couponInput || !resultDiv || !applyBtn) return;
    
    const code = couponInput.value.trim().toUpperCase();
    
    if (!code) {
        resultDiv.className = 'mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm';
        resultDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>クーポンコードを入力してください';
        resultDiv.classList.remove('hidden');
        return;
    }
    
    // 選択されているプランを取得
    const selectedPlanBtn = document.querySelector('.select-plan-btn.bg-indigo-600, .select-plan-btn.bg-purple-600');
    let plan = 'basic';
    if (selectedPlanBtn) {
        plan = selectedPlanBtn.getAttribute('data-plan');
    }
    
    // ボタンを無効化
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>確認中...';
    
    try {
        const result = await window.apiClient.validateCoupon(code, plan);
        
        if (result.valid) {
            appliedCoupon = {
                code: result.coupon.code,
                discount_type: result.coupon.discount_type,
                discount_value: result.coupon.discount_value,
                description: result.coupon.description,
                preview: result.preview
            };
            
            // 成功メッセージ表示
            const discountText = result.coupon.discount_type === 'percentage' 
                ? `${result.coupon.discount_value}% OFF` 
                : `¥${result.coupon.discount_value} OFF`;
            
            resultDiv.className = 'mt-4 p-4 bg-green-50 border border-green-200 rounded-lg';
            resultDiv.innerHTML = `
                <div class="flex items-start justify-between">
                    <div>
                        <div class="flex items-center text-green-700 font-semibold mb-1">
                            <i class="fas fa-check-circle mr-2"></i>
                            クーポンが適用されました！
                        </div>
                        <div class="text-sm text-green-600 mb-2">
                            ${result.coupon.description || code}
                        </div>
                        <div class="text-sm text-gray-700">
                            <div class="flex justify-between mb-1">
                                <span>元の価格:</span>
                                <span class="line-through">¥${result.preview.original_price}</span>
                            </div>
                            <div class="flex justify-between mb-1">
                                <span>割引額:</span>
                                <span class="text-green-600 font-semibold">-¥${result.preview.discount_amount}</span>
                            </div>
                            <div class="flex justify-between pt-2 border-t border-green-200">
                                <span class="font-bold">割引後:</span>
                                <span class="font-bold text-lg text-green-700">¥${result.preview.final_price}</span>
                            </div>
                        </div>
                    </div>
                    <button onclick="removeCoupon()" class="text-green-600 hover:text-green-800">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            resultDiv.classList.remove('hidden');
            
            // 入力欄を無効化
            couponInput.disabled = true;
            applyBtn.innerHTML = '<i class="fas fa-check mr-2"></i>適用済み';
            
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast(`クーポン「${code}」を適用しました（${discountText}）`, 'success');
            }
        } else {
            // エラーメッセージ表示
            resultDiv.className = 'mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm';
            resultDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${result.error}`;
            resultDiv.classList.remove('hidden');
            appliedCoupon = null;
        }
    } catch (error) {
        console.error('Failed to apply coupon:', error);
        resultDiv.className = 'mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm';
        resultDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>クーポンの確認に失敗しました';
        resultDiv.classList.remove('hidden');
        appliedCoupon = null;
    } finally {
        applyBtn.disabled = false;
        if (!appliedCoupon) {
            applyBtn.innerHTML = '適用';
        }
    }
}

function removeCoupon() {
    appliedCoupon = null;
    
    const couponInput = document.getElementById('plan-change-coupon-input');
    const resultDiv = document.getElementById('coupon-result');
    const applyBtn = document.getElementById('apply-coupon-btn');
    
    if (couponInput) {
        couponInput.value = '';
        couponInput.disabled = false;
    }
    
    if (resultDiv) {
        resultDiv.classList.add('hidden');
        resultDiv.innerHTML = '';
    }
    
    if (applyBtn) {
        applyBtn.innerHTML = '適用';
    }
    
    if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('クーポンを解除しました', 'info');
    }
}

// Stripe決済完了/キャンセル時の処理
function handlePaymentResult() {
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const plan = urlParams.get('plan');
    
    if (payment === 'success' && plan) {
        // 決済成功メッセージ
        const planNames = {
            basic: 'Basicプラン',
            professional: 'Professionalプラン'
        };
        
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast(`✅ ${planNames[plan]}への変更が完了しました！`, 'success');
        } else {
            alert(`✅ ${planNames[plan]}への変更が完了しました！`);
        }
        
        // URLパラメータをクリア
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // プラン情報を再読み込み
        if (window.app && typeof window.app.loadPlanInfo === 'function') {
            setTimeout(() => {
                window.app.loadPlanInfo();
            }, 1000);
        }
    } else if (payment === 'cancelled') {
        // 決済キャンセルメッセージ
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('プラン変更をキャンセルしました', 'info');
        } else {
            alert('プラン変更をキャンセルしました');
        }
        
        // URLパラメータをクリア
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', function() {
    // 決済結果の処理
    handlePaymentResult();
    
    // プラン変更ボタン
    const changePlanBtn = document.getElementById('change-plan-btn');
    if (changePlanBtn) {
        changePlanBtn.addEventListener('click', showPlanChangeModal);
    }
    
    // プラン変更モーダルを閉じる
    const closePlanModalBtn = document.getElementById('close-plan-change-modal-btn');
    if (closePlanModalBtn) {
        closePlanModalBtn.addEventListener('click', hidePlanChangeModal);
    }
    
    // プラン選択ボタン
    const selectPlanBtns = document.querySelectorAll('.select-plan-btn');
    selectPlanBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const plan = this.getAttribute('data-plan');
            selectPlan(plan);
        });
    });
    
    // クーポン適用ボタン
    const applyCouponBtn = document.getElementById('apply-coupon-btn');
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', applyCoupon);
    }
    
    // クーポン入力でEnterキー押下時も適用
    const couponCodeInput = document.getElementById('plan-change-coupon-input');
    if (couponCodeInput) {
        couponCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyCoupon();
            }
        });
    }
    
    // 従量課金シミュレーター
    const booksCountInput = document.getElementById('books-count-input');
    if (booksCountInput) {
        booksCountInput.addEventListener('input', updateMeteredBillingCalculator);
    }
    
    // Professionalプランカードにホバーした時にシミュレーターを表示
    const professionalCard = document.querySelector('[data-plan="professional"]');
    const meteredCalculator = document.getElementById('metered-billing-calculator');
    if (professionalCard && meteredCalculator) {
        professionalCard.addEventListener('mouseenter', function() {
            meteredCalculator.classList.remove('hidden');
        });
    }
});

// ==================== グローバルエラーハンドラー ====================

// エラーコードと日本語メッセージのマッピング
const ERROR_MESSAGES = {
    'E1001': 'メールアドレスまたはパスワードが正しくありません',
    'E1002': 'セッションの有効期限が切れました。再度ログインしてください',
    'E1003': '認証エラーが発生しました。再度ログインしてください',
    'E1004': 'この操作を実行する権限がありません',
    'E1005': 'リクエスト回数が上限に達しました。しばらく時間をおいて再度お試しください',
    'E2001': '必須項目が入力されていません',
    'E2002': '入力形式が正しくありません',
    'E4001': 'この機能は現在のプランではご利用いただけません',
    'E4002': 'プランの上限に達しました。プランをアップグレードしてください',
    'E7001': '画像の解像度が電子帳簿保存法の要件を満たしていません',
    'E7002': '電子帳簿保存法により、保存期間中のため削除できません',
};

// APIエラーレスポンスをユーザーフレンドリーなメッセージに変換
function formatErrorMessage(error) {
    // エラーがオブジェクトで、codeプロパティがある場合
    if (error && typeof error === 'object' && error.code) {
        return ERROR_MESSAGES[error.code] || error.error || error.message || 'エラーが発生しました';
    }
    
    // エラーがErrorオブジェクトの場合
    if (error instanceof Error) {
        return error.message;
    }
    
    // エラーが文字列の場合
    if (typeof error === 'string') {
        return error;
    }
    
    // その他の場合
    return 'エラーが発生しました';
}

// グローバルエラーハンドラー（キャッチされなかったエラー）
window.addEventListener('error', (event) => {
    console.error('❌ Global Error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        timestamp: new Date().toISOString(),
    });
    
    // ユーザーには表示しない（開発中はコンソールで確認）
    // alert('予期しないエラーが発生しました。ページを再読み込みしてください。');
});

// Promise rejection エラーハンドラー
window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Unhandled Promise Rejection:', {
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString(),
    });
    
    // API エラーの場合は、ユーザーフレンドリーなメッセージを表示
    if (event.reason && typeof event.reason === 'object') {
        const message = formatErrorMessage(event.reason);
        if (message !== '予期しないエラーが発生しました') {
            // app.showToast が使える場合は使用
            if (window.app && window.app.showToast) {
                window.app.showToast(`エラー: ${message}`, 'error');
            }
        }
    }
});

// ========================================
// 連絡先管理機能 (User-Level Recipient Management)
// ========================================

// 連絡先管理モーダルを開く
async function openRecipientsModal() {
    console.log('🔵 openRecipientsModal called');
    
    // ログインチェック
    const token = window.apiClient.getToken();
    console.log('🔑 Token:', token ? 'exists' : 'missing');
    
    if (!token) {
        console.error('❌ Not logged in');
        alert('ログインが必要です');
        return;
    }
    
    // appオブジェクトの確認
    if (!window.app) {
        console.error('❌ App not initialized');
        alert('アプリケーションが初期化されていません。ページを再読み込みしてください。');
        return;
    }
    
    try {
        // ユーザーの連絡先一覧を取得
        console.log('📡 Fetching recipients...');
        const response = await window.apiClient.getRecipientsWithBooks();
        console.log('✅ API Response:', response);
        
        // レスポンスから recipients 配列を取得
        const recipients = response.recipients || [];
        console.log('✅ Recipients array:', recipients);
        
        // ユーザーの出納帳一覧を取得
        // 出納帳がまだロードされていない場合は、再ロード
        if (!window.app.books || window.app.books.length === 0) {
            console.log('📚 Books not loaded yet, loading now...');
            await window.app.loadBooksFromAPI();
        }
        
        const books = window.app.books || [];
        console.log('📚 Books:', books);
        
        // モーダル内のテーブルをレンダリング
        renderRecipientsTable(recipients, books);
        
        // モーダルを表示
        const modal = document.getElementById('recipients-modal');
        console.log('🎯 Modal element:', modal);
        if (modal) {
            modal.classList.remove('hidden');
            console.log('✅ Modal displayed');
        } else {
            console.error('❌ Modal element not found!');
            alert('モーダル要素が見つかりません');
        }
    } catch (error) {
        console.error('❌ Failed to load recipients:', error);
        alert('連絡先の読み込みに失敗しました: ' + (error.message || error));
        if (window.app && window.app.showToast) {
            window.app.showToast('連絡先の読み込みに失敗しました', 'error');
        }
    }
}

// 連絡先管理モーダルを閉じる
function closeRecipientsModal() {
    console.log('🔴 closeRecipientsModal called');
    const modal = document.getElementById('recipients-modal');
    if (modal) {
        modal.classList.add('hidden');
        console.log('✅ Modal hidden');
    }
}

// 連絡先一覧テーブルをレンダリング
function renderRecipientsTable(recipients, books) {
    const tbody = document.getElementById('recipients-table-body');
    tbody.innerHTML = '';
    
    if (recipients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="px-4 py-8 text-center text-gray-500">
                    <i class="fas fa-inbox text-3xl mb-2"></i>
                    <p>連絡先が登録されていません</p>
                    <p class="text-sm">「新規連絡先を追加」ボタンから登録してください</p>
                </td>
            </tr>
        `;
        return;
    }
    
    recipients.forEach(recipient => {
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        
        // 連絡先情報
        const recipientInfo = `
            <td class="px-4 py-3">
                <div class="font-medium">${escapeHtml(recipient.name)}</div>
                <div class="text-sm text-gray-500">${escapeHtml(recipient.email)}</div>
            </td>
        `;
        
        // 出納帳チェックボックス
        const bookCheckboxes = books.map(book => {
            const isAssigned = recipient.assigned_books && recipient.assigned_books.includes(book.id);
            return `
                <label class="flex items-center space-x-2 mr-4">
                    <input type="checkbox" 
                           data-recipient-id="${recipient.id}" 
                           data-book-id="${book.id}"
                           ${isAssigned ? 'checked' : ''}
                           onchange="handleBookAssignmentChange(${recipient.id}, ${book.id}, this.checked)"
                           class="form-checkbox h-4 w-4 text-blue-600">
                    <span class="text-sm">${escapeHtml(book.businessName || book.name || '出納帳')}</span>
                </label>
            `;
        }).join('');
        
        const bookColumn = `
            <td class="px-4 py-3">
                <div class="flex flex-wrap gap-2">
                    ${bookCheckboxes || '<span class="text-gray-400 text-sm">出納帳がありません</span>'}
                </div>
            </td>
        `;
        
        // 操作ボタン
        const actions = `
            <td class="px-4 py-3 text-right">
                <button onclick="editRecipient(${recipient.id})" 
                        class="text-blue-600 hover:text-blue-800 mr-3">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteRecipient(${recipient.id})" 
                        class="text-red-600 hover:text-red-800">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        
        tr.innerHTML = recipientInfo + bookColumn + actions;
        tbody.appendChild(tr);
    });
    
    // ✅ 新規追加: 新規連絡先追加フォーム用の出納帳チェックボックスを生成
    const newRecipientBooksContainer = document.getElementById('new-recipient-books-list');
    if (newRecipientBooksContainer) {
        if (books && books.length > 0) {
            newRecipientBooksContainer.innerHTML = books.map(book => `
                <label class="flex items-center space-x-2 mb-2">
                    <input type="checkbox" 
                           class="new-recipient-book-checkbox form-checkbox h-4 w-4 text-blue-600" 
                           value="${book.id}">
                    <span class="text-sm">${escapeHtml(book.businessName || book.name || '出納帳')}</span>
                </label>
            `).join('');
        } else {
            newRecipientBooksContainer.innerHTML = '<span class="text-gray-400 text-sm">出納帳がありません</span>';
        }
    }
    
    // ✅ 新規追加: 既存連絡先の出納帳チェックボックスを生成
    recipients.forEach(recipient => {
        const container = document.getElementById(`recipient-books-list-${recipient.id}`);
        if (container && books) {
            const assignedBookIds = recipient.assigned_books || [];
            
            container.innerHTML = books.map(book => `
                <label class="flex items-center space-x-2 mb-2">
                    <input type="checkbox" 
                           class="recipient-book-checkbox-${recipient.id} form-checkbox h-4 w-4 text-blue-600" 
                           value="${book.id}"
                           ${assignedBookIds.includes(book.id) ? 'checked' : ''}>
                    <span class="text-sm">${escapeHtml(book.businessName || book.name || '出納帳')}</span>
                </label>
            `).join('');
        }
    });
}

}

// 出納帳割り当て変更ハンドラー
async function handleBookAssignmentChange(recipientId, bookId, isChecked) {
    try {
        if (isChecked) {
            // 割り当てを追加
            await window.apiClient.assignRecipientToBook(recipientId, bookId);
            window.app.showToast('出納帳を割り当てました', 'success');
        } else {
            // 割り当てを削除
            await window.apiClient.unassignRecipientFromBook(recipientId, bookId);
            window.app.showToast('出納帳の割り当てを解除しました', 'success');
        }
    } catch (error) {
        console.error('Failed to update book assignment:', error);
        window.app.showToast('割り当ての変更に失敗しました', 'error');
        // チェックボックスを元に戻す
        event.target.checked = !isChecked;
    }
}

// 新規連絡先を追加
async function addNewRecipient() {
    const name = document.getElementById('new-recipient-name').value.trim();
    const email = document.getElementById('new-recipient-email').value.trim();
    
    if (!name || !email) {
        window.app.showToast('名前とメールアドレスを入力してください', 'error');
        return;
    }
    
    // ✅ 選択された出納帳IDを取得
    const selectedBookIds = [];
    document.querySelectorAll('.new-recipient-book-checkbox:checked').forEach(checkbox => {
        selectedBookIds.push(parseInt(checkbox.value));
    });
    
    try {
        await window.apiClient.request('/accounts/recipients', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                email: email,
                book_ids: selectedBookIds  // ✅ 出納帳IDを含める
            })
        });
        
        window.app.showToast('連絡先を追加しました', 'success');
        await openRecipientsModal();
    } catch (error) {
        console.error('Failed to add recipient:', error);
        window.app.showToast('連絡先の追加に失敗しました', 'error');
    }
}
    
    const email = prompt('メールアドレスを入力してください:');
    if (!email || email.trim() === '') return;
    
    // メールアドレスの簡易バリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        window.app.showToast('正しいメールアドレスを入力してください', 'error');
        return;
    }
    
    try {
        await window.apiClient.createRecipient(name.trim(), email.trim());
        window.app.showToast('連絡先を追加しました', 'success');
        
        // モーダルを再読み込み
        openRecipientsModal();
    } catch (error) {
        console.error('Failed to create recipient:', error);
        window.app.showToast('連絡先の追加に失敗しました', 'error');
    }
}

// 連絡先を編集
async function editRecipient(recipientId) {
    try {
        const recipients = await window.apiClient.getRecipientsWithBooks();
        const recipient = recipients.find(r => r.id === recipientId);
        if (!recipient) return;
        
        const name = prompt('連絡先の名前を入力してください:', recipient.name);
        if (!name || name.trim() === '') return;
        
        const email = prompt('メールアドレスを入力してください:', recipient.email);
        if (!email || email.trim() === '') return;
        
        // メールアドレスの簡易バリデーション
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            window.app.showToast('正しいメールアドレスを入力してください', 'error');
            return;
        }
        
        await window.apiClient.updateRecipient(recipientId, name.trim(), email.trim());
        window.app.showToast('連絡先を更新しました', 'success');
        
        // モーダルを再読み込み
        openRecipientsModal();
    } catch (error) {
        console.error('Failed to update recipient:', error);
        window.app.showToast('連絡先の更新に失敗しました', 'error');
    }
}

// 連絡先を削除
async function deleteRecipient(recipientId) {
    if (!confirm('この連絡先を削除してもよろしいですか？')) return;
    
    try {
        await window.apiClient.deleteRecipient(recipientId);
        window.app.showToast('連絡先を削除しました', 'success');
        
        // モーダルを再読み込み
        openRecipientsModal();
    } catch (error) {
        console.error('Failed to delete recipient:', error);
        window.app.showToast('連絡先の削除に失敗しました', 'error');
    }
}

// HTMLエスケープ関数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// グローバルに関数を公開
window.openRecipientsModal = openRecipientsModal;
window.closeRecipientsModal = closeRecipientsModal;
window.addNewRecipient = addNewRecipient;
window.editRecipient = editRecipient;
window.deleteRecipient = deleteRecipient;
window.handleBookAssignmentChange = handleBookAssignmentChange;

// ✅ 新規追加: 出納帳割り当てを変更（削除→再作成）
async function changeRecipientBooks(recipientId) {
    const recipients = await window.apiClient.request('/accounts/recipients');
    const recipient = recipients.recipients.find(r => r.id === recipientId);
    if (!recipient) return;
    
    // 選択された出納帳IDを取得
    const selectedBookIds = [];
    document.querySelectorAll(`.recipient-book-checkbox-${recipientId}:checked`).forEach(checkbox => {
        selectedBookIds.push(parseInt(checkbox.value));
    });
    
    if (!confirm(`「${recipient.name}」の出納帳割り当てを変更しますか？`)) {
        return;
    }
    
    try {
        // 1. 削除
        await window.apiClient.request(`/accounts/recipients/${recipientId}`, {
            method: 'DELETE'
        });
        
        // 2. 再作成（新しい出納帳割り当て）
        await window.apiClient.request('/accounts/recipients', {
            method: 'POST',
            body: JSON.stringify({
                name: recipient.name,
                email: recipient.email,
                book_ids: selectedBookIds
            })
        });
        
        window.app.showToast('出納帳割り当てを変更しました', 'success');
        await openRecipientsModal();
    } catch (error) {
        console.error('Failed to change book assignment:', error);
        window.app.showToast('出納帳割り当ての変更に失敗しました', 'error');
    }
}

// ✅ グローバル関数として公開
window.changeRecipientBooks = changeRecipientBooks;


// パフォーマンス監視
if ('PerformanceObserver' in window) {
    try {
        // Navigation timing
        const perfObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.entryType === 'navigation') {
                    console.log('⏱️ Page Load Performance:', {
                        domContentLoaded: `${entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart}ms`,
                        loadComplete: `${entry.loadEventEnd - entry.loadEventStart}ms`,
                        totalTime: `${entry.loadEventEnd - entry.fetchStart}ms`,
                    });
                }
            }
        });
        perfObserver.observe({ entryTypes: ['navigation'] });
    } catch (e) {
        // PerformanceObserver not supported
    }
}
