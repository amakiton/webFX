/**
 * WebFX Trades API Client
 * Communicates with the backend to get trade data and stats by comment
 */

const TradesAPI = {
    BASE_URL: '',

    // ========== Trades ==========

    async getTrades(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const url = `${this.BASE_URL}/api/trades${params ? '?' + params : ''}`;
        const response = await fetch(url);
        return await response.json();
    },

    async getOpenTrades(accountId) {
        return this.getTrades({ status: 'open', account_id: accountId || '' });
    },

    async getClosedTrades(filters = {}) {
        filters.status = 'closed';
        return this.getTrades(filters);
    },

    // ========== Comments ==========

    async getComments(accountId) {
        const params = accountId ? `?account_id=${accountId}` : '';
        const url = `${this.BASE_URL}/api/comments${params}`;
        const response = await fetch(url);
        return await response.json();
    },

    // ========== Accounts ==========

    async getAccounts() {
        const url = `${this.BASE_URL}/api/accounts`;
        const response = await fetch(url);
        return await response.json();
    },

    // ========== Statistics ==========

    async getStats(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const url = `${this.BASE_URL}/api/stats${params ? '?' + params : ''}`;
        const response = await fetch(url);
        return await response.json();
    },

    async getStatsByComment(filters = {}) {
        const params = new URLSearchParams(filters).toString();
        const url = `${this.BASE_URL}/api/stats/by-comment${params ? '?' + params : ''}`;
        const response = await fetch(url);
        return await response.json();
    },

    // ========== Health ==========

    async checkHealth() {
        try {
            const url = `${this.BASE_URL}/api/health`;
            const response = await fetch(url);
            return await response.json();
        } catch (e) {
            return { error: true, message: 'Backend not reachable' };
        }
    }
};
