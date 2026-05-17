/**
 * Myfxbook API Client
 * Documentation: https://www.myfxbook.com/api
 */

const MyfxbookAPI = {
    BASE_URL: 'https://www.myfxbook.com/api',
    session: null,

    /**
     * Login to Myfxbook
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<object>}
     */
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

    /**
     * Logout from Myfxbook
     * @returns {Promise<object>}
     */
    async logout() {
        if (!this.session) return;

        const url = `${this.BASE_URL}/logout.json?session=${this.session}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data;
        } finally {
            this.session = null;
            localStorage.removeItem('myfxbook_session');
            localStorage.removeItem('myfxbook_email');
        }
    },

    /**
     * Get all accounts
     * @returns {Promise<object>}
     */
    async getMyAccounts() {
        if (!this.session) throw new Error('Not logged in');

        const url = `${this.BASE_URL}/get-my-accounts.json?session=${this.session}`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    },

    /**
     * Get open trades for an account
     * @param {string|number} accountId 
     * @returns {Promise<object>}
     */
    async getOpenTrades(accountId) {
        if (!this.session) throw new Error('Not logged in');

        const url = `${this.BASE_URL}/get-open-trades.json?session=${this.session}&id=${accountId}`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    },

    /**
     * Get trade history for an account
     * @param {string|number} accountId 
     * @returns {Promise<object>}
     */
    async getHistory(accountId) {
        if (!this.session) throw new Error('Not logged in');

        const url = `${this.BASE_URL}/get-history.json?session=${this.session}&id=${accountId}`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    },

    /**
     * Get daily gain data
     * @param {string|number} accountId 
     * @param {string} start - Date format: yyyy-MM-dd
     * @param {string} end - Date format: yyyy-MM-dd
     * @returns {Promise<object>}
     */
    async getDailyGain(accountId, start, end) {
        if (!this.session) throw new Error('Not logged in');

        const url = `${this.BASE_URL}/get-daily-gain.json?session=${this.session}&id=${accountId}&start=${start}&end=${end}`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    },

    /**
     * Restore session from localStorage
     * @returns {boolean}
     */
    restoreSession() {
        const session = localStorage.getItem('myfxbook_session');
        if (session) {
            this.session = session;
            return true;
        }
        return false;
    },

    /**
     * Check if user is logged in
     * @returns {boolean}
     */
    isLoggedIn() {
        return this.session !== null;
    }
};
