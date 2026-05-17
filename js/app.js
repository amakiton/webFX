/**
 * WebFX - Forex Analytics Dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========== Elements ==========
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

    // ========== State ==========
    let accounts = [];
    let selectedAccount = null;
    let allHistory = [];
    let allDailyGain = [];
    let allDailyData = [];
    let dateStart = null;
    let dateEnd = null;
    let currentChartType = 'growth'; // growth | balance | equity

    // Charts
    let growthChart = null;
    let dailyPLChart = null;
    let drawdownChart = null;
    let hourlyChart = null;
    let weekdayChart = null;
    let symbolChart = null;
    let buySellChart = null;

    // Chart.js dark theme
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(45,55,72,0.5)';
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // ========== Init ==========
    init();

    function init() {
        if (MyfxbookAPI.restoreSession()) {
            showDashboard();
            loadAccounts();
        }

        // Default date range
        setDatePreset(90);

        // Events
        loginForm.addEventListener('submit', handleLogin);
        btnLogout.addEventListener('click', handleLogout);
        btnRefresh.addEventListener('click', handleRefresh);
        accountSelect.addEventListener('change', handleAccountChange);

        // Date filter
        document.getElementById('btn-apply-date').addEventListener('click', applyCustomDate);
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                setDatePreset(parseInt(e.target.dataset.days));
                reloadAllData();
            });
        });

        // Chart toggle
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentChartType = e.target.dataset.chart;
                renderGrowthChart();
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

    function setDatePreset(days) {
        const end = new Date();
        const start = new Date();
        if (days > 0) {
            start.setDate(start.getDate() - days);
        } else {
            start.setFullYear(start.getFullYear() - 5);
        }
        dateStart = start;
        dateEnd = end;
        document.getElementById('date-start').value = formatDateAPI(start);
        document.getElementById('date-end').value = formatDateAPI(end);
        updateDateInfo(days);
    }

    function applyCustomDate() {
        const s = document.getElementById('date-start').value;
        const e = document.getElementById('date-end').value;
        if (s && e) {
            dateStart = new Date(s);
            dateEnd = new Date(e);
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            updateDateInfo(-1);
            reloadAllData();
        }
    }

    function updateDateInfo(days) {
        const txt = document.getElementById('date-info-text');
        const startStr = dateStart.toLocaleDateString('en-GB');
        const endStr = dateEnd.toLocaleDateString('en-GB');
        let label = `Showing data from ${startStr} to ${endStr}`;
        if (days > 0) label += ` (Last ${days} days)`;
        else if (days === 0) label += ` (All time)`;
        else label += ` (Custom)`;
        txt.textContent = label;
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
            if (result.error === false) {
                showDashboard();
                loadAccounts();
            } else {
                showError(result.message || 'Login failed. Please check your credentials.');
            }
        } catch (err) {
            showError('Cannot connect to Myfxbook. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        }
    }

    async function handleLogout() {
        try { await MyfxbookAPI.logout(); } catch(e) {}
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
                if (accounts.length > 0) {
                    accountSelect.value = accounts[0].id;
                    handleAccountChange();
                }
            } else if (result.message && result.message.toLowerCase().includes('session')) {
                showLogin();
            }
        } catch (err) {
            console.error('Load accounts error:', err);
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

        renderGrowthChart();
        renderDailyPLChart();
        renderDrawdownChart();
        renderMonthlyTable();
        renderTradingActivity();
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
        document.getElementById('info-update').textContent = acc.lastUpdateDate ? formatRelativeTime(acc.lastUpdateDate) : '-';
        userEmail.textContent = localStorage.getItem('myfxbook_email') || '';
    }

    function formatRelativeTime(dateStr) {
        try {
            const d = new Date(dateStr);
            const diff = (new Date() - d) / 1000;
            if (diff < 60) return 'Just now';
            if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
            return `${Math.floor(diff/86400)}d ago`;
        } catch { return dateStr; }
    }

    // ========== Key Stats ==========
    function displayKeyStats(acc) {
        const gain = num(acc.gain);
        const profit = num(acc.profit);
        const balance = num(acc.balance);
        const equity = num(acc.equity);
        const drawdown = num(acc.drawdown);
        const trades = num(acc.trades);
        const pips = num(acc.pips);
        const won = num(acc.wonTrades);
        const lost = num(acc.lostTrades);
        const total = won + lost;
        const winRate = total > 0 ? ((won/total)*100) : 0;

        setStat('stat-gain', `${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%`, gain);
        setStat('stat-profit', fmtMoney(profit), profit);
        setStat('stat-balance', fmtMoney(balance));
        setStat('stat-equity', fmtMoney(equity));
        setStat('stat-drawdown', `${drawdown.toFixed(2)}%`, -drawdown);
        setStat('stat-trades', trades.toLocaleString());
        setStat('stat-pips', pips.toFixed(1), pips);
        setStat('stat-winrate', `${winRate.toFixed(1)}%`, winRate >= 50 ? 1 : -1);
    }

    function setStat(id, text, color) {
        const el = document.getElementById(id);
        el.textContent = text;
        el.className = 'stat-value';
        if (color !== undefined) el.classList.add(color >= 0 ? 'positive' : 'negative');
    }

    // ========== Advanced Stats ==========
    function displayAdvancedStats(acc) {
        const won = num(acc.wonTrades);
        const lost = num(acc.lostTrades);
        const total = won + lost;
        const winRate = total > 0 ? ((won/total)*100).toFixed(1) : '0.0';

        setText('adv-winrate', `${winRate}%`);
        setText('adv-pf', acc.profitFactor || '-');
        setText('adv-expectancy', acc.expectancy ? `${num(acc.expectancy).toFixed(2)} pips` : '-');
        setText('adv-avgwin', acc.avgWin ? fmtMoney(num(acc.avgWin)) : '-');
        setText('adv-avgloss', acc.avgLoss ? fmtMoney(num(acc.avgLoss)) : '-');
        setText('adv-avgpipswin', acc.avgPipsWin ? num(acc.avgPipsWin).toFixed(1) : '-');
        setText('adv-avgpipsloss', acc.avgPipsLoss ? num(acc.avgPipsLoss).toFixed(1) : '-');

        setText('adv-total', total || acc.trades || '-');
        setText('adv-won', won || '-');
        setText('adv-lost', lost || '-');
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
            const r = await MyfxbookAPI.getDailyGain(id, formatDateAPI(dateStart), formatDateAPI(dateEnd));
            allDailyGain = (r.error === false && r.dailyGain) ? r.dailyGain : [];
        } catch (e) { allDailyGain = []; }
    }

    async function loadDailyData(id) {
        try {
            const r = await MyfxbookAPI.getDataDaily(id, formatDateAPI(dateStart), formatDateAPI(dateEnd));
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
            document.getElementById('history-body').innerHTML = '<tr><td colspan="11" class="empty">Error loading data</td></tr>';
        }
    }

    async function loadOpenTrades(id) {
        const tbody = document.getElementById('open-trades-body');
        tbody.innerHTML = '<tr><td colspan="10" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        try {
            const r = await MyfxbookAPI.getOpenTrades(id);
            const trades = (r.error === false && r.openTrades) ? r.openTrades : [];
            document.getElementById('cnt-open').textContent = trades.length;
            if (trades.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="empty">No open trades</td></tr>';
                return;
            }
            tbody.innerHTML = trades.map(t => `
                <tr>
                    <td><strong>${t.symbol || '-'}</strong></td>
                    <td><span class="${t.action === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.action || '-'}</span></td>
                    <td>${getLots(t)}</td>
                    <td>${t.openPrice || '-'}</td>
                    <td>${t.currentPrice || '-'}</td>
                    <td>${t.stopLoss || '-'}</td>
                    <td>${t.takeProfit || '-'}</td>
                    <td class="${num(t.profit) >= 0 ? 'positive' : 'negative'}">${fmtMoney(num(t.profit))}</td>
                    <td class="${num(t.pips) >= 0 ? 'positive' : 'negative'}">${num(t.pips).toFixed(1)}</td>
                    <td>${fmtDateTime(t.openTime)}</td>
                </tr>
            `).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty">Error loading data</td></tr>';
        }
    }

    async function loadOpenOrders(id) {
        const tbody = document.getElementById('open-orders-body');
        tbody.innerHTML = '<tr><td colspan="7" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        try {
            const r = await MyfxbookAPI.getOpenOrders(id);
            const orders = (r.error === false && r.openOrders) ? r.openOrders : [];
            document.getElementById('cnt-orders').textContent = orders.length;
            if (orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">No pending orders</td></tr>';
                return;
            }
            tbody.innerHTML = orders.map(t => `
                <tr>
                    <td><strong>${t.symbol || '-'}</strong></td>
                    <td><span class="${(t.action || '').toLowerCase().includes('buy') ? 'badge-buy' : 'badge-sell'}">${t.action || '-'}</span></td>
                    <td>${getLots(t)}</td>
                    <td>${t.openPrice || '-'}</td>
                    <td>${t.stopLoss || '-'}</td>
                    <td>${t.takeProfit || '-'}</td>
                    <td>${fmtDateTime(t.openTime)}</td>
                </tr>
            `).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">Error loading data</td></tr>';
        }
    }

    // ========== History Filtering ==========
    function renderHistory(data) {
        const tbody = document.getElementById('history-body');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="empty">No history</td></tr>';
            return;
        }
        // Filter by date range, then sort by close time desc
        const filtered = data.filter(t => {
            if (!t.closeTime) return true;
            try {
                const ct = new Date(t.closeTime);
                return ct >= dateStart && ct <= dateEnd;
            } catch { return true; }
        });

        const sorted = [...filtered].sort((a, b) => {
            const ta = new Date(a.closeTime || 0).getTime();
            const tb = new Date(b.closeTime || 0).getTime();
            return tb - ta;
        }).slice(0, 200);

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="empty">No trades in selected range</td></tr>';
            return;
        }

        tbody.innerHTML = sorted.map(t => `
            <tr data-symbol="${(t.symbol || '').toLowerCase()}" data-action="${(t.action || '').toLowerCase()}" data-profit="${num(t.profit)}">
                <td><strong>${t.symbol || '-'}</strong></td>
                <td><span class="${t.action === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.action || '-'}</span></td>
                <td>${getLots(t)}</td>
                <td>${t.openPrice || '-'}</td>
                <td>${t.closePrice || '-'}</td>
                <td>${t.stopLoss || '-'}</td>
                <td>${t.takeProfit || '-'}</td>
                <td class="${num(t.profit) >= 0 ? 'positive' : 'negative'}">${fmtMoney(num(t.profit))}</td>
                <td class="${num(t.pips) >= 0 ? 'positive' : 'negative'}">${num(t.pips).toFixed(1)}</td>
                <td>${fmtDateTime(t.openTime)}</td>
                <td>${fmtDateTime(t.closeTime)}</td>
            </tr>
        `).join('');
    }

    function filterHistory() {
        const search = document.getElementById('history-search').value.toLowerCase();
        const filter = document.getElementById('history-filter').value;
        document.querySelectorAll('#history-body tr').forEach(tr => {
            const symbol = tr.dataset.symbol || '';
            const action = tr.dataset.action || '';
            const profit = parseFloat(tr.dataset.profit) || 0;

            let show = true;
            if (search && !symbol.includes(search)) show = false;
            if (filter === 'buy' && action !== 'buy') show = false;
            if (filter === 'sell' && action !== 'sell') show = false;
            if (filter === 'profit' && profit <= 0) show = false;
            if (filter === 'loss' && profit >= 0) show = false;

            tr.style.display = show ? '' : 'none';
        });
    }

    // ========== Growth Chart ==========
    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart').getContext('2d');
        if (growthChart) growthChart.destroy();

        let labels = [], data = [];
        let label = 'Growth %';
        let isPercent = true;

        if (currentChartType === 'growth') {
            const sorted = [...allDailyGain].sort((a,b) => new Date(a.date) - new Date(b.date));
            labels = sorted.map(d => fmtShortDate(d.date));
            let cum = 0;
            data = sorted.map(d => { cum += num(d.value); return parseFloat(cum.toFixed(4)); });
            label = 'Growth %';
            isPercent = true;
        } else if (currentChartType === 'balance' || currentChartType === 'equity') {
            const sorted = [...allDailyData].sort((a,b) => new Date(a.date) - new Date(b.date));
            labels = sorted.map(d => fmtShortDate(d.date));
            data = sorted.map(d => {
                if (currentChartType === 'balance') return num(d.balance);
                return num(d.equity || d.balance);
            });
            label = currentChartType === 'balance' ? 'Balance' : 'Equity';
            isPercent = false;
        }

        const lastVal = data[data.length - 1] || 0;
        const color = lastVal >= 0 || !isPercent ? '#00d4aa' : '#ff4d6d';
        const bgColor = lastVal >= 0 || !isPercent ? 'rgba(0,212,170,0.1)' : 'rgba(255,77,109,0.1)';

        growthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label, data,
                    borderColor: color,
                    backgroundColor: bgColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: color,
                    pointHoverBorderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a2335',
                        borderColor: '#243349',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (ctx) => isPercent
                                ? `${label}: ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}%`
                                : `${label}: $${ctx.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(45,55,72,0.3)' }, ticks: { maxTicksLimit: 12, font: { size: 11 } } },
                    y: { grid: { color: 'rgba(45,55,72,0.3)' },
                        ticks: { font: { size: 11 }, callback: v => isPercent ? v.toFixed(1) + '%' : '$' + v.toLocaleString() }
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    // ========== Daily P/L Chart ==========
    function renderDailyPLChart() {
        const ctx = document.getElementById('dailyPLChart').getContext('2d');
        if (dailyPLChart) dailyPLChart.destroy();

        const sorted = [...allDailyGain].sort((a,b) => new Date(a.date) - new Date(b.date));
        const labels = sorted.map(d => fmtShortDate(d.date));
        const data = sorted.map(d => num(d.value));
        const colors = data.map(v => v >= 0 ? 'rgba(0,212,170,0.7)' : 'rgba(255,77,109,0.7)');

        dailyPLChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 2 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a2335',
                        callbacks: {
                            label: ctx => `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(4)}%`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
                    y: { grid: { color: 'rgba(45,55,72,0.3)' }, ticks: { font: { size: 10 }, callback: v => v.toFixed(1) + '%' } }
                }
            }
        });
    }

    // ========== Drawdown Chart ==========
    function renderDrawdownChart() {
        const ctx = document.getElementById('drawdownChart').getContext('2d');
        if (drawdownChart) drawdownChart.destroy();

        const sorted = [...allDailyGain].sort((a,b) => new Date(a.date) - new Date(b.date));
        const labels = sorted.map(d => fmtShortDate(d.date));

        // Calculate running drawdown
        let cum = 0, peak = 0;
        const data = sorted.map(d => {
            cum += num(d.value);
            peak = Math.max(peak, cum);
            return parseFloat((peak - cum).toFixed(4));
        }).map(v => -v); // negative for visual

        drawdownChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor: '#ff4d6d',
                    backgroundColor: 'rgba(255,77,109,0.15)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a2335',
                        callbacks: {
                            label: ctx => `Drawdown: ${Math.abs(ctx.parsed.y).toFixed(2)}%`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
                    y: { grid: { color: 'rgba(45,55,72,0.3)' }, ticks: { font: { size: 10 }, callback: v => Math.abs(v).toFixed(1) + '%' } }
                }
            }
        });
    }

    // ========== Monthly Table ==========
    function renderMonthlyTable() {
        const tbody = document.getElementById('monthly-body');
        if (allDailyGain.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" class="empty">No data</td></tr>';
            return;
        }

        const monthly = {};
        allDailyGain.forEach(d => {
            if (!d.date) return;
            const parts = d.date.split('-');
            if (parts.length < 3) return;
            const y = parts[0], m = parseInt(parts[1]) - 1;
            if (!monthly[y]) monthly[y] = new Array(12).fill(0);
            monthly[y][m] += num(d.value);
        });

        const years = Object.keys(monthly).sort().reverse();
        if (years.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" class="empty">No data in range</td></tr>';
            return;
        }

        tbody.innerHTML = years.map(year => {
            const months = monthly[year];
            const total = months.reduce((s,v) => s+v, 0);
            const cells = months.map(v => {
                const cls = v > 0.001 ? 'positive' : v < -0.001 ? 'negative' : '';
                const display = (v > 0.001 || v < -0.001) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '-';
                return `<td class="${cls}">${display}</td>`;
            }).join('');
            const totalCls = total > 0 ? 'positive total-cell' : total < 0 ? 'negative total-cell' : 'total-cell';
            return `<tr><td class="year-cell">${year}</td>${cells}<td class="${totalCls}">${total >= 0 ? '+' : ''}${total.toFixed(2)}%</td></tr>`;
        }).join('');
    }

    // ========== Trading Activity ==========
    function renderTradingActivity() {
        // Filter history by date range
        const filtered = allHistory.filter(t => {
            if (!t.closeTime) return false;
            try {
                const ct = new Date(t.closeTime);
                return ct >= dateStart && ct <= dateEnd;
            } catch { return false; }
        });

        renderHourly(filtered);
        renderWeekday(filtered);
        renderSymbolDist(filtered);
        renderBuySell(filtered);
    }

    function renderHourly(trades) {
        const ctx = document.getElementById('hourlyChart').getContext('2d');
        if (hourlyChart) hourlyChart.destroy();
        const data = new Array(24).fill(0);
        trades.forEach(t => {
            try {
                const d = new Date(t.openTime);
                if (!isNaN(d)) data[d.getHours()]++;
            } catch {}
        });
        const labels = Array.from({length:24}, (_,i) => `${i}h`);
        hourlyChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: 'rgba(0,212,170,0.6)', borderRadius: 2 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 12 } },
                    y: { grid: { color: 'rgba(45,55,72,0.3)' }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    function renderWeekday(trades) {
        const ctx = document.getElementById('weekdayChart').getContext('2d');
        if (weekdayChart) weekdayChart.destroy();
        const data = new Array(7).fill(0);
        trades.forEach(t => {
            try {
                const d = new Date(t.openTime);
                if (!isNaN(d)) data[d.getDay()]++;
            } catch {}
        });
        weekdayChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
                datasets: [{ data, backgroundColor: 'rgba(77,126,255,0.6)', borderRadius: 3 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: { grid: { color: 'rgba(45,55,72,0.3)' }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    function renderSymbolDist(trades) {
        const ctx = document.getElementById('symbolChart').getContext('2d');
        if (symbolChart) symbolChart.destroy();
        const counts = {};
        trades.forEach(t => {
            const s = t.symbol || 'Unknown';
            counts[s] = (counts[s] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 8);
        const colors = ['#00d4aa','#4d7eff','#a855f7','#14b8a6','#ff4d6d','#ffaa00','#eab308','#ec4899'];
        symbolChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{
                    data: sorted.map(s => s[1]),
                    backgroundColor: colors,
                    borderColor: '#1a2335',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } }
                }
            }
        });
    }

    function renderBuySell(trades) {
        const ctx = document.getElementById('buySellChart').getContext('2d');
        if (buySellChart) buySellChart.destroy();
        let buy = 0, sell = 0, buyProfit = 0, sellProfit = 0;
        trades.forEach(t => {
            const p = num(t.profit);
            if (t.action === 'Buy') { buy++; buyProfit += p; }
            else { sell++; sellProfit += p; }
        });
        buySellChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Buy', 'Sell'],
                datasets: [
                    { label: 'Trades', data: [buy, sell], backgroundColor: ['rgba(0,212,170,0.6)','rgba(255,77,109,0.6)'], borderRadius: 4, yAxisID: 'y' },
                    { label: 'P/L ($)', data: [buyProfit, sellProfit], backgroundColor: ['rgba(0,212,170,0.3)','rgba(255,77,109,0.3)'], borderRadius: 4, yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
                scales: {
                    x: { grid: { display: false } },
                    y: { position: 'left', title: { display: true, text: 'Trades', font: { size: 10 } }, grid: { color: 'rgba(45,55,72,0.3)' } },
                    y1: { position: 'right', title: { display: true, text: 'P/L', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });
    }

    // ========== Daily Gain Table ==========
    function renderDailyGainTable() {
        const tbody = document.getElementById('daily-gain-body');
        if (allDailyGain.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">No daily data</td></tr>';
            return;
        }
        const sorted = [...allDailyGain].sort((a,b) => new Date(a.date) - new Date(b.date));
        let cum = 0;
        const withCum = sorted.map(d => {
            const v = num(d.value);
            cum += v;
            return { ...d, dailyVal: v, cumVal: cum };
        });

        // Map data daily by date
        const dataMap = {};
        allDailyData.forEach(d => { dataMap[d.date] = d; });

        const desc = [...withCum].reverse();
        tbody.innerHTML = desc.map(d => {
            const dd = dataMap[d.date] || {};
            return `
                <tr>
                    <td>${d.date || '-'}</td>
                    <td class="${d.dailyVal >= 0 ? 'positive' : 'negative'}">${d.dailyVal >= 0 ? '+' : ''}${d.dailyVal.toFixed(4)}%</td>
                    <td class="${d.cumVal >= 0 ? 'positive' : 'negative'}">${d.cumVal >= 0 ? '+' : ''}${d.cumVal.toFixed(4)}%</td>
                    <td class="${num(dd.profit) >= 0 ? 'positive' : 'negative'}">${dd.profit !== undefined ? fmtMoney(num(dd.profit)) : '-'}</td>
                    <td>${dd.balance !== undefined ? fmtMoney(num(dd.balance)) : '-'}</td>
                    <td>${dd.equity !== undefined ? fmtMoney(num(dd.equity)) : '-'}</td>
                </tr>
            `;
        }).join('');
    }

    // ========== UI Helpers ==========
    function showDashboard() {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
    }
    function showLogin() {
        loginSection.style.display = 'flex';
        dashboardSection.style.display = 'none';
        mainContent.style.display = 'none';
        loginForm.reset();
    }
    function showLoading(s) { loading.style.display = s ? 'block' : 'none'; }
    function showError(m) { loginError.textContent = m; loginError.classList.add('show'); }
    function hideError() { loginError.classList.remove('show'); }
    function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

    // ========== Formatters ==========
    function num(v) { return parseFloat(v) || 0; }
    function fmtMoney(v) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
    }
    function fmtDateTime(s) {
        if (!s) return '-';
        try {
            const d = new Date(s);
            return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return s; }
    }
    function fmtShortDate(s) {
        if (!s) return '';
        const parts = s.split('-');
        if (parts.length >= 3) return `${parts[2]}/${parts[1]}`;
        return s.substring(5);
    }
    function formatDateAPI(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,'0');
        const day = String(d.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
    }
    function getLots(t) {
        if (t.sizing && typeof t.sizing === 'object' && t.sizing.value) return t.sizing.value;
        return t.lots || '-';
    }
});
