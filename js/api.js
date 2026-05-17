/**
 * Myfxbook API Client
 * Documentation: https://www.myfxbook.com/api
 */

const MyfxbookAPI = {
    BASE_URL: 'https://www.myfxbook.com/api',
    session: null,

    async _get(path, params = {}) {
        const query = new URLSearchParams(params).toString();
        const url = `${this.BASE_URL}/${path}?${query}`;
        const response = await fetch(url);
        return await response.json();
    },

    /**
     * Login
     */
    async login(email, password) {
        const data = await this._get('login.json', { email, password });
        if (data.error === false && data.session) {
            this.session = data.session;
            localStorage.setItem('myfxbook_session', data.session);
            localStorage.setItem('myfxbook_email', email);
        }
        return data;
    },

    /**
     * Logout
     */
    async logout() {
        if (!this.session) return;
        try {
            await this._get('logout.json', { session: this.session });
        } finally {
            this.session = null;
            localStorage.removeItem('myfxbook_session');
            localStorage.removeItem('myfxbook_email');
        }
    },

    /** Get all linked accounts */
    async getMyAccounts() {
        return await this._get('get-my-accounts.json', { session: this.session });
    },

    /** Get watched accounts */
    async getWatchedAccounts() {
        return await this._get('get-watched-accounts.json', { session: this.session });
    },

    /** Get open trades */
    async getOpenTrades(id) {
        return await this._get('get-open-trades.json', { session: this.session, id });
    },

    /** Get pending orders */
    async getOpenOrders(id) {
        return await this._get('get-open-orders.json', { session: this.session, id });
    },

    /** Get trade history (closed trades) */
    async getHistory(id) {
        return await this._get('get-history.json', { session: this.session, id });
    },

    /** Get daily gain (% per day in date range) */
    async getDailyGain(id, start, end) {
        return await this._get('get-daily-gain.json', {
            session: this.session, id, start, end
        });
    },

    /** Get gain for a date range */
    async getGain(id, start, end) {
        return await this._get('get-gain.json', {
            session: this.session, id, start, end
        });
    },

    /** Get data daily (balance/equity/profit/pips per day) */
    async getDataDaily(id, start, end) {
        return await this._get('get-data-daily.json', {
            session: this.session, id, start, end
        });
    },

    /** Get community outlook */
    async getCommunityOutlook() {
        return await this._get('get-community-outlook.json', { session: this.session });
    },

    /** Restore session from localStorage */
    restoreSession() {
        const session = localStorage.getItem('myfxbook_session');
        if (session) {
            this.session = session;
            return true;
        }
        return false;
    },

    isLoggedIn() {
        return this.session !== null;
    }
};
