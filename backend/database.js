/**
 * WebFX Database Module (SQLite)
 * Handles all trade data storage and statistics queries
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'trades.db');
let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initTables();
    }
    return db;
}

function initTables() {
    const d = getDb();

    d.exec(`
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket INTEGER NOT NULL,
            account_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            lots REAL NOT NULL DEFAULT 0,
            open_price REAL DEFAULT 0,
            close_price REAL DEFAULT 0,
            open_time TEXT,
            close_time TEXT,
            profit REAL DEFAULT 0,
            pips REAL DEFAULT 0,
            swap REAL DEFAULT 0,
            commission REAL DEFAULT 0,
            comment TEXT DEFAULT '',
            magic INTEGER DEFAULT 0,
            tp REAL DEFAULT 0,
            sl REAL DEFAULT 0,
            status TEXT DEFAULT 'open',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(ticket, account_id)
        );

        CREATE INDEX IF NOT EXISTS idx_trades_comment ON trades(comment);
        CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id);
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
        CREATE INDEX IF NOT EXISTS idx_trades_ticket ON trades(ticket, account_id);
        CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
        CREATE INDEX IF NOT EXISTS idx_trades_close_time ON trades(close_time);
    `);
}

// ========== Trade Operations ==========

function upsertTrade(trade) {
    const d = getDb();
    const stmt = d.prepare(`
        INSERT INTO trades (ticket, account_id, symbol, action, lots, open_price, close_price, 
                           open_time, close_time, profit, pips, swap, commission, 
                           comment, magic, tp, sl, status, updated_at)
        VALUES (@ticket, @account_id, @symbol, @action, @lots, @open_price, @close_price,
                @open_time, @close_time, @profit, @pips, @swap, @commission,
                @comment, @magic, @tp, @sl, @status, datetime('now'))
        ON CONFLICT(ticket, account_id) DO UPDATE SET
            close_price = @close_price,
            close_time = @close_time,
            profit = @profit,
            pips = @pips,
            swap = @swap,
            commission = @commission,
            tp = @tp,
            sl = @sl,
            status = @status,
            updated_at = datetime('now')
    `);
    return stmt.run(trade);
}

function syncTrades(accountId, trades) {
    const d = getDb();
    const upsert = d.prepare(`
        INSERT INTO trades (ticket, account_id, symbol, action, lots, open_price, close_price, 
                           open_time, close_time, profit, pips, swap, commission, 
                           comment, magic, tp, sl, status, updated_at)
        VALUES (@ticket, @account_id, @symbol, @action, @lots, @open_price, @close_price,
                @open_time, @close_time, @profit, @pips, @swap, @commission,
                @comment, @magic, @tp, @sl, @status, datetime('now'))
        ON CONFLICT(ticket, account_id) DO UPDATE SET
            close_price = @close_price,
            close_time = @close_time,
            profit = @profit,
            pips = @pips,
            swap = @swap,
            commission = @commission,
            tp = @tp,
            sl = @sl,
            status = @status,
            updated_at = datetime('now')
    `);

    const transaction = d.transaction((trades) => {
        for (const trade of trades) {
            trade.account_id = accountId;
            upsert.run(trade);
        }
    });

    transaction(trades);
    return { synced: trades.length };
}

function closeTrade(ticket, accountId, data) {
    const d = getDb();
    const stmt = d.prepare(`
        UPDATE trades SET 
            close_price = @close_price,
            close_time = @close_time,
            profit = @profit,
            pips = @pips,
            swap = @swap,
            commission = @commission,
            status = 'closed',
            updated_at = datetime('now')
        WHERE ticket = @ticket AND account_id = @account_id
    `);
    data.ticket = ticket;
    data.account_id = accountId;
    return stmt.run(data);
}

// ========== Query Operations ==========

function getTrades(filters = {}) {
    const d = getDb();
    let sql = 'SELECT * FROM trades WHERE 1=1';
    const params = {};

    if (filters.status) {
        sql += ' AND status = @status';
        params.status = filters.status;
    }
    if (filters.account_id) {
        sql += ' AND account_id = @account_id';
        params.account_id = filters.account_id;
    }
    if (filters.comment) {
        sql += ' AND comment = @comment';
        params.comment = filters.comment;
    }
    if (filters.symbol) {
        sql += ' AND symbol = @symbol';
        params.symbol = filters.symbol;
    }
    if (filters.start_date) {
        sql += " AND (REPLACE(close_time, '.', '-') >= @start_date OR (status = 'open' AND REPLACE(open_time, '.', '-') >= @start_date))";
        params.start_date = filters.start_date;
    }
    if (filters.end_date) {
        sql += " AND (REPLACE(close_time, '.', '-') <= @end_date OR (status = 'open' AND REPLACE(open_time, '.', '-') <= @end_date))";
        params.end_date = filters.end_date;
    }

    sql += ' ORDER BY COALESCE(close_time, open_time) DESC';

    if (filters.limit) {
        sql += ' LIMIT @limit';
        params.limit = parseInt(filters.limit);
    }

    return d.prepare(sql).all(params);
}

function getComments(accountId) {
    const d = getDb();
    let sql = `SELECT DISTINCT comment FROM trades WHERE comment != ''`;
    const params = {};
    if (accountId) {
        sql += ' AND account_id = @account_id';
        params.account_id = accountId;
    }
    sql += ' ORDER BY comment';
    return d.prepare(sql).all(params).map(r => r.comment);
}

function getAccounts() {
    const d = getDb();
    return d.prepare(`
        SELECT DISTINCT account_id, 
            COUNT(*) as total_trades,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_trades,
            SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_trades
        FROM trades 
        GROUP BY account_id
        ORDER BY account_id
    `).all();
}

// ========== Statistics ==========

function getStats(filters = {}) {
    const d = getDb();
    let whereClause = "WHERE status = 'closed'";
    const params = {};

    if (filters.comment) {
        whereClause += ' AND comment = @comment';
        params.comment = filters.comment;
    }
    if (filters.account_id) {
        whereClause += ' AND account_id = @account_id';
        params.account_id = filters.account_id;
    }
    if (filters.symbol) {
        whereClause += ' AND symbol = @symbol';
        params.symbol = filters.symbol;
    }
    if (filters.start_date) {
        whereClause += " AND REPLACE(close_time, '.', '-') >= @start_date";
        params.start_date = filters.start_date;
    }
    if (filters.end_date) {
        whereClause += " AND REPLACE(close_time, '.', '-') <= @end_date";
        params.end_date = filters.end_date;
    }

    const row = d.prepare(`
        SELECT
            COUNT(*) as total_trades,
            SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as win_trades,
            SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as loss_trades,
            ROUND(SUM(CASE WHEN profit > 0 THEN 1.0 ELSE 0 END) / MAX(COUNT(*), 1) * 100, 1) as win_rate,
            ROUND(SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END), 2) as gross_profit,
            ROUND(SUM(CASE WHEN profit <= 0 THEN profit ELSE 0 END), 2) as gross_loss,
            ROUND(SUM(profit), 2) as net_profit,
            ROUND(SUM(swap), 2) as total_swap,
            ROUND(SUM(commission), 2) as total_commission,
            ROUND(AVG(CASE WHEN profit > 0 THEN profit END), 2) as avg_win,
            ROUND(AVG(CASE WHEN profit <= 0 THEN profit END), 2) as avg_loss,
            ROUND(MAX(profit), 2) as best_trade,
            ROUND(MIN(profit), 2) as worst_trade,
            ROUND(AVG(pips), 1) as avg_pips,
            ROUND(SUM(pips), 1) as total_pips,
            ROUND(SUM(lots), 2) as total_lots,
            MIN(open_time) as first_trade,
            MAX(close_time) as last_trade
        FROM trades ${whereClause}
    `).get(params);

    // Profit Factor
    if (row && row.gross_loss !== 0) {
        row.profit_factor = Math.round(Math.abs(row.gross_profit / row.gross_loss) * 100) / 100;
    } else {
        row.profit_factor = row.gross_profit > 0 ? 999 : 0;
    }

    // Symbols breakdown
    const symbols = d.prepare(`
        SELECT symbol, COUNT(*) as count, ROUND(SUM(profit), 2) as profit
        FROM trades ${whereClause}
        GROUP BY symbol ORDER BY count DESC
    `).all(params);
    row.symbols = symbols;

    // Consecutive wins/losses
    const trades = d.prepare(`
        SELECT profit FROM trades ${whereClause} ORDER BY close_time ASC
    `).all(params);

    let maxConsWins = 0, maxConsLosses = 0, consWins = 0, consLosses = 0;
    for (const t of trades) {
        if (t.profit > 0) {
            consWins++;
            consLosses = 0;
            maxConsWins = Math.max(maxConsWins, consWins);
        } else {
            consLosses++;
            consWins = 0;
            maxConsLosses = Math.max(maxConsLosses, consLosses);
        }
    }
    row.max_consecutive_wins = maxConsWins;
    row.max_consecutive_losses = maxConsLosses;

    return row;
}

function getStatsAllComments(filters = {}) {
    const d = getDb();
    let whereClause = "WHERE status = 'closed' AND comment != ''";
    const params = {};

    if (filters.account_id) {
        whereClause += ' AND account_id = @account_id';
        params.account_id = filters.account_id;
    }
    if (filters.start_date) {
        whereClause += " AND REPLACE(close_time, '.', '-') >= @start_date";
        params.start_date = filters.start_date;
    }
    if (filters.end_date) {
        whereClause += " AND REPLACE(close_time, '.', '-') <= @end_date";
        params.end_date = filters.end_date;
    }

    return d.prepare(`
        SELECT
            comment,
            COUNT(*) as total_trades,
            SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as win_trades,
            SUM(CASE WHEN profit <= 0 THEN 1 ELSE 0 END) as loss_trades,
            ROUND(SUM(CASE WHEN profit > 0 THEN 1.0 ELSE 0 END) / MAX(COUNT(*), 1) * 100, 1) as win_rate,
            ROUND(SUM(profit), 2) as net_profit,
            ROUND(SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END), 2) as gross_profit,
            ROUND(SUM(CASE WHEN profit <= 0 THEN profit ELSE 0 END), 2) as gross_loss,
            ROUND(AVG(CASE WHEN profit > 0 THEN profit END), 2) as avg_win,
            ROUND(AVG(CASE WHEN profit <= 0 THEN profit END), 2) as avg_loss,
            ROUND(MAX(profit), 2) as best_trade,
            ROUND(MIN(profit), 2) as worst_trade,
            ROUND(SUM(pips), 1) as total_pips,
            MIN(open_time) as first_trade,
            MAX(close_time) as last_trade
        FROM trades ${whereClause}
        GROUP BY comment
        ORDER BY net_profit DESC
    `).all(params);
}

module.exports = {
    getDb,
    upsertTrade,
    syncTrades,
    closeTrade,
    getTrades,
    getComments,
    getAccounts,
    getStats,
    getStatsAllComments
};
