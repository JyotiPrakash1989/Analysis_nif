/**
 * NSE equity symbol search for watchlist autocomplete.
 */

import { normalizeSymbol } from './equityWatchlist.mjs';

/** Popular liquid NSE stocks (symbol + company name) — used without broker session. */
export const POPULAR_NSE_EQUITIES = [
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
  { symbol: 'TCS', name: 'Tata Consultancy Services' },
  { symbol: 'INFY', name: 'Infosys' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank' },
  { symbol: 'SBIN', name: 'State Bank of India' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel' },
  { symbol: 'ITC', name: 'ITC' },
  { symbol: 'LT', name: 'Larsen & Toubro' },
  { symbol: 'AXISBANK', name: 'Axis Bank' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical' },
  { symbol: 'WIPRO', name: 'Wipro' },
  { symbol: 'HCLTECH', name: 'HCL Technologies' },
  { symbol: 'TECHM', name: 'Tech Mahindra' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints' },
  { symbol: 'TITAN', name: 'Titan Company' },
  { symbol: 'NESTLEIND', name: 'Nestle India' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement' },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation' },
  { symbol: 'NTPC', name: 'NTPC' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp' },
  { symbol: 'COALINDIA', name: 'Coal India' },
  { symbol: 'TATASTEEL', name: 'Tata Steel' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel' },
  { symbol: 'HINDALCO', name: 'Hindalco Industries' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra' },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors' },
  { symbol: 'DIVISLAB', name: "Divi's Laboratories" },
  { symbol: 'DRREDDY', name: "Dr. Reddy's Laboratories" },
  { symbol: 'CIPLA', name: 'Cipla' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals' },
  { symbol: 'GRASIM', name: 'Grasim Industries' },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank' },
  { symbol: 'SBILIFE', name: 'SBI Life Insurance' },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance' },
  { symbol: 'BRITANNIA', name: 'Britannia Industries' },
  { symbol: 'BPCL', name: 'Bharat Petroleum' },
  { symbol: 'IOC', name: 'Indian Oil Corporation' },
  { symbol: 'VEDL', name: 'Vedanta' },
  { symbol: 'PIDILITIND', name: 'Pidilite Industries' },
  { symbol: 'DMART', name: 'Avenue Supermarts (DMart)' },
  { symbol: 'IRCTC', name: 'Indian Railway Catering' },
  { symbol: 'ZOMATO', name: 'Zomato' },
  { symbol: 'PAYTM', name: 'One 97 Communications (Paytm)' },
  { symbol: 'JIOFIN', name: 'Jio Financial Services' },
  { symbol: 'HAL', name: 'Hindustan Aeronautics' },
  { symbol: 'BEL', name: 'Bharat Electronics' },
  { symbol: 'TRENT', name: 'Trent' },
  { symbol: 'SHREECEM', name: 'Shree Cement' },
  { symbol: 'AMBUJACEM', name: 'Ambuja Cements' },
  { symbol: 'GODREJCP', name: 'Godrej Consumer Products' },
  { symbol: 'DABUR', name: 'Dabur India' },
  { symbol: 'MARICO', name: 'Marico' },
  { symbol: 'COLPAL', name: 'Colgate Palmolive' },
  { symbol: 'HAVELLS', name: 'Havells India' },
  { symbol: 'VOLTAS', name: 'Voltas' },
  { symbol: 'SIEMENS', name: 'Siemens' },
  { symbol: 'ABB', name: 'ABB India' },
  { symbol: 'CUMMINSIND', name: 'Cummins India' },
  { symbol: 'BOSCHLTD', name: 'Bosch' },
  { symbol: 'TVSMOTOR', name: 'TVS Motor Company' },
  { symbol: 'PNB', name: 'Punjab National Bank' },
  { symbol: 'BANKBARODA', name: 'Bank of Baroda' },
  { symbol: 'CANBK', name: 'Canara Bank' },
  { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank' },
  { symbol: 'FEDERALBNK', name: 'Federal Bank' },
  { symbol: 'AUBANK', name: 'AU Small Finance Bank' },
  { symbol: 'BANDHANBNK', name: 'Bandhan Bank' },
  { symbol: 'CHOLAFIN', name: 'Cholamandalam Investment' },
  { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance' },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance' },
  { symbol: 'LICI', name: 'Life Insurance Corporation' },
  { symbol: 'GAIL', name: 'GAIL India' },
  { symbol: 'NHPC', name: 'NHPC' },
  { symbol: 'SJVN', name: 'SJVN' },
  { symbol: 'RECLTD', name: 'REC' },
  { symbol: 'PFC', name: 'Power Finance Corporation' },
  { symbol: 'IRFC', name: 'Indian Railway Finance' },
  { symbol: 'SAIL', name: 'Steel Authority of India' },
  { symbol: 'NMDC', name: 'NMDC' },
  { symbol: 'NATIONALUM', name: 'National Aluminium' },
  { symbol: 'TATAPOWER', name: 'Tata Power' },
  { symbol: 'ADANIGREEN', name: 'Adani Green Energy' },
  { symbol: 'ADANIPOWER', name: 'Adani Power' },
  { symbol: 'DLF', name: 'DLF' },
  { symbol: 'OBEROIRLTY', name: 'Oberoi Realty' },
  { symbol: 'LODHA', name: 'Macrotech Developers (Lodha)' },
  { symbol: 'INDIGO', name: 'InterGlobe Aviation (IndiGo)' },
  { symbol: 'JINDALSTEL', name: 'Jindal Steel & Power' },
  { symbol: 'POLYCAB', name: 'Polycab India' },
  { symbol: 'KEI', name: 'KEI Industries' },
  { symbol: 'PAGEIND', name: 'Page Industries' },
  { symbol: 'TORNTPHARM', name: 'Torrent Pharmaceuticals' },
  { symbol: 'LUPIN', name: 'Lupin' },
  { symbol: 'BIOCON', name: 'Biocon' },
  { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma' },
];

/** @param {string} q @param {Array<{symbol:string,name:string}>} catalog */
function matchCatalog(q, catalog, limit = 12) {
  const query = normalizeSymbol(q);
  if (!query || query.length < 1) return [];

  const out = [];
  const seen = new Set();

  for (const row of catalog) {
    const sym = row.symbol;
    const name = String(row.name ?? '');
    const symU = sym.toUpperCase();
    const nameU = name.toUpperCase();
    const symMatch = symU.startsWith(query) || symU.includes(query);
    const nameMatch = nameU.includes(query.replace(/-/g, ' '));
    if (!symMatch && !nameMatch) continue;
    if (seen.has(symU)) continue;
    seen.add(symU);
    const score = symU.startsWith(query) ? 0 : symMatch ? 1 : 2;
    out.push({ symbol: symU, name, score });
  }

  return out
    .sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
    .map(({ symbol, name }) => ({ symbol, name }));
}

const NAME_BY_SYMBOL = new Map(POPULAR_NSE_EQUITIES.map((r) => [r.symbol, r.name]));

/** @param {string} symbol */
export function getEquityDisplayName(symbol) {
  const sym = normalizeSymbol(symbol);
  return NAME_BY_SYMBOL.get(sym) ?? sym;
}

/** @param {string} q @param {string} [apiKey] @param {string} [jwt] */
export async function searchEquitySymbols(q, apiKey, jwt) {
  const limit = 12;
  let catalog = [...POPULAR_NSE_EQUITIES];

  try {
    const { loadEquitySymbolCatalog } = await import('./equityQuotes.mjs');
    const brokerCatalog = await loadEquitySymbolCatalog(apiKey, jwt);
    if (brokerCatalog.length) {
      const bySym = new Map(catalog.map((r) => [r.symbol, r]));
      for (const row of brokerCatalog) {
        if (!bySym.has(row.symbol)) bySym.set(row.symbol, row);
        else if (row.name && !bySym.get(row.symbol).name) {
          bySym.set(row.symbol, row);
        }
      }
      catalog = [...bySym.values()];
    }
  } catch {
    /* popular list only */
  }

  return matchCatalog(q, catalog, limit);
}
