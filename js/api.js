/**
 * Myfxbook API Client
 * Documentation: https://www.myfxbook.com/api
 */

const MyfxbookAPI = {
    BASE_URL: 'https://www.myfxbook.com/api',
    session: null,

    async _request(path, params = {}) {
        const parts = [];
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null) continue;
            parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
        const url = `${this.BASE_URL}/${path}?${parts.join('&')}`;
        console.log('[API] Request:', path, params);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('[API] Response:', path, data);
        return data;
    },

    /**
     * Login
     */
    async login(email, password) {
        // ล้าง session เก่าออกก่อน
        this.session = null;
        localStorage.removeItem('myfxbook_session');

        const data = await this._request('login.json', { email, password });
        if (data.error === false && data.session) {
            this.session = data.session;
            localStorage.setItem('myfxbook_session', data.session);
            localStorage.setItem('myfxbook_email', email);
            console.log('[API] Session saved:', data.session);
        }
        return data;
    },

    async logout() {
        if (!this.session) return;
        try {
            await this._request('logout.json', { session: this.session });
        } finally {
            this.session = null;
            localStorage.removeItem('myfxbook_session');
            localStorage.removeItem('myfxbook_email');
        }
    },

    async getMyAccounts() {
        return await this._request('get-my-accounts.json', { session: this.session });
    },

    async getWatchedAccounts() {
        return await this._request('get-watched-accounts.json', { session: this.session });
    },

    async getOpenTrades(id) {
        return await this._request('get-open-trades.json', { session: this.session, id });
    },

    async getOpenOrders(id) {
        return await this._request('get-open-orders.json', { session: this.session, id });
    },

    async getHistory(id) {
        return await this._request('get-history.json', { session: this.session, id });
    },

    async getDailyGain(id, start, end) {
        return await this._request('get-daily-gain.json', {
            session: this.session, id, start, end
        });
    },

    async getGain(id, start, end) {
        return await this._request('get-gain.json', {
            session: this.session, id, start, end
        });
    },

    async getDataDaily(id, start, end) {
        return await this._request('get-data-daily.json', {
            session: this.session, id, start, end
        });
    },

    async getCommunityOutlook() {
        return await this._request('get-community-outlook.json', { session: this.session });
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

    /** Clear all session data */
    clearSession() {
        this.session = null;
        localStorage.removeItem('myfxbook_session');
    },

    isLoggedIn() {
        return this.session !== null;
    }
};
