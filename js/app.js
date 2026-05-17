/**
 * WebFX - Myfxbook Dashboard Application
 * Pages: Login → All Accounts → Account Detail
 * Features: All API endpoints, date filters, win rate from history, community outlook
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========== State ==========
    let accounts = [];
    let selectedAccountId = null;
    let historyCache = {};

    // ========== Initialize ==========
    init();

    async function init() {
        bindEvents();
        if (MyfxbookAPI.restoreSession()) {
            // Validate session before showing dashboard
            try {
                const test = await MyfxbookAPI.getMyAccounts();
                if (test.error === false) {
                    showPage('accounts');
                    accounts = test.accounts || [];
                    const grid = document.getElementById('accounts-grid');
                    grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> กำลังคำนวณ Win Rate...</div>';
                    await loadAllHistories();
                    renderAccountCards();
                    loadCommunityOutlook();
                } else {
                    // Session expired
                    console.log('Session expired, showing login');
                    MyfxbookAPI.session = null;
                    localStorage.removeItem('myfxbook_session');
                    showPage('login');
                }
            } catch (e) {
                console.error('Session validation failed:', e);
                MyfxbookAPI.session = null;
                localStorage.removeItem('myfxbook_session');
                showPage('login');
            }
        } else {
            showPage('login');
        }
    }

    function bindEvents() {
        // Login
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        // Logout
        document.getElementById('btn-logout').addEventListener('click', handleLogout);
        document.getElementById('btn-logout-mobile').addEventListener('click', handleLogout);
        // Refresh
        document.getElementById('btn-refresh').addEventListener('click', () => {
            loadAccounts();
            loadCommunityOutlook();
        });
        // Back button
        document.getElementById('btn-back').addEventListener('click', () => {
            showPage('accounts');
        });
        // Detail tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
        // Date filter
        document.getElementById('btn-apply-date').addEventListener('click', applyDateFilter);
        // Quick date buttons
        document.querySelectorAll('.quick-date-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days);
                setQuickDate(days);
                document.querySelectorAll('.quick-date-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // ========== Page Navigation ==========
    function showPage(page) {
        document.getElementById('page-login').style.display = page === 'login' ? 'flex' : 'none';
        document.getElementById('page-accounts').style.display = page === 'accounts' ? 'block' : 'none';
        document.getElementById('page-detail').style.display = page === 'detail' ? 'block' : 'none';
    }

    // ========== Login ==========
    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const btn = document.getElementById('btn-login');
        const errorEl = document.getElementById('login-error');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';
        errorEl.style.display = 'none';

        try {
            const result = await MyfxbookAPI.login(email, password);
            if (result.error === false) {
                showPage('accounts');
                loadAccounts();
                loadCommunityOutlook();
            } else {
                errorEl.textContent = result.message || 'เข้าสู่ระบบไม่สำเร็จ';
                errorEl.style.display = 'block';
            }
        } catch (err) {
            errorEl.textContent = 'ไม่สามารถเชื่อมต่อ Myfxbook API ได้';
            errorEl.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ';
        }
    }

    async function handleLogout() {
        try { await MyfxbookAPI.logout(); } catch (e) {}
        accounts = [];
        historyCache = {};
        showPage('login');
    }

    // ========== All Accounts Page ==========
    async function loadAccounts() {
        const grid = document.getElementById('accounts-grid');
        grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดบัญชี...</div>';

        try {
            const result = await MyfxbookAPI.getMyAccounts();
            console.log('get-my-accounts response:', JSON.stringify(result).substring(0, 500));

            if (result.error === false && result.accounts) {
                accounts = result.accounts;
                // Load history for all accounts first, then render with win rates
                grid.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> กำลังคำนวณ Win Rate...</div>';
                await loadAllHistories();
                renderAccountCards();
            } else {
                if (result.message && result.message.toLowerCase().includes('session')) {
                    handleLogout();
                    return;
                }
                grid.innerHTML = '<div class="loading-state">ไม่สามารถโหลดข้อมูลบัญชีได้</div>';
            }
        } catch (err) {
            console.error('loadAccounts error:', err);
            grid.innerHTML = '<div class="loading-state">เกิดข้อผิดพลาด</div>';
        }
    }

    async function loadAllHistories() {
        // Clear cache and reload fresh
        historyCache = {};
        // Load sequentially to avoid Myfxbook rate limit
        for (const acc of accounts) {
            const id = String(acc.id);
            try {
                const result = await MyfxbookAPI.getHistory(id);
                console.log(`History for ${acc.name} (${id}):`, 
                    result.error === false 
                        ? (result.history ? result.history.length + ' trades' : 'no history array') 
                        : ('ERROR: ' + result.message));
                if (result.error === false) {
                    // Myfxbook may return history as array or empty
                    historyCache[id] = Array.isArray(result.history) ? result.history : [];
                } else {
                    // If error (possibly rate limit), retry once after delay
                    console.log(`Retrying history for ${acc.name}...`);
                    await new Promise(r => setTimeout(r, 1000));
                    const retry = await MyfxbookAPI.getHistory(id);
                    if (retry.error === false && Array.isArray(retry.history)) {
                        historyCache[id] = retry.history;
                    } else {
                        historyCache[id] = [];
                    }
                }
            } catch (e) {
                console.error(`Failed to load history for ${id}:`, e);
                historyCache[id] = [];
            }
        }
    }

    function calcWinRate(accountId) {
        const key = String(accountId);
        if (!(key in historyCache)) return 'N/A';
        const history = historyCache[key];
        if (!history || history.length === 0) return 'N/A';
        // Count all trades in history (they are all closed trades from get-history endpoint)
        const wins = history.filter(t => parseFloat(t.profit) > 0).length;
        return ((wins / history.length) * 100).toFixed(1);
    }

    function renderAccountCards() {
        const grid = document.getElementById('accounts-grid');
        if (accounts.length === 0) {
            grid.innerHTML = '<div class="loading-state">ไม่พบบัญชี</div>';
            return;
        }

        grid.innerHTML = accounts.map(acc => {
            // Myfxbook fields — handle both direct and nested formats
            const profit = parseFloat(acc.profit) || 0;
            const gain = parseFloat(acc.gain) || 0;
            const drawdown = parseFloat(acc.drawdown) || 0;
            const balance = parseFloat(acc.balance) || 0;
            const equity = parseFloat(acc.equity) || 0;
            const deposits = parseFloat(acc.deposits) || 0;
            const winRate = calcWinRate(acc.id);
            const accId = String(acc.id);

            return `
                <div class="account-card" data-account-id="${accId}" onclick="window.openAccountDetail('${accId}')">
                    <div class="account-card-header">
                        <div class="account-name">${acc.name || 'Unnamed'}</div>
                        <div class="account-server">${acc.server || ''} ${acc.currency ? '(' + acc.currency + ')' : ''}</div>
                    </div>
                    <div class="account-card-body">
                        <div class="account-stat">
                            <span class="stat-label">Balance</span>
                            <span class="stat-value">${formatCurrency(balance)}</span>
                        </div>
                        <div class="account-stat">
                            <span class="stat-label">Equity</span>
                            <span class="stat-value">${formatCurrency(equity)}</span>
                        </div>
                        <div class="account-stat">
                            <span class="stat-label">Profit</span>
                            <span class="stat-value ${profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(profit)}</span>
                        </div>
                        <div class="account-stat">
                            <span class="stat-label">Gain</span>
                            <span class="stat-value ${gain >= 0 ? 'positive' : 'negative'}">${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%</span>
                        </div>
                        <div class="account-stat">
                            <span class="stat-label">Drawdown</span>
                            <span class="stat-value negative">${drawdown.toFixed(2)}%</span>
                        </div>
                        <div class="account-stat">
                            <span class="stat-label">Win Rate</span>
                            <span class="stat-value">${winRate === 'N/A' ? 'N/A' : winRate + '%'}</span>
                        </div>
                    </div>
                    <div class="account-card-footer">
                        <span class="trades-count"><i class="fas fa-exchange-alt"></i> ${acc.trades || 0} trades</span>
                        <span class="view-detail"><i class="fas fa-arrow-right"></i> รายละเอียด</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ========== Account Detail Page ==========
    window.openAccountDetail = function(accountId) {
        const accId = String(accountId);
        selectedAccountId = accId;
        const acc = accounts.find(a => String(a.id) === accId);
        if (!acc) {
            console.error('Account not found:', accId);
            return;
        }

        showPage('detail');
        renderDetailOverview(acc);
        setDefaultDates();
        switchTab('open-trades');
        loadDetailData(accId);
    };

    function renderDetailOverview(acc) {
        const profit = parseFloat(acc.profit) || 0;
        const gain = parseFloat(acc.gain) || 0;
        const drawdown = parseFloat(acc.drawdown) || 0;
        const balance = parseFloat(acc.balance) || 0;
        const equity = parseFloat(acc.equity) || 0;
        const winRate = calcWinRate(acc.id);

        document.getElementById('detail-account-name').textContent = acc.name || 'Account';
        document.getElementById('detail-server').textContent = `${acc.server || ''} ${acc.currency ? '(' + acc.currency + ')' : ''}`;

        document.getElementById('detail-balance').textContent = formatCurrency(balance);
        document.getElementById('detail-equity').textContent = formatCurrency(equity);

        const profitEl = document.getElementById('detail-profit');
        profitEl.textContent = formatCurrency(profit);
        profitEl.className = `stat-value ${profit >= 0 ? 'positive' : 'negative'}`;

        const gainEl = document.getElementById('detail-gain');
        gainEl.textContent = `${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%`;
        gainEl.className = `stat-value ${gain >= 0 ? 'positive' : 'negative'}`;

        const ddEl = document.getElementById('detail-drawdown');
        ddEl.textContent = `${drawdown.toFixed(2)}%`;
        ddEl.className = 'stat-value negative';

        const wrEl = document.getElementById('detail-winrate');
        const wr = calcWinRate(acc.id);
        wrEl.textContent = wr === 'loading' ? '...' : (wr === 'N/A' ? 'N/A' : wr + '%');

        document.getElementById('detail-trades').textContent = acc.trades || 0;
        document.getElementById('detail-deposits').textContent = formatCurrency(parseFloat(acc.deposits) || 0);
    }

    async function loadDetailData(accountId) {
        loadOpenTrades(accountId);
        loadOpenOrders(accountId);
        loadHistory(accountId);
        loadDateRangeData(accountId);
    }

    // ========== Open Trades ==========
    async function loadOpenTrades(accountId) {
        const tbody = document.getElementById('open-trades-body');
        tbody.innerHTML = loadingRow(10);

        try {
            const result = await MyfxbookAPI.getOpenTrades(accountId);
            console.log('get-open-trades response:', result);

            if (result.error === false && result.openTrades && result.openTrades.length > 0) {
                tbody.innerHTML = result.openTrades.map(t => {
                    const lots = t.sizing ? t.sizing.value : (t.lots || '-');
                    const profit = parseFloat(t.profit) || 0;
                    const pips = parseFloat(t.pips) || 0;
                    return `
                    <tr>
                        <td><strong>${t.symbol || '-'}</strong></td>
                        <td><span class="badge ${(t.action || '').toLowerCase().includes('buy') ? 'badge-buy' : 'badge-sell'}">${t.action || '-'}</span></td>
                        <td>${lots}</td>
                        <td>${t.openPrice || '-'}</td>
                        <td>${t.currentPrice || '-'}</td>
                        <td>${t.tp || '-'}</td>
                        <td>${t.sl || '-'}</td>
                        <td class="${profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(profit)}</td>
                        <td class="${pips >= 0 ? 'positive' : 'negative'}">${pips.toFixed(1)}</td>
                        <td>${formatDateTime(t.openTime)}</td>
                    </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = emptyRow(10, 'ไม่มี Open Trades');
            }
        } catch (e) {
            console.error('loadOpenTrades error:', e);
            tbody.innerHTML = emptyRow(10, 'เกิดข้อผิดพลาด');
        }
    }

    // ========== Open Orders ==========
    async function loadOpenOrders(accountId) {
        const tbody = document.getElementById('open-orders-body');
        tbody.innerHTML = loadingRow(7);

        try {
            const result = await MyfxbookAPI.getOpenOrders(accountId);
            console.log('get-open-orders response:', result);

            if (result.error === false && result.openOrders && result.openOrders.length > 0) {
                tbody.innerHTML = result.openOrders.map(o => {
                    const lots = o.sizing ? o.sizing.value : (o.lots || '-');
                    return `
                    <tr>
                        <td><strong>${o.symbol || '-'}</strong></td>
                        <td><span class="badge ${(o.action || '').toLowerCase().includes('buy') ? 'badge-buy' : 'badge-sell'}">${o.action || '-'}</span></td>
                        <td>${lots}</td>
                        <td>${o.openPrice || '-'}</td>
                        <td>${o.tp || '-'}</td>
                        <td>${o.sl || '-'}</td>
                        <td>${formatDateTime(o.openTime)}</td>
                    </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = emptyRow(7, 'ไม่มี Open Orders');
            }
        } catch (e) {
            console.error('loadOpenOrders error:', e);
            tbody.innerHTML = emptyRow(7, 'เกิดข้อผิดพลาด');
        }
    }

    // ========== History ==========
    async function loadHistory(accountId) {
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = loadingRow(11);
        const key = String(accountId);

        try {
            // Always fetch fresh from API for detail page
            const result = await MyfxbookAPI.getHistory(accountId);
            console.log('get-history response:', result);
            let history = [];
            if (result.error === false && result.history) {
                history = result.history;
                historyCache[key] = history;
            }

            if (history.length > 0) {
                const trades = history.slice(-100).reverse();
                tbody.innerHTML = trades.map(t => {
                    const lots = t.sizing ? t.sizing.value : (t.lots || '-');
                    const profit = parseFloat(t.profit) || 0;
                    const pips = parseFloat(t.pips) || 0;
                    return `
                    <tr>
                        <td><strong>${t.symbol || '-'}</strong></td>
                        <td><span class="badge ${(t.action || '').toLowerCase().includes('buy') ? 'badge-buy' : 'badge-sell'}">${t.action || '-'}</span></td>
                        <td>${lots}</td>
                        <td>${t.openPrice || '-'}</td>
                        <td>${t.closePrice || '-'}</td>
                        <td>${t.tp || '-'}</td>
                        <td>${t.sl || '-'}</td>
                        <td class="${profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(profit)}</td>
                        <td class="${pips >= 0 ? 'positive' : 'negative'}">${pips.toFixed(1)}</td>
                        <td>${formatDateTime(t.openTime)}</td>
                        <td>${formatDateTime(t.closeTime)}</td>
                    </tr>
                    `;
                }).join('');

                // Update win rate display
                const wrEl = document.getElementById('detail-winrate');
                const wr = calcWinRate(accountId);
                wrEl.textContent = wr === 'N/A' ? 'N/A' : wr + '%';
            } else {
                tbody.innerHTML = emptyRow(11, 'ไม่มีประวัติการเทรด');
            }
        } catch (e) {
            console.error('loadHistory error:', e);
            tbody.innerHTML = emptyRow(11, 'เกิดข้อผิดพลาด');
        }
    }

    // ========== Date Range Data ==========
    function setDefaultDates() {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        document.getElementById('date-start').value = formatDateInput(start);
        document.getElementById('date-end').value = formatDateInput(end);
    }

    function setQuickDate(days) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        document.getElementById('date-start').value = formatDateInput(start);
        document.getElementById('date-end').value = formatDateInput(end);
        applyDateFilter();
    }

    function applyDateFilter() {
        if (!selectedAccountId) return;
        loadDateRangeData(selectedAccountId);
    }

    async function loadDateRangeData(accountId) {
        const start = document.getElementById('date-start').value;
        const end = document.getElementById('date-end').value;
        if (!start || !end) return;

        loadDailyGain(accountId, start, end);
        loadDataDaily(accountId, start, end);
        loadGain(accountId, start, end);
    }

    // ========== Daily Gain ==========
    async function loadDailyGain(accountId, start, end) {
        const tbody = document.getElementById('daily-gain-body');
        tbody.innerHTML = loadingRow(3);

        try {
            const result = await MyfxbookAPI.getDailyGain(accountId, start, end);
            console.log('get-daily-gain response:', result);

            if (result.error === false && result.dailyGain && result.dailyGain.length > 0) {
                let cumulative = 0;
                const rows = result.dailyGain.slice().reverse();
                tbody.innerHTML = rows.map(d => {
                    const val = parseFloat(d.value) || 0;
                    cumulative += val;
                    return `
                        <tr>
                            <td>${d.date || '-'}</td>
                            <td class="${val >= 0 ? 'positive' : 'negative'}">${val >= 0 ? '+' : ''}${val.toFixed(4)}%</td>
                            <td class="${cumulative >= 0 ? 'positive' : 'negative'}">${cumulative >= 0 ? '+' : ''}${cumulative.toFixed(4)}%</td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = emptyRow(3, 'ไม่มีข้อมูล');
            }
        } catch (e) {
            console.error('loadDailyGain error:', e);
            tbody.innerHTML = emptyRow(3, 'เกิดข้อผิดพลาด');
        }
    }

    // ========== Data Daily ==========
    async function loadDataDaily(accountId, start, end) {
        const tbody = document.getElementById('data-daily-body');
        tbody.innerHTML = loadingRow(6);

        try {
            const result = await MyfxbookAPI.getDataDaily(accountId, start, end);
            console.log('get-data-daily response:', result);

            if (result.error === false && result.dataDaily && result.dataDaily.length > 0) {
                const rows = result.dataDaily.slice().reverse();
                tbody.innerHTML = rows.map(d => `
                    <tr>
                        <td>${d.date || '-'}</td>
                        <td>${formatCurrency(parseFloat(d.balance) || 0)}</td>
                        <td>${formatCurrency(parseFloat(d.equity) || 0)}</td>
                        <td class="${parseFloat(d.profit) >= 0 ? 'positive' : 'negative'}">${formatCurrency(parseFloat(d.profit) || 0)}</td>
                        <td>${formatCurrency(parseFloat(d.deposits) || 0)}</td>
                        <td>${formatCurrency(parseFloat(d.withdrawals) || 0)}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = emptyRow(6, 'ไม่มีข้อมูล');
            }
        } catch (e) {
            console.error('loadDataDaily error:', e);
            tbody.innerHTML = emptyRow(6, 'เกิดข้อผิดพลาด');
        }
    }

    // ========== Gain ==========
    async function loadGain(accountId, start, end) {
        const container = document.getElementById('gain-data');
        container.innerHTML = '<div class="gain-display"><div class="gain-label"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div></div>';

        try {
            const result = await MyfxbookAPI.getGain(accountId, start, end);
            console.log('get-gain response:', result);

            if (result.error === false && result.value !== undefined) {
                const val = parseFloat(result.value) || 0;
                container.innerHTML = `
                    <div class="gain-display">
                        <div class="gain-value ${val >= 0 ? 'positive' : 'negative'}">${val >= 0 ? '+' : ''}${val.toFixed(2)}%</div>
                        <div class="gain-label">ผลกำไรช่วงเวลาที่เลือก</div>
                    </div>
                `;
            } else {
                container.innerHTML = '<div class="gain-display"><div class="gain-label">ไม่มีข้อมูล</div></div>';
            }
        } catch (e) {
            console.error('loadGain error:', e);
            container.innerHTML = '<div class="gain-display"><div class="gain-label">เกิดข้อผิดพลาด</div></div>';
        }
    }

    // ========== Community Outlook ==========
    async function loadCommunityOutlook() {
        const container = document.getElementById('community-outlook');
        if (!container) return;

        try {
            const result = await MyfxbookAPI.getCommunityOutlook();
            console.log('get-community-outlook response:', result);

            if (result.error === false && result.symbols) {
                const symbols = result.symbols.slice(0, 12);
                container.innerHTML = `
                    <div class="outlook-grid">
                        ${symbols.map(s => {
                            const longPct = parseFloat(s.longPercentage) || 0;
                            const shortPct = parseFloat(s.shortPercentage) || 0;
                            return `
                                <div class="outlook-card">
                                    <div class="outlook-symbol">${s.name || '-'}</div>
                                    <div class="outlook-bar">
                                        <div class="bar-long" style="width: ${longPct}%"></div>
                                        <div class="bar-short" style="width: ${shortPct}%"></div>
                                    </div>
                                    <div class="outlook-labels">
                                        <span class="positive">${longPct.toFixed(0)}% Long</span>
                                        <span class="negative">${shortPct.toFixed(0)}% Short</span>
                                    </div>
                                    <div class="outlook-volumes">
                                        <span>Vol L: ${s.longVolume || 0}</span>
                                        <span>Vol S: ${s.shortVolume || 0}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else {
                container.innerHTML = '<div class="loading-state">ไม่สามารถโหลด Community Outlook</div>';
            }
        } catch (e) {
            console.error('loadCommunityOutlook error:', e);
            container.innerHTML = '<div class="loading-state">เกิดข้อผิดพลาด</div>';
        }
    }

    // ========== Tab Switching ==========
    function switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel-${tabId}`);
        });
    }

    // ========== Helpers ==========
    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
    }

    function formatDateTime(str) {
        if (!str) return '-';
        try {
            const d = new Date(str);
            if (isNaN(d.getTime())) return str;
            return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
                   d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        } catch { return str; }
    }

    function formatDateInput(date) {
        return date.toISOString().split('T')[0];
    }

    function loadingRow(cols) {
        return `<tr><td colspan="${cols}" class="empty-state"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>`;
    }

    function emptyRow(cols, msg) {
        return `<tr><td colspan="${cols}" class="empty-state">${msg}</td></tr>`;
    }
});
