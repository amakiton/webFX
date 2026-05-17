//+------------------------------------------------------------------+
//|                                              WebFX_Reporter.mq5  |
//|                        WebFX Trade Reporter for MT5               |
//|                        Sends trade data to VPS backend            |
//+------------------------------------------------------------------+
#property copyright "WebFX"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\DealInfo.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\HistoryOrderInfo.mqh>

//--- Input Parameters
input string   ServerURL    = "http://74.222.26.45:3000";  // Backend Server URL
input string   ApiKey       = "webfx-secret-key-change-me"; // API Key
input string   AccountName  = "";                           // Account Name (blank = auto)
input int      SyncInterval = 300;                          // Sync interval in seconds (300 = 5 min)
input bool     SyncHistory  = true;                         // Sync closed trades history on start
input int      HistoryDays  = 90;                           // How many days of history to sync

//--- Global Variables
datetime lastSyncTime = 0;
string   accountId = "";
int      lastDealsTotal = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
    // Set account identifier
    if(AccountName == "")
        accountId = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
    else
        accountId = AccountName;
    
    Print("WebFX Reporter MT5 initialized for account: ", accountId);
    Print("Server: ", ServerURL);
    
    // Set timer for periodic sync
    EventSetTimer(SyncInterval);
    
    // Initial sync
    if(SyncHistory)
        SyncAllHistory();
    
    SyncOpenPositions();
    
    return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                    |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    EventKillTimer();
    Print("WebFX Reporter MT5 stopped. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Timer function - periodic sync                                     |
//+------------------------------------------------------------------+
void OnTimer()
{
    SyncOpenPositions();
    CheckNewDeals();
}

//+------------------------------------------------------------------+
//| Trade transaction event                                            |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest& request,
                        const MqlTradeResult& result)
{
    // React to deal additions (trade executed)
    if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
    {
        Sleep(500);
        SyncOpenPositions();
        CheckNewDeals();
    }
}

//+------------------------------------------------------------------+
//| Sync all open positions to server                                  |
//+------------------------------------------------------------------+
void SyncOpenPositions()
{
    string tradesJson = "[";
    int count = 0;
    
    for(int i = PositionsTotal() - 1; i >= 0; i--)
    {
        ulong ticket = PositionGetTicket(i);
        if(ticket == 0) continue;
        
        if(count > 0) tradesJson += ",";
        
        string symbol = PositionGetString(POSITION_SYMBOL);
        int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
        double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
        
        // Calculate pips
        double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
        double currentPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
        ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
        double pips = CalcPips(symbol, posType == POSITION_TYPE_BUY ? "Buy" : "Sell", openPrice, currentPrice);
        
        tradesJson += "{";
        tradesJson += "\"ticket\":" + IntegerToString((int)ticket) + ",";
        tradesJson += "\"symbol\":\"" + symbol + "\",";
        tradesJson += "\"action\":\"" + (posType == POSITION_TYPE_BUY ? "Buy" : "Sell") + "\",";
        tradesJson += "\"lots\":" + DoubleToString(PositionGetDouble(POSITION_VOLUME), 2) + ",";
        tradesJson += "\"open_price\":" + DoubleToString(openPrice, digits) + ",";
        tradesJson += "\"close_price\":0,";
        tradesJson += "\"open_time\":\"" + TimeToString(PositionGetInteger(POSITION_TIME), TIME_DATE|TIME_SECONDS) + "\",";
        tradesJson += "\"close_time\":\"\",";
        tradesJson += "\"profit\":" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + ",";
        tradesJson += "\"pips\":" + DoubleToString(pips, 1) + ",";
        tradesJson += "\"swap\":" + DoubleToString(PositionGetDouble(POSITION_SWAP), 2) + ",";
        tradesJson += "\"commission\":0,";
        tradesJson += "\"comment\":\"" + EscapeJson(PositionGetString(POSITION_COMMENT)) + "\",";
        tradesJson += "\"magic\":" + IntegerToString((int)PositionGetInteger(POSITION_MAGIC)) + ",";
        tradesJson += "\"tp\":" + DoubleToString(PositionGetDouble(POSITION_TP), digits) + ",";
        tradesJson += "\"sl\":" + DoubleToString(PositionGetDouble(POSITION_SL), digits) + ",";
        tradesJson += "\"status\":\"open\"";
        tradesJson += "}";
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
//| Check for new deals (closed trades)                                |
//+------------------------------------------------------------------+
void CheckNewDeals()
{
    // Select history for last day to check recent deals
    datetime fromDate = TimeCurrent() - 86400;
    HistorySelect(fromDate, TimeCurrent());
    
    int totalDeals = HistoryDealsTotal();
    
    if(totalDeals <= lastDealsTotal)
    {
        lastDealsTotal = totalDeals;
        return;
    }
    
    // Process new deals
    for(int i = lastDealsTotal; i < totalDeals; i++)
    {
        ulong dealTicket = HistoryDealGetTicket(i);
        if(dealTicket == 0) continue;
        
        // Only process trade deals (not balance/credit operations)
        ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
        if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL)
            continue;
        
        // Only process exit deals (DEAL_ENTRY_OUT or DEAL_ENTRY_INOUT)
        ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
        if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT)
            continue;
        
        SendClosedDeal(dealTicket);
    }
    
    lastDealsTotal = totalDeals;
}

