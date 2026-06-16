import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/repositories/i_niftyoptima_repository.dart';
import 'stocks_state.dart';

class StocksNotifier extends StateNotifier<StocksState> {
  StocksNotifier(this._repo) : super(const StocksState()) {
    refresh();
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
  }

  final INiftyOptimaRepository _repo;
  Timer? _poll;

  Future<void> refresh() async {
    state = state.copyWith(loading: true, error: '');
    final watch = await _repo.fetchWatchlist();
    final analysis = await _repo.fetchEquityAnalyze();
    state = state.copyWith(
      loading: false,
      watchlist: watch.symbols,
      ranked: analysis.ranked,
      topPick: analysis.topPick,
      analyzedAt: analysis.analyzedAt,
      error: analysis.message ?? '',
    );
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }
}
