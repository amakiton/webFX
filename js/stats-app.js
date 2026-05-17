/**
 * WebFX Stats App - Stats by Comment Dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
    init();

    async function init() {
        bindEvents();
        await checkBackend();
        setDefaultDates();
        loadData();
    }

    function bindEvents() {
        document.getElementById('btn-refresh-stats').addEventListener('click', loadData);
        document.getElementById('btn-filter').addEventListener('click', loadData);
        document.getElementById('btn-close-detail').addEventListener('click', () => {
            document.getElementById('comment-detail').style.display = 'none';
        });

        // Quick date buttons
        document.querySelectorAll('.quick-date-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days);
                setQuickDate(days);
                document.querySelectorAll('.quick-date-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadData();
            });
        });
    }

    async function checkBackend() {
        const badge = document.getElementById('backend-status');
        try {
            const result = await TradesAPI.checkHealth();
            if (!result.error) {
                badge.className = 'backend-badge online';
                badge.innerHTML = '<i class="fas fa-circle"></i> Online';
                loadAccounts();
            } else {
                badge.className = 'backend-badge offline';
                badge.innerHTML = '<i class="fas fa-circle"></i> Offline';
            }
        } catch (e) {
            badge.className = 'backend-badge offline';
            badge.innerHTML = '<i class="fas fa-circle"></i> Offline';
        }
    }

    async function loadAccounts() {
        try {
            const result = await TradesAPI.getAccounts();
            if (!result.error && result.accounts) {
                const select = document.getElementById('filter-account');
                select.innerHTML = '<option value="">ทุกบัญชี</option>';
                result.accounts.forEach(acc => {
                    select.innerHTML += `<option value="${acc.account_id}">${acc.account_id} (${acc.total_trades} trades)</option>`;
                });
            }
        } catch (e) {
            console.error('Load accounts error:', e);
        }
    }

    function setDefaultDates() {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        document.getElementById('filter-start').value = formatDate(start);
        document.getElementById('filter-end').value = formatDate(end);
    }

    function setQuickDate(days) {
        if (days === 0) {
            document.getElementById('filter-start').value = '';
            document.getElementById('filter-end').value = '';
        } else {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - days);
            document.getElementById('filter-start').value = formatDate(start);
            document.getElementById('filter-end').value = formatDate(end);
        }
    }

    function getFilters() {
        const filters = {};
        const accountId = document.getElementById('filter-account').value;
        const startDate = document.getElementById('filter-start').value;
        const endDate = document.getElementById('filter-end').value;
        if (accountId) filters.account_id = accountId;
        if (startDate) filters.start_date = startDate;
        if (endDate) filters.end_date = endDate;
        return filters;
    }

    async function loadData() {
        const filters = getFilters();
        loadOverallStats(filters);
        loadCommentStats(filters);
    }

    // ========== Overall Stats ==========
    async function loadOverallStats(filters) {
        const container = document.getElementById('overall-stats');
        container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>';

        try {
            const result = await TradesAPI.getStats(filters);
            if (!result.error && result.stats) {
                const s = result.stats;
                container.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-exchange-alt"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Total Trades</span>
                            <span class="stat-value">${s.total_trades || 0}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-trophy"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Win Rate</span>
                            <span class="stat-value positive">${s.win_rate || 0}%</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon ${s.net_profit >= 0 ? 'green' : 'red'}"><i class="fas fa-dollar-sign"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Net Profit</span>
                            <span class="stat-value ${s.net_profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(s.net_profit || 0)}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple"><i class="fas fa-balance-scale"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Profit Factor</span>
                            <span class="stat-value">${s.profit_factor || 0}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon teal"><i class="fas fa-arrow-up"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Best Trade</span>
                            <span class="stat-value positive">${formatCurrency(s.best_trade || 0)}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon red"><i class="fas fa-arrow-down"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Worst Trade</span>
                            <span class="stat-value negative">${formatCurrency(s.worst_trade || 0)}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon orange"><i class="fas fa-chart-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Total Pips</span>
                            <span class="stat-value">${s.total_pips || 0}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon indigo"><i class="fas fa-fire"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Max Cons. Wins</span>
                            <span class="stat-value">${s.max_consecutive_wins || 0}</span>
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = '<div class="loading-state">ไม่มีข้อมูล</div>';
            }
        } catch (e) {
            container.innerHTML = '<div class="loading-state">ไม่สามารถเชื่อมต่อ Backend</div>';
        }
    }

    // ========== Comment Stats Table ==========
    async function loadCommentStats(filters) {
        const container = document.getElementById('comment-stats-table');
        container.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>';

        try {
            const result = await TradesAPI.getStatsByComment(filters);
            if (!result.error && result.stats && result.stats.length > 0) {
                container.innerHTML = `
                    <table class="stats-compare-table">
                        <thead>
                            <tr>
                                <th>Comment / EA</th>
                                <th>Trades</th>
                                <th>Win Rate</th>
                                <th>Net Profit</th>
                                <th>Gross Profit</th>
                                <th>Gross Loss</th>
                                <th>Avg Win</th>
                                <th>Avg Loss</th>
                                <th>Best</th>
                                <th>Worst</th>
                                <th>Pips</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${result.stats.map(s => `
                                <tr onclick="window.showCommentDetail('${escapeAttr(s.comment)}')">
                                    <td><span class="comment-tag"><i class="fas fa-tag"></i> ${escapeHtml(s.comment)}</span></td>
                                    <td>${s.total_trades}</td>
                                    <td class="${s.win_rate >= 50 ? 'positive' : 'negative'}">${s.win_rate}%</td>
                                    <td class="${s.net_profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(s.net_profit)}</td>
                                    <td class="positive">${formatCurrency(s.gross_profit)}</td>
                                    <td class="negative">${formatCurrency(s.gross_loss)}</td>
                                    <td class="positive">${formatCurrency(s.avg_win || 0)}</td>
                                    <td class="negative">${formatCurrency(s.avg_loss || 0)}</td>
                                    <td class="positive">${formatCurrency(s.best_trade)}</td>
                                    <td class="negative">${formatCurrency(s.worst_trade)}</td>
                                    <td>${s.total_pips}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                container.innerHTML = '<div class="loading-state">ไม่มีข้อมูล — EA ยังไม่ได้ส่ง trade data</div>';
            }
        } catch (e) {
            container.innerHTML = '<div class="loading-state">ไม่สามารถเชื่อมต่อ Backend</div>';
        }
    }

    // ========== Comment Detail ==========
    window.showCommentDetail = async function(comment) {
        const panel = document.getElementById('comment-detail');
        panel.style.display = 'block';
        document.getElementById('detail-comment-name').textContent = comment;

        const filters = getFilters();
        filters.comment = comment;

        // Load stats
        const statsContainer = document.getElementById('detail-stats');
        statsContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const result = await TradesAPI.getStats(filters);
            if (!result.error && result.stats) {
                const s = result.stats;
                statsContainer.innerHTML = `
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-exchange-alt"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Trades</span>
                            <span class="stat-value">${s.total_trades} (W:${s.win_trades} / L:${s.loss_trades})</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-trophy"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Win Rate</span>
                            <span class="stat-value">${s.win_rate}%</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon ${s.net_profit >= 0 ? 'green' : 'red'}"><i class="fas fa-dollar-sign"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Net Profit</span>
                            <span class="stat-value ${s.net_profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(s.net_profit)}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple"><i class="fas fa-balance-scale"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Profit Factor</span>
                            <span class="stat-value">${s.profit_factor}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon orange"><i class="fas fa-chart-line"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Total Pips</span>
                            <span class="stat-value">${s.total_pips}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon indigo"><i class="fas fa-fire"></i></div>
                        <div class="stat-info">
                            <span class="stat-label">Consecutive W/L</span>
                            <span class="stat-value">${s.max_consecutive_wins} / ${s.max_consecutive_losses}</span>
                        </div>
                    </div>
                `;

                // Symbols breakdown
                if (s.symbols && s.symbols.length > 0) {
                    statsContainer.innerHTML += `
                        <div class="stat-card" style="grid-column: span 2;">
                            <div class="stat-icon cyan"><i class="fas fa-coins"></i></div>
                            <div class="stat-info">
                                <span class="stat-label">Symbols</span>
                                <span class="stat-value" style="font-size:13px;">${s.symbols.map(sym => 
                                    `${sym.symbol}(${sym.count}) ${sym.profit >= 0 ? '+' : ''}$${sym.profit}`
                                ).join(', ')}</span>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (e) {
            statsContainer.innerHTML = '<div class="loading-state">Error</div>';
        }

        // Load trades
        const tradesContainer = document.getElementById('detail-trades');
        tradesContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด trades...</div>';

        try {
            filters.limit = 50;
            const result = await TradesAPI.getClosedTrades(filters);
            if (!result.error && result.trades && result.trades.length > 0) {
                tradesContainer.innerHTML = `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Type</th>
                                <th>Lots</th>
                                <th>Open</th>
                                <th>Close</th>
                                <th>Profit</th>
                                <th>Pips</th>
                                <th>Swap</th>
                                <th>Open Time</th>
                                <th>Close Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${result.trades.map(t => `
                                <tr>
                                    <td><strong>${t.symbol}</strong></td>
                                    <td><span class="badge ${t.action.toLowerCase().includes('buy') ? 'badge-buy' : 'badge-sell'}">${t.action}</span></td>
                                    <td>${t.lots}</td>
                                    <td>${t.open_price}</td>
                                    <td>${t.close_price}</td>
                                    <td class="${t.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(t.profit)}</td>
                                    <td class="${t.pips >= 0 ? 'positive' : 'negative'}">${t.pips}</td>
                                    <td>${formatCurrency(t.swap)}</td>
                                    <td>${formatDateTime(t.open_time)}</td>
                                    <td>${formatDateTime(t.close_time)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                tradesContainer.innerHTML = '<div class="loading-state">ไม่มี trades</div>';
            }
        } catch (e) {
            tradesContainer.innerHTML = '<div class="loading-state">Error</div>';
        }

        // Scroll to detail
        panel.scrollIntoView({ behavior: 'smooth' });
    };

    // ========== Helpers ==========
    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value || 0);
    }

    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    function formatDateTime(str) {
        if (!str) return '-';
        try {
            const d = new Date(str.replace(' ', 'T'));
            if (isNaN(d.getTime())) return str;
            return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
                   d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        } catch { return str; }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }
});