//+------------------------------------------------------------------+
//| Send a closed deal to server                                       |
//+------------------------------------------------------------------+
void SendClosedDeal(ulong dealTicket)
{
    string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
    int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
    
    ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
    // For exit deal: Buy exit means original was Sell, Sell exit means original was Buy
    string action = (dealType == DEAL_TYPE_SELL) ? "Buy" : "Sell";
    
    double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
    double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
    double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
    double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
    double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
    string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
    long magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
    long positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
    datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
    
    // Find the opening deal to get open price and open time
    double openPrice = 0;
    datetime openTime = 0;
    string openComment = comment;
    long openMagic = magic;
    
    // Search history for the opening deal with same position ID
    HistorySelect(0, TimeCurrent());
    for(int i = 0; i < HistoryDealsTotal(); i++)
    {
        ulong ticket = HistoryDealGetTicket(i);
        if(ticket == 0) continue;
        
        if(HistoryDealGetInteger(ticket, DEAL_POSITION_ID) == positionId)
        {
            ENUM_DEAL_ENTRY e = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
            if(e == DEAL_ENTRY_IN)
            {
                openPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
                openTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
                // Opening deal comment is more reliable (EA sets it on open)
                string oc = HistoryDealGetString(ticket, DEAL_COMMENT);
                if(oc != "") openComment = oc;
                long om = HistoryDealGetInteger(ticket, DEAL_MAGIC);
                if(om != 0) openMagic = om;
                break;
            }
        }
    }
    
    // Calculate pips
    double pips = CalcPips(symbol, action, openPrice, closePrice);
    
    // Use position ID as ticket for consistency
    int ticketNum = (int)positionId;
    if(ticketNum == 0) ticketNum = (int)dealTicket;
    
    string body = "{";
    body += "\"account_id\":\"" + accountId + "\",";
    body += "\"ticket\":" + IntegerToString(ticketNum) + ",";
    body += "\"symbol\":\"" + symbol + "\",";
    body += "\"action\":\"" + action + "\",";
    body += "\"lots\":" + DoubleToString(volume, 2) + ",";
    body += "\"open_price\":" + DoubleToString(openPrice, digits) + ",";
    body += "\"close_price\":" + DoubleToString(closePrice, digits) + ",";
    body += "\"open_time\":\"" + TimeToString(openTime, TIME_DATE|TIME_SECONDS) + "\",";
    body += "\"close_time\":\"" + TimeToString(dealTime, TIME_DATE|TIME_SECONDS) + "\",";
    body += "\"profit\":" + DoubleToString(profit, 2) + ",";
    body += "\"pips\":" + DoubleToString(pips, 1) + ",";
    body += "\"swap\":" + DoubleToString(swap, 2) + ",";
    body += "\"commission\":" + DoubleToString(commission, 2) + ",";
    body += "\"comment\":\"" + EscapeJson(openComment) + "\",";
    body += "\"magic\":" + IntegerToString((int)openMagic) + ",";
    body += "\"tp\":0,";
    body += "\"sl\":0";
    body += "}";
    
    HttpPost("/api/trade/close", body);
}

