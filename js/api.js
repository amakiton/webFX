/**
 * Myfxbook API Client - WebFX
 * All endpoints supported. Session parameter is NOT encoded (contains /).
 */

const MyfxbookAPI = {
    BASE_URL: 'https://www.myfxbook.com/api',
    session: null,

    // ========== Authentication ==========

    async login(email, password) {
        const url = `${this.BASE_URL}/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error === false && data.session) {
            this.session = data.session;
            localStorage.setItem('myfxbook_session', data.session);
            localStorage.setItem('myfxbook_email', email);
        }
        return data;
    },

    async logout() {
        if (!this.session) return;
        const url = `${this.BASE_URL}/logout.json?session=${this.session}`;
        try {
            const response = await fetch(url);
            return await response.json();
        } finally {
            this.session = null;
            localStorage.removeItem('myfxbook_session');
            localStorage.removeItem('myfxbook_email');
        }
    },

    // ========== Account Data ==========

    async getMyAccounts() {
        this._requireSession();
        const url = `${this.BASE_URL}/get-my-accounts.json?session=${this.session}`;
        const response = await fetch(url);
        return await response.json();
    },

    // ========== Trade Data ==========

    async getOpenTrades(accountId) {
        this._requireSession();
        const url = `${this.BASE_URL}/get-open-trades.json?session=${this.session}&id=${accountId}`;
        const response = await fetch(url);
        return await response.json();
    },

    async getOpenOrders(accountId) {
        this._requireSession();
        const url = `${this.BASE_URL}/get-open-orders.json?session=${this.session}&id=${accountId}`;
        const response = await fetch(url);
        return await response.json();
    },

    async getHistory(accountId) {
        this._requireSession();
        const url = `${this.BASE_URL}/get-history.json?session=${this.session}&id=${accountId}`;
        const response = await fetch(url);
        return await response.json();
    },

    // ========== Gain & Performance (Date Range) ==========

    async getDailyGain(accountId, start, end) {
        this._requireSession();
        const url = `${this.BASE_URL}/get-daily-gain.json?session=${this.session}&id=${accountId}&start=${start}&end=${end}`;
        const response = await fetch(url);
        return await response.json();
    },

    async getDataDaily(accountId, start, end) {
        this._requireSession();
        const url = `${this.BASE_URL}/get-data-daily.json?session=${this.session}&id=${accountId}&start=${start}&end=${end}`;
        const response = await fetch(url);
        return await response.json();
    },

    async getGain(accountId, start, end) {
        this._requireSession();
        const url = `${this.BASE_URL}/get-gain.json?session=${this.session}&id=${accountId}&start=${start}&end=${end}`;
        const response = await fetch(url);
        return await response.json();
    },

    // ========== Community ==========

    async getCommunityOutlook() {
        this._requireSession();
        const url = `${this.BASE_URL}/get-community-outlook.json?session=${this.session}`;
        const response = await fetch(url);
        return await response.json();
    },

    // ========== Helpers ==========

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
    },

    _requireSession() {
        if (!this.session) throw new Error('Not logged in');
    }
};
