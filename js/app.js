/**
 * WebFX - Forex Analytics Dashboard (No Charts)
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const userEmail = document.getElementById('user-email');
    const btnLogout = document.getElementById('btn-logout');
    const btnRefresh = document.getElementById('btn-refresh');
    const accountSelect = document.getElementById('account-select');
    const loading = document.getElementById('loading');
    const mainContent = document.getElementById('main-content');
    const allAccountsView = document.getElementById('all-accounts-view');
    const accountDetailView = document.getElementById('account-detail-view');

    let accounts = [];
    let selectedAccount = null;
    let allHistory = [];
    let allDailyGain = [];
    let allDailyData = [];

    init();

    function init() {
        if (MyfxbookAPI.restoreSession()) {
            showDashboard();
            loadAccounts();
        }

        loginForm.addEventListener('submit', handleLogin);
        btnLogout.addEventListener('click', handleLogout);
        btnRefresh.addEventListener('click', handleRefresh);
        accountSelect.addEventListener('change', handleAccountChange);

        // View switching
        document.querySelectorAll('.nav-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-view-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const view = e.currentTarget.dataset.view;
                if (view === 'all-accounts') {
                    showAllAccountsView();
                } else {
                    showAccountDetailView();
                }
            });
        });

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

        // History filter
        document.getElementById('history-search').addEventListener('input', filterHistory);
        document.getElementById('history-filter').addEventListener('change', filterHistory);
    }

    // ========== Views ==========
    function showAllAccountsView() {
        allAccountsView.style.display = 'block';
        accountDetailView.style.display = 'none';
        renderAccountsGrid();
    }

    function showAccountDetailView() {
        allAccountsView.style.display = 'none';
        accountDetailView.style.display = 'block';
    }

    function openAccountDetail(accId) {
        document.querySelectorAll('.nav-view-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-view-detail').classList.add('active');
        showAccountDetailView();
        accountSelect.value = accId;
        handleAccountChange();
    }

    // ========== Login / Logout ==========
    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        hideError();

        try {
            const result = await MyfxbookAPI.login(email, password);
            console.log('[LOGIN] Result:', result);
            if (result.error === false && result.session) {
                showDashboard();
                await loadAccounts();
            } else {
                showError(result.message || 'Login failed.');
            }
        } catch (err) {
            console.error('[LOGIN] Error:', err);
            showError('Cannot connect to Myfxbook: ' + (err.message || 'Unknown error'));
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        }
    }

    async function handleLogout() {
        try { await MyfxbookAPI.logout(); } catch(e) {}
        MyfxbookAPI.clearSession();
        showLogin();
    }

    // ========== Load Accounts ==========
    async function loadAccounts() {
        showLoading(true);
        try {
            const result = await MyfxbookAPI.getMyAccounts();
            console.log('[ACCOUNTS] Result:', result);

            if (result.error === false && Array.isArray(result.accounts)) {
                accounts = result.accounts;

                if (accounts.length === 0) {
                    allAccountsView.style.display = 'block';
                    document.getElementById('accounts-grid').innerHTML = `
                        <div style="grid-column: 1/-1; text-align:center; padding:60px 20px;">
                            <i class="fas fa-info-circle" style="font-size:40px; color:var(--accent); margin-bottom:14px;"></i>
                            <h3>No Forex Accounts Linked</h3>
                            <p style="color:var(--text-secondary); margin-top:8px;">Add accounts at <a href="https://www.myfxbook.com/portfolio" target="_blank" style="color:var(--accent);">myfxbook.com</a></p>
                        </div>
                    `;
                    return;
                }

                populateAccountSelect(accounts);
                document.getElementById('accounts-count').textContent = `${accounts.length} account${accounts.length > 1 ? 's' : ''}`;
                showAllAccountsView();
            } else {
                console.warn('[ACCOUNTS] Failed:', result);
                MyfxbookAPI.clearSession();
                showLogin();
                showError('Session expired. Please login again. ' + (result.message || ''));
            }
        } catch (err) {
            console.error('[ACCOUNTS] Error:', err);
            showLogin();
            showError('Failed to load accounts: ' + (err.message || ''));
        } finally {
            showLoading(false);
        }
    }

    function populateAccountSelect(accs) {
        accountSelect.innerHTML = '<option value="">-- Select Account --</option>';
        accs.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            opt.textContent = `${acc.name} - ${acc.server || 'N/A'} (${acc.currency || 'USD'})`;
            accountSelect.appendChild(opt);
        });
    }

    // ========== Accounts Grid ==========
    function renderAccountsGrid() {
        const grid = document.getElementById('accounts-grid');
        if (accounts.length === 0) return;

        grid.innerHTML = accounts.map(acc => {
            const gain = num(acc.gain);
            const profit = num(acc.profit);
            const balance = num(acc.balance);
            const equity = num(acc.equity);
            const drawdown = num(acc.drawdown);
            const trades = num(acc.trades);
            const pips = num(acc.pips);
            const winRate = getWinRate(acc);

            return `
                <div class="account-card" data-id="${acc.id}">
                    <div class="account-card-header">
                        <div>
                            <h3>${acc.name || 'Unnamed'}</h3>
                            <span class="acc-broker">${acc.broker || '-'} / ${acc.server || '-'}</span>
                        </div>
                        <span class="account-card-badge ${acc.demo ? 'demo' : 'live'}">${acc.demo ? 'Demo' : 'Live'}</span>
                    </div>
                    <div class="account-card-stats">
                        <div class="account-card-stat">
                            <span class="label">Balance</span>
                            <span class="value">${fmtMoney(balance)}</span>
                        </div>
                        <div class="account-card-stat">
                            <span class="label">Equity</span>
                            <span class="value">${fmtMoney(equity)}</span>
                        </div>
                        <div class="account-card-stat">
                            <span class="label">Gain</span>
                            <span class="value ${gain >= 0 ? 'positive' : 'negative'}">${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%</span>
                        </div>
                        <div class="account-card-stat">
                            <span class="label">Profit</span>
                            <span class="value ${profit >= 0 ? 'positive' : 'negative'}">${fmtMoney(profit)}</span>
                        </div>
                        <div class="account-card-stat">
                            <span class="label">Drawdown</span>
                            <span class="value negative">${drawdown.toFixed(2)}%</span>
                        </div>
                        <div class="account-card-stat">
                            <span class="label">Win Rate</span>
                            <span class="value">${winRate.toFixed(1)}%</span>
                        </div>
                        <div class="account-card-stat">
                            <span class="label">Trades</span>
                            <span class="value">${trades}</span>
                        </div>
                        <div class="account-card-stat">
                            <span class="label">Pips</span>
                            <span class="value ${pips >= 0 ? 'positive' : 'negative'}">${pips.toFixed(1)}</span>
                        </div>
                    </div>
                    <div class="account-card-footer">
                        <span>${acc.currency || 'USD'} | Leverage 1:${acc.leverage || '-'}</span>
                        <button class="view-btn" onclick="event.stopPropagation()">View Detail</button>
                    </div>
                </div>
            `;
        }).join('');

        // Click handlers
        grid.querySelectorAll('.account-card').forEach(card => {
            card.addEventListener('click', () => openAccountDetail(card.dataset.id));
            card.querySelector('.view-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openAccountDetail(card.dataset.id);
            });
        });
    }

    // ========== Account Detail ==========
    async function handleAccountChange() {
        const accountId = accountSelect.value;
        if (!accountId) {
            mainContent.style.display = 'none';
            return;
        }
        selectedAccount = accounts.find(a => a.id == accountId);
        if (!selectedAccount) return;

        mainContent.style.display = 'block';
        displayAccountInfo(selectedAccount);
        displayKeyStats(selectedAccount);
        displayAdvancedStats(selectedAccount);

        await reloadAllData();
    }

    async function reloadAllData() {
        if (!selectedAccount) return;
        const id = selectedAccount.id;

        await Promise.all([
            loadDailyGain(id),
            loadDailyData(id),
            loadHistory(id),
            loadOpenTrades(id),
            loadOpenOrders(id)
        ]);

        renderMonthlyTable();
        renderDailyGainTable();
    }

    async function handleRefresh() {
        const icon = btnRefresh.querySelector('i');
        icon.classList.add('fa-spin');
        await loadAccounts();
        setTimeout(() => icon.classList.remove('fa-spin'), 500);
    }

    // ========== Display Account Info ==========
    function displayAccountInfo(acc) {
        document.getElementById('acc-name').textContent = acc.name || 'Unnamed';
        document.getElementById('acc-status').textContent = acc.demo ? 'Demo' : 'Live';
        document.getElementById('info-broker').textContent = acc.broker || '-';
        document.getElementById('info-server').textContent = acc.server || '-';
        document.getElementById('info-type').textContent = acc.demo ? 'Demo' : 'Real';
        document.getElementById('info-leverage').textContent = acc.leverage ? `1:${acc.leverage}` : '-';
        document.getElementById('info-currency').textContent = acc.currency || 'USD';
        document.getElementById('info-since').textContent = acc.creationDate ? acc.creationDate.substring(0, 10) : '-';
        document.getElementById('info-update').textContent = acc.lastUpdateDate ? fmtRelTime(acc.lastUpdateDate) : '-';
        userEmail.textContent = localStorage.getItem('myfxbook_email') || '';
    }

    function displayKeyStats(acc) {
        const gain = num(acc.gain);
        const profit = num(acc.profit);
        const balance = num(acc.balance);
        const equity = num(acc.equity);
        const drawdown = num(acc.drawdown);
        const trades = num(acc.trades);
        const pips = num(acc.pips);
        const winRate = getWinRate(acc);

        setStat('stat-gain', `${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%`, gain);
        setStat('stat-profit', fmtMoney(profit), profit);
        setStat('stat-balance', fmtMoney(balance));
        setStat('stat-equity', fmtMoney(equity));
        setStat('stat-drawdown', `${drawdown.toFixed(2)}%`, -drawdown);
        setStat('stat-trades', trades.toLocaleString());
        setStat('stat-pips', pips.toFixed(1), pips);
        setStat('stat-winrate', `${winRate.toFixed(1)}%`, winRate >= 50 ? 1 : -1);
    }

    // คำนวณ Win Rate จากหลายแหล่งข้อมูลที่ API ส่งมา
    function getWinRate(acc) {
        // Log เพื่อ debug
        console.log('[WIN RATE] Fields:', {
            wonTrades: acc.wonTrades,
            lostTrades: acc.lostTrades,
            longsWon: acc.longsWon,
            shortsWon: acc.shortsWon,
            longPercentage: acc.longPercentage,
            shortPercentage: acc.shortPercentage,
            wonTradesPercentage: acc.wonTradesPercentage,
            lostTradesPercentage: acc.lostTradesPercentage
        });

        // วิธี 1: ใช้ wonTrades / lostTrades โดยตรง
        const won = num(acc.wonTrades);
        const lost = num(acc.lostTrades);
        if (won + lost > 0) return (won / (won + lost)) * 100;

        // วิธี 2: ใช้ wonTradesPercentage โดยตรง (ถ้ามี)
        if (acc.wonTradesPercentage) return num(acc.wonTradesPercentage);

        // วิธี 3: ใช้ longsWon + shortsWon หารเฉลี่ย (เป็น % ของ long/short ที่ชนะ)
        const longsWon = num(acc.longsWon);
        const shortsWon = num(acc.shortsWon);
        if (longsWon > 0 && shortsWon > 0) {
            return (longsWon + shortsWon) / 2;
        } else if (longsWon > 0) {
            return longsWon;
        } else if (shortsWon > 0) {
            return shortsWon;
        }

        // วิธี 4: คำนวณจาก history (ถ้าโหลดแล้ว)
        if (allHistory && allHistory.length > 0) {
            const wonCount = allHistory.filter(t => num(t.profit) > 0).length;
            if (allHistory.length > 0) return (wonCount / allHistory.length) * 100;
        }

        return 0;
    }

    function displayAdvancedStats(acc) {
        const winRate = getWinRate(acc);
        setText('adv-winrate', `${winRate.toFixed(1)}%`);
        setText('adv-pf', acc.profitFactor || '-');
        setText('adv-expectancy', acc.expectancy ? `${num(acc.expectancy).toFixed(2)} pips` : '-');
        setText('adv-avgwin', acc.avgWin ? fmtMoney(num(acc.avgWin)) : '-');
        setText('adv-avgloss', acc.avgLoss ? fmtMoney(num(acc.avgLoss)) : '-');
        setText('adv-avgpipswin', acc.avgPipsWin ? num(acc.avgPipsWin).toFixed(1) : '-');
        setText('adv-avgpipsloss', acc.avgPipsLoss ? num(acc.avgPipsLoss).toFixed(1) : '-');
        setText('adv-total', acc.trades || '-');
        setText('adv-won', acc.wonTrades || '-');
        setText('adv-lost', acc.lostTrades || '-');
        setText('adv-best', acc.bestTrade ? fmtMoney(num(acc.bestTrade)) : '-');
        setText('adv-worst', acc.worstTrade ? fmtMoney(num(acc.worstTrade)) : '-');
        setText('adv-bestpips', acc.bestTradePips ? num(acc.bestTradePips).toFixed(1) : '-');
        setText('adv-worstpips', acc.worstTradePips ? num(acc.worstTradePips).toFixed(1) : '-');
        setText('adv-dd', acc.drawdown ? `${num(acc.drawdown).toFixed(2)}%` : '-');
        setText('adv-tradelen', acc.avgTradeLength || '-');
        setText('adv-longs', acc.longsWon ? `${acc.longsWon}%` : '-');
        setText('adv-shorts', acc.shortsWon ? `${acc.shortsWon}%` : '-');
        setText('adv-daily', acc.daily ? `${num(acc.daily).toFixed(2)}%` : '-');
        setText('adv-monthly', acc.monthly ? `${num(acc.monthly).toFixed(2)}%` : '-');
        setText('adv-absgain', acc.absGain ? `${num(acc.absGain).toFixed(2)}%` : '-');
        setText('adv-deposits', acc.deposits ? fmtMoney(num(acc.deposits)) : '-');
        setText('adv-withdrawals', acc.withdrawals ? fmtMoney(num(acc.withdrawals)) : '-');
        setText('adv-interest', acc.interest ? fmtMoney(num(acc.interest)) : '-');
        setText('adv-commission', acc.commission ? fmtMoney(num(acc.commission)) : '-');
        setText('adv-hibal', acc.highestBalance ? fmtMoney(num(acc.highestBalance)) : '-');
        setText('adv-hieq', acc.highestEquity ? fmtMoney(num(acc.highestEquity)) : '-');
        setText('adv-lots', acc.lots ? num(acc.lots).toFixed(2) : '-');
    }

    // ========== Load Data ==========
    async function loadDailyGain(id) {
        try {
            const end = new Date(), start = new Date();
            start.setDate(start.getDate() - 90);
            const r = await MyfxbookAPI.getDailyGain(id, formatDateAPI(start), formatDateAPI(end));
            allDailyGain = (r.error === false && r.dailyGain) ? r.dailyGain : [];
        } catch (e) { allDailyGain = []; }
    }

    async function loadDailyData(id) {
        try {
            const end = new Date(), start = new Date();
            start.setDate(start.getDate() - 90);
            const r = await MyfxbookAPI.getDataDaily(id, formatDateAPI(start), formatDateAPI(end));
            allDailyData = (r.error === false && r.dataDaily) ? r.dataDaily : [];
        } catch (e) { allDailyData = []; }
    }

    async function loadHistory(id) {
        try {
            const r = await MyfxbookAPI.getHistory(id);
            allHistory = (r.error === false && r.history) ? r.history : [];
            document.getElementById('cnt-history').textContent = allHistory.length;
            renderHistory(allHistory);
        } catch (e) {
            allHistory = [];
            document.getElementById('history-body').innerHTML = '<tr><td colspan="11" class="empty">Error loading</td></tr>';
        }
    }

    async function loadOpenTrades(id) {
        const tbody = document.getElementById('open-trades-body');
        tbody.innerHTML = '<tr><td colspan="10" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        try {
            const r = await MyfxbookAPI.getOpenTrades(id);
            const trades = (r.error === false && r.openTrades) ? r.openTrades : [];
            document.getElementById('cnt-open').textContent = trades.length;
            if (trades.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="empty">No open trades</td></tr>'; return; }
            tbody.innerHTML = trades.map(t => `<tr>
                <td><strong>${t.symbol||'-'}</strong></td>
                <td><span class="${t.action==='Buy'?'badge-buy':'badge-sell'}">${t.action||'-'}</span></td>
                <td>${getLots(t)}</td><td>${t.openPrice||'-'}</td><td>${t.currentPrice||'-'}</td>
                <td>${t.stopLoss||'-'}</td><td>${t.takeProfit||'-'}</td>
                <td class="${num(t.profit)>=0?'positive':'negative'}">${fmtMoney(num(t.profit))}</td>
                <td class="${num(t.pips)>=0?'positive':'negative'}">${num(t.pips).toFixed(1)}</td>
                <td>${fmtDateTime(t.openTime)}</td></tr>`).join('');
        } catch (e) { tbody.innerHTML = '<tr><td colspan="10" class="empty">Error</td></tr>'; }
    }

    async function loadOpenOrders(id) {
        const tbody = document.getElementById('open-orders-body');
        tbody.innerHTML = '<tr><td colspan="7" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        try {
            const r = await MyfxbookAPI.getOpenOrders(id);
            const orders = (r.error === false && r.openOrders) ? r.openOrders : [];
            document.getElementById('cnt-orders').textContent = orders.length;
            if (orders.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty">No pending orders</td></tr>'; return; }
            tbody.innerHTML = orders.map(t => `<tr>
                <td><strong>${t.symbol||'-'}</strong></td>
                <td><span class="${(t.action||'').toLowerCase().includes('buy')?'badge-buy':'badge-sell'}">${t.action||'-'}</span></td>
                <td>${getLots(t)}</td><td>${t.openPrice||'-'}</td>
                <td>${t.stopLoss||'-'}</td><td>${t.takeProfit||'-'}</td>
                <td>${fmtDateTime(t.openTime)}</td></tr>`).join('');
        } catch (e) { tbody.innerHTML = '<tr><td colspan="7" class="empty">Error</td></tr>'; }
    }

    // ========== History ==========
    function renderHistory(data) {
        const tbody = document.getElementById('history-body');
        if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="11" class="empty">No history</td></tr>'; return; }
        const sorted = [...data].sort((a,b) => new Date(b.closeTime||0) - new Date(a.closeTime||0)).slice(0, 200);
        tbody.innerHTML = sorted.map(t => `
            <tr data-symbol="${(t.symbol||'').toLowerCase()}" data-action="${(t.action||'').toLowerCase()}" data-profit="${num(t.profit)}">
                <td><strong>${t.symbol||'-'}</strong></td>
                <td><span class="${t.action==='Buy'?'badge-buy':'badge-sell'}">${t.action||'-'}</span></td>
                <td>${getLots(t)}</td><td>${t.openPrice||'-'}</td><td>${t.closePrice||'-'}</td>
                <td>${t.stopLoss||'-'}</td><td>${t.takeProfit||'-'}</td>
                <td class="${num(t.profit)>=0?'positive':'negative'}">${fmtMoney(num(t.profit))}</td>
                <td class="${num(t.pips)>=0?'positive':'negative'}">${num(t.pips).toFixed(1)}</td>
                <td>${fmtDateTime(t.openTime)}</td><td>${fmtDateTime(t.closeTime)}</td>
            </tr>`).join('');
    }

    function filterHistory() {
        const search = document.getElementById('history-search').value.toLowerCase();
        const filter = document.getElementById('history-filter').value;
        document.querySelectorAll('#history-body tr').forEach(tr => {
            const sym = tr.dataset.symbol || '', act = tr.dataset.action || '', pft = parseFloat(tr.dataset.profit) || 0;
            let show = true;
            if (search && !sym.includes(search)) show = false;
            if (filter === 'buy' && act !== 'buy') show = false;
            if (filter === 'sell' && act !== 'sell') show = false;
            if (filter === 'profit' && pft <= 0) show = false;
            if (filter === 'loss' && pft >= 0) show = false;
            tr.style.display = show ? '' : 'none';
        });
    }

    // ========== Monthly Table ==========
    function renderMonthlyTable() {
        const tbody = document.getElementById('monthly-body');
        if (allDailyGain.length === 0) { tbody.innerHTML = '<tr><td colspan="14" class="empty">No data</td></tr>'; return; }
        const monthly = {};
        allDailyGain.forEach(d => {
            if (!d.date) return;
            const p = d.date.split('-');
            if (p.length < 3) return;
            const y = p[0], m = parseInt(p[1]) - 1;
            if (!monthly[y]) monthly[y] = new Array(12).fill(0);
            monthly[y][m] += num(d.value);
        });
        const years = Object.keys(monthly).sort().reverse();
        if (years.length === 0) { tbody.innerHTML = '<tr><td colspan="14" class="empty">No data</td></tr>'; return; }
        tbody.innerHTML = years.map(year => {
            const months = monthly[year];
            const total = months.reduce((s,v) => s+v, 0);
            const cells = months.map(v => {
                const cls = v > 0.001 ? 'positive' : v < -0.001 ? 'negative' : '';
                const disp = (v > 0.001 || v < -0.001) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '-';
                return `<td class="${cls}">${disp}</td>`;
            }).join('');
            const tCls = total > 0 ? 'positive total-cell' : total < 0 ? 'negative total-cell' : 'total-cell';
            return `<tr><td class="year-cell">${year}</td>${cells}<td class="${tCls}">${total >= 0 ? '+' : ''}${total.toFixed(2)}%</td></tr>`;
        }).join('');
    }

    // ========== Daily Gain Table ==========
    function renderDailyGainTable() {
        const tbody = document.getElementById('daily-gain-body');
        if (allDailyGain.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No data</td></tr>'; return; }
        const sorted = [...allDailyGain].sort((a,b) => new Date(a.date) - new Date(b.date));
        let cum = 0;
        const withCum = sorted.map(d => { const v = num(d.value); cum += v; return { ...d, v, cum }; });
        const dataMap = {};
        allDailyData.forEach(d => { dataMap[d.date] = d; });
        const desc = [...withCum].reverse();
        tbody.innerHTML = desc.map(d => {
            const dd = dataMap[d.date] || {};
            return `<tr>
                <td>${d.date||'-'}</td>
                <td class="${d.v>=0?'positive':'negative'}">${d.v>=0?'+':''}${d.v.toFixed(4)}%</td>
                <td class="${d.cum>=0?'positive':'negative'}">${d.cum>=0?'+':''}${d.cum.toFixed(4)}%</td>
                <td class="${num(dd.profit)>=0?'positive':'negative'}">${dd.profit!==undefined?fmtMoney(num(dd.profit)):'-'}</td>
                <td>${dd.balance!==undefined?fmtMoney(num(dd.balance)):'-'}</td>
                <td>${dd.equity!==undefined?fmtMoney(num(dd.equity)):'-'}</td>
            </tr>`;
        }).join('');
    }

    // ========== UI ==========
    function showDashboard() { loginSection.style.display = 'none'; dashboardSection.style.display = 'block'; }
    function showLogin() { loginSection.style.display = 'flex'; dashboardSection.style.display = 'none'; allAccountsView.style.display = 'none'; accountDetailView.style.display = 'none'; loginForm.reset(); }
    function showLoading(s) { loading.style.display = s ? 'block' : 'none'; }
    function showError(m) { loginError.textContent = m; loginError.classList.add('show'); }
    function hideError() { loginError.classList.remove('show'); }
    function setStat(id, text, color) { const el = document.getElementById(id); el.textContent = text; el.className = 'stat-value'; if (color !== undefined) el.classList.add(color >= 0 ? 'positive' : 'negative'); }
    function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

    // ========== Formatters ==========
    function num(v) { return parseFloat(v) || 0; }
    function fmtMoney(v) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v); }
    function fmtDateTime(s) { if (!s) return '-'; try { return new Date(s).toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return s; } }
    function fmtRelTime(s) { try { const diff = (new Date() - new Date(s))/1000; if (diff<60) return 'Just now'; if (diff<3600) return `${Math.floor(diff/60)}m ago`; if (diff<86400) return `${Math.floor(diff/3600)}h ago`; return `${Math.floor(diff/86400)}d ago`; } catch { return s; } }
    function formatDateAPI(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    function getLots(t) { if (t.sizing && typeof t.sizing === 'object' && t.sizing.value) return t.sizing.value; return t.lots || '-'; }
});