//+------------------------------------------------------------------+
//| Sync all history (on startup)                                      |
//+------------------------------------------------------------------+
void SyncAllHistory()
{
    Print("Syncing trade history (last ", HistoryDays, " days)...");
    
    datetime startDate = TimeCurrent() - HistoryDays * 86400;
    HistorySelect(startDate, TimeCurrent());
    
    string tradesJson = "[";
    int count = 0;
    
    // Group deals by position ID to reconstruct full trades
    // First pass: collect all position IDs with OUT deals
    int totalDeals = HistoryDealsTotal();
    
    for(int i = 0; i < totalDeals; i++)
    {
        ulong dealTicket = HistoryDealGetTicket(i);
        if(dealTicket == 0) continue;
        
        ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
        if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;
        
        ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
        if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
        
        string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
        int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
        
        // This is a closing deal
        double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
        double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
        double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
        double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
        double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
        string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
        long magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
        long positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
        datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
        
        // Original action (opposite of exit deal type)
        string action = (dealType == DEAL_TYPE_SELL) ? "Buy" : "Sell";
        
        // Find opening deal
        double openPrice = 0;
        datetime openTime = 0;
        
        for(int j = 0; j < i; j++)
        {
            ulong t = HistoryDealGetTicket(j);
            if(t == 0) continue;
            if(HistoryDealGetInteger(t, DEAL_POSITION_ID) == positionId)
            {
                ENUM_DEAL_ENTRY e = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(t, DEAL_ENTRY);
                if(e == DEAL_ENTRY_IN)
                {
                    openPrice = HistoryDealGetDouble(t, DEAL_PRICE);
                    openTime = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
                    string oc = HistoryDealGetString(t, DEAL_COMMENT);
                    if(oc != "") comment = oc;
                    long om = HistoryDealGetInteger(t, DEAL_MAGIC);
                    if(om != 0) magic = om;
                    break;
                }
            }
        }
        
        double pips = CalcPips(symbol, action, openPrice, closePrice);
        int ticketNum = (int)positionId;
        if(ticketNum == 0) ticketNum = (int)dealTicket;
        
        if(count > 0) tradesJson += ",";
        
        tradesJson += "{";
        tradesJson += "\"ticket\":" + IntegerToString(ticketNum) + ",";
        tradesJson += "\"symbol\":\"" + symbol + "\",";
        tradesJson += "\"action\":\"" + action + "\",";
        tradesJson += "\"lots\":" + DoubleToString(volume, 2) + ",";
        tradesJson += "\"open_price\":" + DoubleToString(openPrice, digits) + ",";
        tradesJson += "\"close_price\":" + DoubleToString(closePrice, digits) + ",";
        tradesJson += "\"open_time\":\"" + TimeToString(openTime, TIME_DATE|TIME_SECONDS) + "\",";
        tradesJson += "\"close_time\":\"" + TimeToString(closeTime, TIME_DATE|TIME_SECONDS) + "\",";
        tradesJson += "\"profit\":" + DoubleToString(profit, 2) + ",";
        tradesJson += "\"pips\":" + DoubleToString(pips, 1) + ",";
        tradesJson += "\"swap\":" + DoubleToString(swap, 2) + ",";
        tradesJson += "\"commission\":" + DoubleToString(commission, 2) + ",";
        tradesJson += "\"comment\":\"" + EscapeJson(comment) + "\",";
        tradesJson += "\"magic\":" + IntegerToString((int)magic) + ",";
        tradesJson += "\"tp\":0,";
        tradesJson += "\"sl\":0,";
        tradesJson += "\"status\":\"closed\"";
        tradesJson += "}";
        count++;
        
        // Batch send every 100 trades
        if(count >= 100)
        {
            tradesJson += "]";
            string batchBody = "{\"account_id\":\"" + accountId + "\",\"trades\":" + tradesJson + "}";
            HttpPost("/api/trades/sync", batchBody);
            
            tradesJson = "[";
            count = 0;
            Sleep(1000);
        }
    }
    
    if(count > 0)
    {
        tradesJson += "]";
        string batchBody = "{\"account_id\":\"" + accountId + "\",\"trades\":" + tradesJson + "}";
        HttpPost("/api/trades/sync", batchBody);
    }
    
    Print("History sync complete.");
}

//+------------------------------------------------------------------+
//| Calculate pips                                                      |
//+------------------------------------------------------------------+
double CalcPips(string symbol, string action, double openPrice, double closePrice)
{
    if(openPrice == 0 || closePrice == 0) return 0;
    
    double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
    int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
    
    if(point == 0) return 0;
    
    double multiplier = 1.0;
    if(digits == 3 || digits == 5)
        multiplier = 10.0;
    
    double pips = 0;
    if(action == "Buy")
        pips = (closePrice - openPrice) / point / multiplier;
    else
        pips = (openPrice - closePrice) / point / multiplier;
    
    return NormalizeDouble(pips, 1);
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
        if(error == 4014)
            Print("ERROR: URL not allowed. Add '", ServerURL, "' to Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
        else
            Print("HTTP Error: ", error, " URL: ", url);
        return "";
    }
    
    string response = CharArrayToString(result);
    return response;
}
//+------------------------------------------------------------------+
