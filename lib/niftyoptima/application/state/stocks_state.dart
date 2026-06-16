import '../../domain/entities/niftyoptima_models.dart';

class StocksState {
  const StocksState({
    this.loading = false,
    this.error = '',
    this.ranked = const [],
    this.topPick,
    this.watchlist = const [],
    this.analyzedAt = 0,
  });

  final bool loading;
  final String error;
  final List<RankedStock> ranked;
  final RankedStock? topPick;
  final List<String> watchlist;
  final int analyzedAt;

  StocksState copyWith({
    bool? loading,
    String? error,
    List<RankedStock>? ranked,
    RankedStock? topPick,
    List<String>? watchlist,
    int? analyzedAt,
  }) {
    return StocksState(
      loading: loading ?? this.loading,
      error: error ?? this.error,
      ranked: ranked ?? this.ranked,
      topPick: topPick ?? this.topPick,
      watchlist: watchlist ?? this.watchlist,
      analyzedAt: analyzedAt ?? this.analyzedAt,
    );
  }
}
