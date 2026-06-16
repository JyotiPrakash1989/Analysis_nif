import '../../domain/entities/niftyoptima_models.dart';

class HistoryState {
  const HistoryState({
    this.loading = false,
    this.bars = const [],
    this.indexSource = 'mock',
    this.indexError = '',
    this.tradingDays = 5,
  });

  final bool loading;
  final List<MinuteBar> bars;
  final String indexSource;
  final String indexError;
  final int tradingDays;

  HistoryState copyWith({
    bool? loading,
    List<MinuteBar>? bars,
    String? indexSource,
    String? indexError,
    int? tradingDays,
  }) {
    return HistoryState(
      loading: loading ?? this.loading,
      bars: bars ?? this.bars,
      indexSource: indexSource ?? this.indexSource,
      indexError: indexError ?? this.indexError,
      tradingDays: tradingDays ?? this.tradingDays,
    );
  }
}
