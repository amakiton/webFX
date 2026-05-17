//+------------------------------------------------------------------+
//|                                              WebFX_Reporter.mq4  |
//|                        WebFX Trade Reporter for MT4               |
//|                        Sends trade data to VPS backend            |
//+------------------------------------------------------------------+
#property copyright "WebFX"
#property version   "1.00"
#property strict

//--- Input Parameters
input string   ServerURL    = "http://74.222.26.45:3000";  // Backend Server URL
input string   ApiKey       = "webfx-secret-key-change-me"; // API Key
input string   AccountName  = "";                           // Account Name (blank = auto)
input int      SyncInterval = 300;                          // Sync interval in seconds (300 = 5 min)
input bool     SyncHistory  = true;                         // Sync closed trades history on start
input int      HistoryDays  = 90;                           // How many days of history to sync

//--- Global Variables
datetime lastSyncTime = 0;
int      lastOrderCount = 0;
string   accountId = "";

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
    // Set account identifier
    if(AccountName == "")
        accountId = IntegerToString(AccountNumber());
    else
        accountId = AccountName;
    
    Print("WebFX Reporter initialized for account: ", accountId);
    Print("Server: ", ServerURL);
    
    // Set timer for periodic sync
    EventSetTimer(SyncInterval);
    
    // Initial sync
    if(SyncHistory)
        SyncAllHistory();
    
    SyncOpenTrades();
    
    return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                    |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    EventKillTimer();
    Print("WebFX Reporter stopped. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Timer function - periodic sync                                     |
//+------------------------------------------------------------------+
void OnTimer()
{
    SyncOpenTrades();
    
    // Check if any new closed trades since last sync
    CheckNewClosedTrades();
}

//+------------------------------------------------------------------+
//| Trade event - triggered on any trade activity                      |
//+------------------------------------------------------------------+
void OnTrade()
{
    // Small delay to ensure trade is fully processed
    Sleep(500);
    SyncOpenTrades();
    CheckNewClosedTrades();
}

//+------------------------------------------------------------------+
//| Sync all open trades to server                                     |
//+------------------------------------------------------------------+
void SyncOpenTrades()
{
    string tradesJson = "[";
    int count = 0;
    
    for(int i = OrdersTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
            continue;
        
        // Skip pending orders (only actual trades)
        if(OrderType() > OP_SELL)
            continue;
            
        if(count > 0) tradesJson += ",";
        
        tradesJson += TradeToJson(
            OrderTicket(),
            OrderSymbol(),
            OrderTypeToString(OrderType()),
            OrderLots(),
            OrderOpenPrice(),
            0,  // close_price
            TimeToString(OrderOpenTime(), TIME_DATE|TIME_SECONDS),
            "",  // close_time (still open)
            OrderProfit(),
            OrderPipsCalc(),
            OrderSwap(),
            OrderCommission(),
            OrderComment(),
            OrderMagicNumber(),
            OrderTakeProfit(),
            OrderStopLoss(),
            "open"
        );
        count++;
    }
    
    tradesJson += "]";
    
    // Send to server
    string body = "{\"account_id\":\"" + accountId + "\",\"trades\":" + tradesJson + "}";
    string response = HttpPost("/api/trades/sync", body);
    
    if(response != "")
        lastSyncTime = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Check for newly closed trades                                      |
//+------------------------------------------------------------------+
void CheckNewClosedTrades()
{
    static int lastHistoryTotal = 0;
    int currentHistory = OrdersHistoryTotal();
    
    if(currentHistory <= lastHistoryTotal)
    {
        lastHistoryTotal = currentHistory;
        return;
    }
    
    // New closed trades detected - sync recent ones
    for(int i = currentHistory - 1; i >= lastHistoryTotal; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
            continue;
        
        // Skip non-trade entries (deposits, etc.)
        if(OrderType() > OP_SELL)
            continue;
        
        SendClosedTrade(i);
    }
    
    lastHistoryTotal = currentHistory;
}

//+------------------------------------------------------------------+
//| Send a single closed trade to server                               |
//+------------------------------------------------------------------+
void SendClosedTrade(int index)
{
    if(!OrderSelect(index, SELECT_BY_POS, MODE_HISTORY))
        return;
    
    string body = "{";
    body += "\"account_id\":\"" + accountId + "\",";
    body += "\"ticket\":" + IntegerToString(OrderTicket()) + ",";
    body += "\"symbol\":\"" + OrderSymbol() + "\",";
    body += "\"action\":\"" + OrderTypeToString(OrderType()) + "\",";
    body += "\"lots\":" + DoubleToString(OrderLots(), 2) + ",";
    body += "\"open_price\":" + DoubleToString(OrderOpenPrice(), (int)MarketInfo(OrderSymbol(), MODE_DIGITS)) + ",";
    body += "\"close_price\":" + DoubleToString(OrderClosePrice(), (int)MarketInfo(OrderSymbol(), MODE_DIGITS)) + ",";
    body += "\"open_time\":\"" + TimeToString(OrderOpenTime(), TIME_DATE|TIME_SECONDS) + "\",";
    body += "\"close_time\":\"" + TimeToString(OrderCloseTime(), TIME_DATE|TIME_SECONDS) + "\",";
    body += "\"profit\":" + DoubleToString(OrderProfit(), 2) + ",";
    body += "\"pips\":" + DoubleToString(OrderPipsCalc(), 1) + ",";
    body += "\"swap\":" + DoubleToString(OrderSwap(), 2) + ",";
    body += "\"commission\":" + DoubleToString(OrderCommission(), 2) + ",";
    body += "\"comment\":\"" + EscapeJson(OrderComment()) + "\",";
    body += "\"magic\":" + IntegerToString(OrderMagicNumber()) + ",";
    body += "\"tp\":" + DoubleToString(OrderTakeProfit(), (int)MarketInfo(OrderSymbol(), MODE_DIGITS)) + ",";
    body += "\"sl\":" + DoubleToString(OrderStopLoss(), (int)MarketInfo(OrderSymbol(), MODE_DIGITS));
    body += "}";
    
    HttpPost("/api/trade/close", body);
}

//+------------------------------------------------------------------+
//| Sync all history trades (on startup)                               |
//+------------------------------------------------------------------+
void SyncAllHistory()
{
    Print("Syncing trade history (last ", HistoryDays, " days)...");
    
    string tradesJson = "[";
    int count = 0;
    datetime startDate = TimeCurrent() - HistoryDays * 86400;
    
    for(int i = OrdersHistoryTotal() - 1; i >= 0; i--)
    {
        if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
            continue;
        
        // Skip non-trade entries
        if(OrderType() > OP_SELL)
            continue;
        
        // Skip old trades
        if(OrderCloseTime() < startDate)
            continue;
        
        if(count > 0) tradesJson += ",";
        
        tradesJson += TradeToJson(
            OrderTicket(),
            OrderSymbol(),
            OrderTypeToString(OrderType()),
            OrderLots(),
            OrderOpenPrice(),
            OrderClosePrice(),
            TimeToString(OrderOpenTime(), TIME_DATE|TIME_SECONDS),
            TimeToString(OrderCloseTime(), TIME_DATE|TIME_SECONDS),
            OrderProfit(),
            OrderPipsCalc(),
            OrderSwap(),
            OrderCommission(),
            OrderComment(),
            OrderMagicNumber(),
            OrderTakeProfit(),
            OrderStopLoss(),
            "closed"
        );
        count++;
        
        // Batch send every 100 trades to avoid too large payload
        if(count >= 100)
        {
            tradesJson += "]";
            string body = "{\"account_id\":\"" + accountId + "\",\"trades\":" + tradesJson + "}";
            HttpPost("/api/trades/sync", body);
            
            tradesJson = "[";
            count = 0;
            Sleep(1000); // Rate limit
        }
    }
    
    if(count > 0)
    {
        tradesJson += "]";
        string body = "{\"account_id\":\"" + accountId + "\",\"trades\":" + tradesJson + "}";
        HttpPost("/api/trades/sync", body);
    }
    
    Print("History sync complete. Total trades synced.");
}

//+------------------------------------------------------------------+
//| Build JSON string for a single trade                               |
//+------------------------------------------------------------------+
string TradeToJson(int ticket, string symbol, string action, double lots,
                   double openPrice, double closePrice, string openTime,
                   string closeTime, double profit, double pips,
                   double swap, double commission, string comment,
                   int magic, double tp, double sl, string status)
{
    int digits = (int)MarketInfo(symbol, MODE_DIGITS);
    
    string json = "{";
    json += "\"ticket\":" + IntegerToString(ticket) + ",";
    json += "\"symbol\":\"" + symbol + "\",";
    json += "\"action\":\"" + action + "\",";
    json += "\"lots\":" + DoubleToString(lots, 2) + ",";
    json += "\"open_price\":" + DoubleToString(openPrice, digits) + ",";
    json += "\"close_price\":" + DoubleToString(closePrice, digits) + ",";
    json += "\"open_time\":\"" + openTime + "\",";
    json += "\"close_time\":\"" + (closeTime != "" ? closeTime : "") + "\",";
    json += "\"profit\":" + DoubleToString(profit, 2) + ",";
    json += "\"pips\":" + DoubleToString(pips, 1) + ",";
    json += "\"swap\":" + DoubleToString(swap, 2) + ",";
    json += "\"commission\":" + DoubleToString(commission, 2) + ",";
    json += "\"comment\":\"" + EscapeJson(comment) + "\",";
    json += "\"magic\":" + IntegerToString(magic) + ",";
    json += "\"tp\":" + DoubleToString(tp, digits) + ",";
    json += "\"sl\":" + DoubleToString(sl, digits) + ",";
    json += "\"status\":\"" + status + "\"";
    json += "}";
    
    return json;
}

//+------------------------------------------------------------------+
//| Calculate pips for current order                                    |
//+------------------------------------------------------------------+
double OrderPipsCalc()
{
    string symbol = OrderSymbol();
    double point = MarketInfo(symbol, MODE_POINT);
    int digits = (int)MarketInfo(symbol, MODE_DIGITS);
    
    if(point == 0) return 0;
    
    double multiplier = 1.0;
    if(digits == 3 || digits == 5)
        multiplier = 10.0;
    
    double pips = 0;
    if(OrderType() == OP_BUY)
    {
        double closeP = (OrderClosePrice() > 0) ? OrderClosePrice() : MarketInfo(symbol, MODE_BID);
        pips = (closeP - OrderOpenPrice()) / point / multiplier;
    }
    else if(OrderType() == OP_SELL)
    {
        double closeP = (OrderClosePrice() > 0) ? OrderClosePrice() : MarketInfo(symbol, MODE_ASK);
        pips = (OrderOpenPrice() - closeP) / point / multiplier;
    }
    
    return NormalizeDouble(pips, 1);
}

//+------------------------------------------------------------------+
//| Convert order type to string                                        |
//+------------------------------------------------------------------+
string OrderTypeToString(int type)
{
    switch(type)
    {
        case OP_BUY:       return "Buy";
        case OP_SELL:      return "Sell";
        case OP_BUYLIMIT:  return "Buy Limit";
        case OP_SELLLIMIT: return "Sell Limit";
        case OP_BUYSTOP:   return "Buy Stop";
        case OP_SELLSTOP:  return "Sell Stop";
        default:           return "Unknown";
    }
}

//+------------------------------------------------------------------+
//| Escape special characters for JSON                                  |
//+------------------------------------------------------------------+
string EscapeJson(string text)
{
    string result = text;
    StringReplace(result, "\\", "\\\\");
    StringReplace(result, "\"", "\\\"");
    StringReplace(result, "\n", "\\n");
    StringReplace(result, "\r", "\\r");
    StringReplace(result, "\t", "\\t");
    return result;
}

//+------------------------------------------------------------------+
//| HTTP POST request                                                   |
//+------------------------------------------------------------------+
string HttpPost(string endpoint, string body)
{
    string url = ServerURL + endpoint;
    string headers = "Content-Type: application/json\r\nX-API-Key: " + ApiKey + "\r\n";
    
    char postData[];
    char result[];
    string resultHeaders;
    
    StringToCharArray(body, postData, 0, StringLen(body));
    
    int timeout = 10000; // 10 seconds
    
    int res = WebRequest("POST", url, headers, timeout, postData, result, resultHeaders);
    
    if(res == -1)
    {
        int error = GetLastError();
        if(error == 4060)
            Print("ERROR: URL not allowed. Add '", ServerURL, "' to Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
        else
            Print("HTTP Error: ", error, " URL: ", url);
        return "";
    }
    
    string response = CharArrayToString(result);
    return response;
}
//+------------------------------------------------------------------+
