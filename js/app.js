/**
 * WebFX - Myfxbook Dashboard Application
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const userEmail = document.getElementById('user-email');
    const btnLogout = document.getElementById('btn-logout');
    const accountSelect = document.getElementById('account-select');
    const btnRefresh = document.getElementById('btn-refresh');
    const loading = document.getElementById('loading');
    const accountOverview = document.getElementById('account-overview');
    const tabsSection = document.getElementById('tabs-section');

    // State
    let accounts = [];
    let selectedAccount = null;

    // ========== Initialize ==========
    init();

    function init() {
        // Check for existing session
        if (MyfxbookAPI.restoreSession()) {
            showDashboard();
            loadAccounts();
        }

        // Event Listeners
        loginForm.addEventListener('submit', handleLogin);
        btnLogout.addEventListener('click', handleLogout);
        accountSelect.addEventListener('change', handleAccountChange);
        btnRefresh.addEventListener('click', handleRefresh);

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
    }

    // ========== Login ==========
    async function handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        // UI state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';
        hideError();

        try {
            const result = await MyfxbookAPI.login(email, password);

            if (result.error === false) {
                showDashboard();
                loadAccounts();
            } else {
                showError(result.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่าน');
            }
        } catch (error) {
            showError('ไม่สามารถเชื่อมต่อกับ Myfxbook ได้ กรุณาลองใหม่อีกครั้ง');
            console.error('Login error:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ';
        }
    }

    // ========== Logout ==========
    async function handleLogout() {
        try {
            await MyfxbookAPI.logout();
        } catch (error) {
            console.error('Logout error:', error);
        }
        showLogin();
    }

    // ========== Load Accounts ==========
    async function loadAccounts() {
        showLoading(true);

        try {
            const result = await MyfxbookAPI.getMyAccounts();

            if (result.error === false && result.accounts) {
                accounts = result.accounts;
                populateAccountSelect(accounts);

                // Auto-select first account
                if (accounts.length > 0) {
                    accountSelect.value = accounts[0].id;
                    handleAccountChange();
                }
            } else {
                // Session expired
                if (result.message && result.message.includes('session')) {
                    showLogin();
                    showError('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
                }
            }
        } catch (error) {
            console.error('Load accounts error:', error);
        } finally {
            showLoading(false);
        }
    }

    // ========== Account Selection ==========
    function populateAccountSelect(accounts) {
        accountSelect.innerHTML = '<option value="">-- เลือกบัญชี --</option>';
        accounts.forEach(acc => {
            const option = document.createElement('option');
            option.value = acc.id;
            option.textContent = `${acc.name} (${acc.server || 'N/A'}) - ${acc.currency || 'USD'}`;
            accountSelect.appendChild(option);
        });
    }

    async function handleAccountChange() {
        const accountId = accountSelect.value;
        if (!accountId) {
            accountOverview.style.display = 'none';
            tabsSection.style.display = 'none';
            return;
        }

        selectedAccount = accounts.find(a => a.id == accountId);
        if (selectedAccount) {
            displayAccountOverview(selectedAccount);
            accountOverview.style.display = 'grid';
            tabsSection.style.display = 'block';

            // Load tab data
            loadOpenTrades(accountId);
            loadHistory(accountId);
            loadDailyGain(accountId);
        }
    }

    function handleRefresh() {
        const btn = document.getElementById('btn-refresh');
        btn.querySelector('i').classList.add('fa-spin');
        
        loadAccounts().finally(() => {
            setTimeout(() => {
                btn.querySelector('i').classList.remove('fa-spin');
            }, 500);
        });
    }

    // ========== Display Account Overview ==========
    function displayAccountOverview(account) {
        const balance = parseFloat(account.balance) || 0;
        const equity = parseFloat(account.equity) || 0;
        const profit = parseFloat(account.profit) || 0;
        const gain = parseFloat(account.gain) || 0;
        const drawdown = parseFloat(account.drawdown) || 0;
        const trades = account.trades || 0;

        document.getElementById('balance').textContent = formatCurrency(balance);
        document.getElementById('equity').textContent = formatCurrency(equity);

        const profitEl = document.getElementById('profit');
        profitEl.textContent = formatCurrency(profit);
        profitEl.className = `card-value ${profit >= 0 ? 'positive' : 'negative'}`;

        const gainEl = document.getElementById('gain');
        gainEl.textContent = `${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%`;
        gainEl.className = `card-value ${gain >= 0 ? 'positive' : 'negative'}`;

        const drawdownEl = document.getElementById('drawdown');
        drawdownEl.textContent = `${drawdown.toFixed(2)}%`;
        drawdownEl.className = 'card-value negative';

        document.getElementById('trades-count').textContent = trades.toLocaleString();
    }

    // ========== Load Open Trades ==========
    async function loadOpenTrades(accountId) {
        const tbody = document.getElementById('open-trades-body');
        tbody.innerHTML = '<tr><td colspan="8" class="no-data"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

        try {
            const result = await MyfxbookAPI.getOpenTrades(accountId);

            if (result.error === false && result.openTrades && result.openTrades.length > 0) {
                tbody.innerHTML = result.openTrades.map(trade => `
                    <tr>
                        <td><strong>${trade.symbol || '-'}</strong></td>
                        <td><span class="${trade.action === 'Buy' ? 'buy-badge' : 'sell-badge'}">${trade.action || '-'}</span></td>
                        <td>${trade.sizing && trade.sizing.value ? trade.sizing.value : (trade.lots || '-')}</td>
                        <td>${trade.openPrice || '-'}</td>
                        <td>${trade.currentPrice || '-'}</td>
                        <td class="${parseFloat(trade.profit) >= 0 ? 'positive' : 'negative'}">
                            ${formatCurrency(parseFloat(trade.profit) || 0)}
                        </td>
                        <td class="${parseFloat(trade.pips) >= 0 ? 'positive' : 'negative'}">
                            ${trade.pips || '0'}
                        </td>
                        <td>${formatDate(trade.openTime)}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="8" class="no-data">ไม่มี Open Trades ในขณะนี้</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
            console.error('Open trades error:', error);
        }
    }

    // ========== Load History ==========
    async function loadHistory(accountId) {
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = '<tr><td colspan="9" class="no-data"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

        try {
            const result = await MyfxbookAPI.getHistory(accountId);

            if (result.error === false && result.history && result.history.length > 0) {
                // Show latest 50 trades
                const trades = result.history.slice(-50).reverse();
                tbody.innerHTML = trades.map(trade => `
                    <tr>
                        <td><strong>${trade.symbol || '-'}</strong></td>
                        <td><span class="${trade.action === 'Buy' ? 'buy-badge' : 'sell-badge'}">${trade.action || '-'}</span></td>
                        <td>${trade.sizing && trade.sizing.value ? trade.sizing.value : (trade.lots || '-')}</td>
                        <td>${trade.openPrice || '-'}</td>
                        <td>${trade.closePrice || '-'}</td>
                        <td class="${parseFloat(trade.profit) >= 0 ? 'positive' : 'negative'}">
                            ${formatCurrency(parseFloat(trade.profit) || 0)}
                        </td>
                        <td class="${parseFloat(trade.pips) >= 0 ? 'positive' : 'negative'}">
                            ${trade.pips || '0'}
                        </td>
                        <td>${formatDate(trade.openTime)}</td>
                        <td>${formatDate(trade.closeTime)}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="9" class="no-data">ไม่มีข้อมูลประวัติการเทรด</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="9" class="no-data">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
            console.error('History error:', error);
        }
    }

    // ========== Load Daily Gain ==========
    async function loadDailyGain(accountId) {
        const tbody = document.getElementById('daily-gain-body');
        tbody.innerHTML = '<tr><td colspan="3" class="no-data"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

        try {
            // Get last 30 days
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 30);

            const startStr = formatDateAPI(start);
            const endStr = formatDateAPI(end);

            const result = await MyfxbookAPI.getDailyGain(accountId, startStr, endStr);

            if (result.error === false && result.dailyGain && result.dailyGain.length > 0) {
                const gains = result.dailyGain.slice(-30).reverse();
                let cumulativeGain = 0;

                tbody.innerHTML = gains.map(day => {
                    const dailyProfit = parseFloat(day.value) || 0;
                    cumulativeGain += dailyProfit;
                    return `
                        <tr>
                            <td>${day.date || '-'}</td>
                            <td class="${dailyProfit >= 0 ? 'positive' : 'negative'}">
                                ${dailyProfit >= 0 ? '+' : ''}${dailyProfit.toFixed(4)}%
                            </td>
                            <td class="${cumulativeGain >= 0 ? 'positive' : 'negative'}">
                                ${cumulativeGain >= 0 ? '+' : ''}${cumulativeGain.toFixed(4)}%
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="no-data">ไม่มีข้อมูลกำไรรายวัน</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="3" class="no-data">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
            console.error('Daily gain error:', error);
        }
    }

    // ========== Tab Switching ==========
    function switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId);
        });
    }

    // ========== UI Helpers ==========
    function showDashboard() {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
        const email = localStorage.getItem('myfxbook_email') || '';
        userEmail.textContent = email;
    }

    function showLogin() {
        loginSection.style.display = 'flex';
        dashboardSection.style.display = 'none';
        accountOverview.style.display = 'none';
        tabsSection.style.display = 'none';
        loginForm.reset();
    }

    function showLoading(show) {
        loading.style.display = show ? 'block' : 'none';
    }

    function showError(message) {
        loginError.textContent = message;
        loginError.classList.add('show');
    }

    function hideError() {
        loginError.classList.remove('show');
    }

    // ========== Formatters ==========
    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(value);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('th-TH', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    }

    function formatDateAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
});
