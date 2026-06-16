/// Default NSE watchlist when no server is available.
class LocalWatchlistStore {
  LocalWatchlistStore._();
  static final instance = LocalWatchlistStore._();

  final List<String> _symbols = [
    'RELIANCE',
    'TCS',
    'INFY',
    'HDFCBANK',
    'ICICIBANK',
    'SBIN',
  ];

  List<String> get symbols => List.unmodifiable(_symbols);

  void add(String symbol) {
    final s = symbol.trim().toUpperCase();
    if (s.isEmpty || _symbols.contains(s)) return;
    _symbols.add(s);
  }

  void remove(String symbol) {
    _symbols.remove(symbol.trim().toUpperCase());
  }
}

/// NSE symbol → mStock token (common liquid names).
const kEquitySymbolTokens = <String, String>{
  'RELIANCE': '2885',
  'TCS': '11536',
  'INFY': '1594',
  'HDFCBANK': '1333',
  'ICICIBANK': '4963',
  'SBIN': '3045',
  'KOTAKBANK': '1922',
  'BHARTIARTL': '10604',
  'ITC': '1660',
  'LT': '11483',
};
