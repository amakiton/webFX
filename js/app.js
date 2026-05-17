/**
 * WebFX - Myfxbook Dashboard Application (Myfxbook-style)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
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

    // State
    let accounts = [];
    let selectedAccount = null;
    let growthChart = null;
    let hourlyChart = null;
    let weekdayChart = null;
    let currentPeriodDays = 90;

    // Chart.js dark theme defaults
    Chart.defaults.color = '#a0aec0';
    Chart.defaults.borderColor = 'rgba(45,55,72,0.5)';

    // ========== Initialize ==========
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

        // Period buttons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentPeriodDays = parseInt(e.target.dataset.days);
                if (selectedAccount) loadGrowthChart(selectedAccount.id);
            });
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });
    }

    // ========== Login ==========
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
                showError(result.message || 'Login failed. Check your credentials.');
            }
        } catch (error) {
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
            } else {
                if (result.message && result.message.includes('session')) {
                    showLogin();
                }
            }
        } catch (error) {
            console.error('Load accounts error:', error);
        } finally {
            showLoading(false);
        }
    }

    function populateAccountSelect(accs) {
        accountSelect.innerHTML = '<option value="">-- Select Account --</option>';
        accs.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            opt.textContent = `${acc.name} (${acc.server || 'N/A'})`;
            accountSelect.appendChild(opt);
        });
    }

    async function handleAccountChange() {
        const accountId = accountSelect.value;
        if (!accountId) { mainContent.style.display = 'none'; return; }

        selectedAccount = accounts.find(a => a.id == accountId);
        if (!selectedAccount) return;

        mainContent.style.display = 'block';
        displayAccountInfo(selectedAccount);
        displayStats(selectedAccount);
        displayAdvancedStats(selectedAccount);

        // Load async data
        loadGrowthChart(accountId);
        loadOpenTrades(accountId);
        loadHistory(accountId);
        loadDailyGain(accountId);
        loadMonthlyData(accountId);
        loadTradingActivity(accountId);
    }

    function handleRefresh() {
        btnRefresh.querySelector('i').classList.add('fa-spin');
        loadAccounts().finally(() => {
            setTimeout(() => btnRefresh.querySelector('i').classList.remove('fa-spin'), 500);
        });
    }

    // ========== Display Account Info ==========
    function displayAccountInfo(acc) {
        document.getElementById('info-broker').textContent = acc.broker || '-';
        document.getElementById('info-leverage').textContent = acc.leverage ? `1:${acc.leverage}` : '-';
        document.getElementById('info-type').textContent = acc.demo ? 'Demo' : 'Real';
        document.getElementById('info-currency').textContent = acc.currency || 'USD';
        userEmail.textContent = localStorage.getItem('myfxbook_email') || '';
    }

    // ========== Display Stats ==========
    function displayStats(acc) {
        const gain = parseFloat(acc.gain) || 0;
        const profit = parseFloat(acc.profit) || 0;
        const balance = parseFloat(acc.balance) || 0;
        const equity = parseFloat(acc.equity) || 0;
        const drawdown = parseFloat(acc.drawdown) || 0;
        const daily = parseFloat(acc.daily) || 0;
        const monthly = parseFloat(acc.monthly) || 0;
        const pips = parseFloat(acc.pips) || 0;

        setStatValue('stat-gain', `${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%`, gain);
        setStatValue('stat-profit', `$${profit.toFixed(2)}`, profit);
        setStatValue('stat-balance', `$${balance.toLocaleString()}`, null);
        setStatValue('stat-equity', `$${equity.toLocaleString()}`, null);
        setStatValue('stat-drawdown', `${drawdown.toFixed(2)}%`, -drawdown);
        setStatValue('stat-total-trades', acc.trades || '0', null);
        setStatValue('stat-pips', pips.toFixed(1), pips);
        setStatValue('stat-daily', `${daily >= 0 ? '+' : ''}${daily.toFixed(2)}%`, daily);
        setStatValue('stat-monthly', `${monthly >= 0 ? '+' : ''}${monthly.toFixed(2)}%`, monthly);
    }

    function setStatValue(id, text, colorValue) {
        const el = document.getElementById(id);
        el.textContent = text;
        el.className = 'stat-value';
        if (colorValue !== null) {
            el.classList.add(colorValue >= 0 ? 'positive' : 'negative');
        }
    }

    // ========== Advanced Stats ==========
    function displayAdvancedStats(acc) {
        const wonTrades = parseInt(acc.wonTrades) || 0;
        const lostTrades = parseInt(acc.lostTrades) || 0;
        const totalTrades = wonTrades + lostTrades;
        const winRate = totalTrades > 0 ? ((wonTrades / totalTrades) * 100).toFixed(1) : '0.0';

        document.getElementById('adv-winrate').textContent = `${winRate}%`;
        document.getElementById('adv-profit-factor').textContent = acc.profitFactor || '-';
        document.getElementById('adv-avg-win').textContent = acc.avgWin ? `$${parseFloat(acc.avgWin).toFixed(2)}` : '-';
        document.getElementById('adv-avg-loss').textContent = acc.avgLoss ? `$${parseFloat(acc.avgLoss).toFixed(2)}` : '-';
        document.getElementById('adv-best-trade').textContent = acc.bestTrade ? `$${parseFloat(acc.bestTrade).toFixed(2)}` : '-';
        document.getElementById('adv-worst-trade').textContent = acc.worstTrade ? `$${parseFloat(acc.worstTrade).toFixed(2)}` : '-';
        document.getElementById('adv-max-dd').textContent = acc.drawdown ? `${parseFloat(acc.drawdown).toFixed(2)}%` : '-';
        document.getElementById('adv-avg-length').textContent = acc.avgTradeLength || '-';
        document.getElementById('adv-expectancy').textContent = acc.expectancy ? `${parseFloat(acc.expectancy).toFixed(2)} pips` : '-';
        document.getElementById('adv-longs-won').textContent = acc.longsWon ? `${acc.longsWon}%` : '-';
        document.getElementById('adv-shorts-won').textContent = acc.shortsWon ? `${acc.shortsWon}%` : '-';
        document.getElementById('adv-commission').textContent = acc.commission ? `$${parseFloat(acc.commission).toFixed(2)}` : '-';
        document.getElementById('adv-deposits').textContent = acc.deposits ? `$${parseFloat(acc.deposits).toLocaleString()}` : '-';
        document.getElementById('adv-withdrawals').textContent = acc.withdrawals ? `$${parseFloat(acc.withdrawals).toLocaleString()}` : '-';
        document.getElementById('adv-interest').textContent = acc.interest ? `$${parseFloat(acc.interest).toFixed(2)}` : '-';
        document.getElementById('adv-highest-bal').textContent = acc.highestBalance ? `$${parseFloat(acc.highestBalance).toLocaleString()}` : '-';
        document.getElementById('adv-highest-eq').textContent = acc.highestEquity ? `$${parseFloat(acc.highestEquity).toLocaleString()}` : '-';
        document.getElementById('adv-since').textContent = acc.creationDate ? acc.creationDate.substring(0, 10) : '-';
    }

    // ========== Growth Chart ==========
    async function loadGrowthChart(accountId) {
        try {
            const end = new Date();
            const start = new Date();
            if (currentPeriodDays > 0) {
                start.setDate(start.getDate() - currentPeriodDays);
            } else {
                start.setFullYear(start.getFullYear() - 5);
            }

            const result = await MyfxbookAPI.getDailyGain(accountId, formatDateAPI(start), formatDateAPI(end));

            if (result.error === false && result.dailyGain && result.dailyGain.length > 0) {
                const gains = result.dailyGain;
                const labels = gains.map(d => {
                    if (!d.date) return '';
                    const parts = d.date.split('-');
                    return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : d.date.substring(5);
                });

                let cumulative = 0;
                const cumulativeValues = gains.map(d => {
                    cumulative += (parseFloat(d.value) || 0);
                    return parseFloat(cumulative.toFixed(4));
                });

                renderGrowthChart(labels, cumulativeValues);
            }
        } catch (error) {
            console.error('Growth chart error:', error);
        }
    }

    function renderGrowthChart(labels, data) {
        const ctx = document.getElementById('growthChart').getContext('2d');
        if (growthChart) growthChart.destroy();

        const lastVal = data[data.length - 1] || 0;
        const color = lastVal >= 0 ? '#00d4aa' : '#e74c3c';
        const bgColor = lastVal >= 0 ? 'rgba(0,212,170,0.08)' : 'rgba(231,76,60,0.08)';

        growthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor: color,
                    backgroundColor: bgColor,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: color
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y.toFixed(2)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(45,55,72,0.3)' },
                        ticks: { maxTicksLimit: 10, font: { size: 11 } }
                    },
                    y: {
                        grid: { color: 'rgba(45,55,72,0.3)' },
                        ticks: {
                            font: { size: 11 },
                            callback: (val) => val.toFixed(1) + '%'
                        }
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    // ========== Monthly Return ==========
    async function loadMonthlyData(accountId) {
        try {
            const end = new Date();
            const start = new Date();
            start.setFullYear(start.getFullYear() - 3);

            const result = await MyfxbookAPI.getDailyGain(accountId, formatDateAPI(start), formatDateAPI(end));

            if (result.error === false && result.dailyGain && result.dailyGain.length > 0) {
                const monthlyData = {};

                result.dailyGain.forEach(day => {
                    if (!day.date) return;
                    const parts = day.date.split('-');
                    if (parts.length < 3) return;
                    const year = parts[0];
                    const month = parseInt(parts[1]) - 1;
                    const val = parseFloat(day.value) || 0;

                    if (!monthlyData[year]) monthlyData[year] = new Array(12).fill(0);
                    monthlyData[year][month] += val;
                });

                renderMonthlyTable(monthlyData);
            }
        } catch (error) {
            console.error('Monthly data error:', error);
        }
    }

    function renderMonthlyTable(data) {
        const tbody = document.getElementById('monthly-body');
        const years = Object.keys(data).sort().reverse();

        tbody.innerHTML = years.map(year => {
            const months = data[year];
            const total = months.reduce((sum, v) => sum + v, 0);

            const cells = months.map(v => {
                const cls = v > 0 ? 'positive' : v < 0 ? 'negative' : '';
                const display = v !== 0 ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '-';
                return `<td class="${cls}">${display}</td>`;
            }).join('');

            const totalCls = total > 0 ? 'positive total-cell' : total < 0 ? 'negative total-cell' : 'total-cell';
            return `<tr><td class="year-cell">${year}</td>${cells}<td class="${totalCls}">${total >= 0 ? '+' : ''}${total.toFixed(2)}%</td></tr>`;
        }).join('');
    }

    // ========== Trading Activity ==========
    async function loadTradingActivity(accountId) {
        try {
            const result = await MyfxbookAPI.getHistory(accountId);

            if (result.error === false && result.history && result.history.length > 0) {
                const hourData = new Array(24).fill(0);
                const dayData = new Array(7).fill(0);

                result.history.forEach(trade => {
                    if (trade.openTime) {
                        try {
                            const date = new Date(trade.openTime);
                            hourData[date.getHours()]++;
                            dayData[date.getDay()]++;
                        } catch(e) {}
                    }
                });

                renderHourlyChart(hourData);
                renderWeekdayChart(dayData);
            }
        } catch (error) {
            console.error('Trading activity error:', error);
        }
    }

    function renderHourlyChart(data) {
        const ctx = document.getElementById('hourlyChart').getContext('2d');
        if (hourlyChart) hourlyChart.destroy();

        const labels = Array.from({length: 24}, (_, i) => `${i}:00`);

        hourlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: 'rgba(0,212,170,0.6)',
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 12 } },
                    y: { grid: { color: 'rgba(45,55,72,0.3)' }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    function renderWeekdayChart(data) {
        const ctx = document.getElementById('weekdayChart').getContext('2d');
        if (weekdayChart) weekdayChart.destroy();

        const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        weekdayChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: 'rgba(0,212,170,0.6)',
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: { grid: { color: 'rgba(45,55,72,0.3)' }, ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    // ========== Open Trades ==========
    async function loadOpenTrades(accountId) {
        const tbody = document.getElementById('open-trades-body');
        tbody.innerHTML = '<tr><td colspan="8" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

        try {
            const result = await MyfxbookAPI.getOpenTrades(accountId);
            if (result.error === false && result.openTrades && result.openTrades.length > 0) {
                tbody.innerHTML = result.openTrades.map(t => `
                    <tr>
                        <td><strong>${t.symbol || '-'}</strong></td>
                        <td><span class="${t.action === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.action || '-'}</span></td>
                        <td>${t.sizing && t.sizing.value ? t.sizing.value : (t.lots || '-')}</td>
                        <td>${t.openPrice || '-'}</td>
                        <td>${t.currentPrice || '-'}</td>
                        <td class="${parseFloat(t.profit) >= 0 ? 'positive' : 'negative'}">${fmtCurrency(parseFloat(t.profit) || 0)}</td>
                        <td class="${parseFloat(t.pips) >= 0 ? 'positive' : 'negative'}">${t.pips || '0'}</td>
                        <td>${fmtDate(t.openTime)}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="8" class="empty">No open trades</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">Error loading data</td></tr>';
        }
    }

    // ========== History ==========
    async function loadHistory(accountId) {
        const tbody = document.getElementById('history-body');
        tbody.innerHTML = '<tr><td colspan="9" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

        try {
            const result = await MyfxbookAPI.getHistory(accountId);
            if (result.error === false && result.history && result.history.length > 0) {
                const trades = result.history.slice(-100).reverse();
                tbody.innerHTML = trades.map(t => `
                    <tr>
                        <td><strong>${t.symbol || '-'}</strong></td>
                        <td><span class="${t.action === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.action || '-'}</span></td>
                        <td>${t.sizing && t.sizing.value ? t.sizing.value : (t.lots || '-')}</td>
                        <td>${t.openPrice || '-'}</td>
                        <td>${t.closePrice || '-'}</td>
                        <td class="${parseFloat(t.profit) >= 0 ? 'positive' : 'negative'}">${fmtCurrency(parseFloat(t.profit) || 0)}</td>
                        <td class="${parseFloat(t.pips) >= 0 ? 'positive' : 'negative'}">${t.pips || '0'}</td>
                        <td>${fmtDate(t.openTime)}</td>
                        <td>${fmtDate(t.closeTime)}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="9" class="empty">No trade history</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty">Error loading data</td></tr>';
        }
    }

    // ========== Daily Gain ==========
    async function loadDailyGain(accountId) {
        const tbody = document.getElementById('daily-gain-body');
        tbody.innerHTML = '<tr><td colspan="3" class="empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

        try {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 30);

            const result = await MyfxbookAPI.getDailyGain(accountId, formatDateAPI(start), formatDateAPI(end));

            if (result.error === false && result.dailyGain && result.dailyGain.length > 0) {
                const gainsAsc = result.dailyGain;
                let cumulative = 0;

                const withCumulative = gainsAsc.map(day => {
                    const val = parseFloat(day.value) || 0;
                    cumulative += val;
                    return { ...day, val, cumulative };
                });

                const desc = [...withCumulative].reverse();

                tbody.innerHTML = desc.map(d => `
                    <tr>
                        <td>${d.date || '-'}</td>
                        <td class="${d.val >= 0 ? 'positive' : 'negative'}">${d.val >= 0 ? '+' : ''}${d.val.toFixed(4)}%</td>
                        <td class="${d.cumulative >= 0 ? 'positive' : 'negative'}">${d.cumulative >= 0 ? '+' : ''}${d.cumulative.toFixed(4)}%</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="empty">No daily data</td></tr>';
            }
        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="3" class="empty">Error loading data</td></tr>';
        }
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

    function showLoading(show) {
        loading.style.display = show ? 'block' : 'none';
    }

    function showError(msg) {
        loginError.textContent = msg;
        loginError.classList.add('show');
    }

    function hideError() {
        loginError.classList.remove('show');
    }

    // ========== Formatters ==========
    function fmtCurrency(val) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }

    function fmtDate(str) {
        if (!str) return '-';
        try {
            const d = new Date(str);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return str; }
    }

    function formatDateAPI(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
});
