/**
 * WebFX Backend Server
 * Receives trade data from MT4/MT5 EA and serves stats to frontend
 */

const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'webfx-secret-key-change-me';

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// API Key authentication for EA endpoints
function authEA(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_KEY) {
        return res.status(401).json({ error: true, message: 'Invalid API key' });
    }
    next();
}

// ========== EA Endpoints (Protected) ==========

// EA sends when a trade is opened or updated
app.post('/api/trade/open', authEA, (req, res) => {
    try {
        const trade = {
            ticket: req.body.ticket,
            account_id: req.body.account_id || req.body.account || 'default',
            symbol: req.body.symbol || '',
            action: req.body.action || '',
            lots: parseFloat(req.body.lots) || 0,
            open_price: parseFloat(req.body.open_price) || 0,
            close_price: 0,
            open_time: req.body.open_time || new Date().toISOString(),
            close_time: null,
            profit: parseFloat(req.body.profit) || 0,
            pips: parseFloat(req.body.pips) || 0,
            swap: parseFloat(req.body.swap) || 0,
            commission: parseFloat(req.body.commission) || 0,
            comment: req.body.comment || '',
            magic: parseInt(req.body.magic) || 0,
            tp: parseFloat(req.body.tp) || 0,
            sl: parseFloat(req.body.sl) || 0,
            status: 'open'
        };

        db.upsertTrade(trade);
        res.json({ error: false, message: 'Trade recorded', ticket: trade.ticket });
    } catch (e) {
        console.error('POST /api/trade/open error:', e.message);
        res.status(500).json({ error: true, message: e.message });
    }
});

// EA sends when a trade is closed
app.post('/api/trade/close', authEA, (req, res) => {
    try {
        const trade = {
            ticket: req.body.ticket,
            account_id: req.body.account_id || req.body.account || 'default',
            symbol: req.body.symbol || '',
            action: req.body.action || '',
            lots: parseFloat(req.body.lots) || 0,
            open_price: parseFloat(req.body.open_price) || 0,
            close_price: parseFloat(req.body.close_price) || 0,
            open_time: req.body.open_time || '',
            close_time: req.body.close_time || new Date().toISOString(),
            profit: parseFloat(req.body.profit) || 0,
            pips: parseFloat(req.body.pips) || 0,
            swap: parseFloat(req.body.swap) || 0,
            commission: parseFloat(req.body.commission) || 0,
            comment: req.body.comment || '',
            magic: parseInt(req.body.magic) || 0,
            tp: parseFloat(req.body.tp) || 0,
            sl: parseFloat(req.body.sl) || 0,
            status: 'closed'
        };

        db.upsertTrade(trade);
        res.json({ error: false, message: 'Trade closed', ticket: trade.ticket });
    } catch (e) {
        console.error('POST /api/trade/close error:', e.message);
        res.status(500).json({ error: true, message: e.message });
    }
});

// EA batch sync - sends all current trades (open + recently closed)
app.post('/api/trades/sync', authEA, (req, res) => {
    try {
        const accountId = req.body.account_id || req.body.account || 'default';
        const trades = req.body.trades || [];

        if (!Array.isArray(trades)) {
            return res.status(400).json({ error: true, message: 'trades must be an array' });
        }

        // Normalize trades
        const normalized = trades.map(t => ({
            ticket: t.ticket,
            account_id: accountId,
            symbol: t.symbol || '',
            action: t.action || '',
            lots: parseFloat(t.lots) || 0,
            open_price: parseFloat(t.open_price) || 0,
            close_price: parseFloat(t.close_price) || 0,
            open_time: t.open_time || '',
            close_time: t.close_time || null,
            profit: parseFloat(t.profit) || 0,
            pips: parseFloat(t.pips) || 0,
            swap: parseFloat(t.swap) || 0,
            commission: parseFloat(t.commission) || 0,
            comment: t.comment || '',
            magic: parseInt(t.magic) || 0,
            tp: parseFloat(t.tp) || 0,
            sl: parseFloat(t.sl) || 0,
            status: t.close_time ? 'closed' : 'open'
        }));

        const result = db.syncTrades(accountId, normalized);
        res.json({ error: false, message: `Synced ${result.synced} trades`, ...result });
    } catch (e) {
        console.error('POST /api/trades/sync error:', e.message);
        res.status(500).json({ error: true, message: e.message });
    }
});

// ========== Frontend Endpoints (Public) ==========

// Get all trades (with filters)
app.get('/api/trades', (req, res) => {
    try {
        const trades = db.getTrades(req.query);
        res.json({ error: false, trades, count: trades.length });
    } catch (e) {
        res.status(500).json({ error: true, message: e.message });
    }
});

// Get list of all comments
app.get('/api/comments', (req, res) => {
    try {
        const comments = db.getComments(req.query.account_id);
        res.json({ error: false, comments });
    } catch (e) {
        res.status(500).json({ error: true, message: e.message });
    }
});

// Get accounts list
app.get('/api/accounts', (req, res) => {
    try {
        const accounts = db.getAccounts();
        res.json({ error: false, accounts });
    } catch (e) {
        res.status(500).json({ error: true, message: e.message });
    }
});

// Get stats for a specific comment (or all if no comment specified)
app.get('/api/stats', (req, res) => {
    try {
        const stats = db.getStats(req.query);
        res.json({ error: false, stats });
    } catch (e) {
        res.status(500).json({ error: true, message: e.message });
    }
});

// Get stats grouped by all comments
app.get('/api/stats/by-comment', (req, res) => {
    try {
        const stats = db.getStatsAllComments(req.query);
        res.json({ error: false, stats });
    } catch (e) {
        res.status(500).json({ error: true, message: e.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        error: false, 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ========== Start Server ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`WebFX Backend running on port ${PORT}`);
    console.log(`API Key: ${API_KEY.substring(0, 4)}****`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
});
