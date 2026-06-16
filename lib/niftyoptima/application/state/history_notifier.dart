import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/repositories/i_niftyoptima_repository.dart';
import 'history_state.dart';

class HistoryNotifier extends StateNotifier<HistoryState> {
  HistoryNotifier(this._repo) : super(const HistoryState(loading: true)) {
    refresh();
  }

  final INiftyOptimaRepository _repo;

  Future<void> refresh() async {
    state = state.copyWith(loading: true);
    final res = await _repo.fetchNiftyHistory(tradingDays: state.tradingDays);
    state = state.copyWith(
      loading: false,
      bars: res.bars,
      indexSource: res.indexSource,
      indexError: res.indexError,
    );
  }
}
