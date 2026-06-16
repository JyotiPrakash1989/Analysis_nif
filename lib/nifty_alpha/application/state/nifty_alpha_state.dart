import '../../../niftyoptima/domain/entities/niftyoptima_models.dart';
import '../../domain/models/analytics_snapshot.dart';
import '../../domain/models/outlook.dart';
import '../../domain/models/purchase_strategy.dart';
import '../../domain/models/strike_suggestion.dart';

/// App state for Nifty Alpha (live index + purchase strategy).
class NiftyAlphaState {
  const NiftyAlphaState({
    this.niftySpot = 24500,
    this.liveNiftyLtp,
    this.liveNiftyLoading = false,
    this.liveNiftyError = '',
    this.liveNiftyFromLastCandle = false,
    this.dayChange,
    this.outlook = Outlook.bullish,
    this.strikeSuggestion,
    this.analytics,
    this.purchaseStrategy,
    this.strategyLoading = false,
    this.strategyError = '',
    this.signalScanActive = true,
    this.socketConnected = false,
    this.indexSource = 'pending',
    this.lastSignalCheckAt,
    this.signalDetectedAt,
    this.signalsToday = 0,
    this.signalDayKey = '',
    this.holdSuggestion = '',
    this.ceScore = 0,
    this.peScore = 0,
    this.liveRsi,
    this.strategyRules,
    this.hasPosition = false,
    this.openOrderId,
    this.entryPrice,
    this.currentPrice,
    this.trailingSlActive = false,
    this.profitPercent,
  });

  static const signalScanIntervalMinutes = 1;

  final int niftySpot;
  final double? liveNiftyLtp;
  final bool liveNiftyLoading;
  final String liveNiftyError;
  final bool liveNiftyFromLastCandle;
  final NiftyDayChange? dayChange;
  final Outlook outlook;
  final StrikeSuggestion? strikeSuggestion;
  final AnalyticsSnapshot? analytics;
  final PurchaseStrategy? purchaseStrategy;
  final bool strategyLoading;
  final String strategyError;
  final bool signalScanActive;
  final bool socketConnected;
  final String indexSource;
  final DateTime? lastSignalCheckAt;
  final DateTime? signalDetectedAt;
  /// Count of distinct strategy signals shown today (IST calendar day).
  final int signalsToday;
  final String signalDayKey;
  /// Voice-style hold hint when a new setup is blocked by an open position.
  final String holdSuggestion;
  /// CE composite score (0–100) from daily best-buy scorer.
  final double ceScore;
  /// PE composite score (0–100) from daily best-buy scorer.
  final double peScore;
  /// Wilder RSI from latest 1m candles.
  final double? liveRsi;
  /// Live CE/PE rule checks (breakout + RSI gates).
  final Map<String, StrategyRuleLeg?>? strategyRules;
  final bool hasPosition;
  /// Order id of today's open purchase (from order log).
  final String? openOrderId;
  final double? entryPrice;
  final double? currentPrice;
  final bool trailingSlActive;
  final double? profitPercent;

  /// Effective Nifty for display: live LTP if available, else last known spot.
  double? get effectiveNiftyLtp => liveNiftyLtp;
  int get effectiveNiftySpot => liveNiftyLtp != null ? liveNiftyLtp!.round() : niftySpot;

  bool get waitingForSignal => purchaseStrategy == null && !strategyLoading;

  NiftyAlphaState copyWith({
    int? niftySpot,
    double? liveNiftyLtp,
    bool? liveNiftyLoading,
    String? liveNiftyError,
    bool? liveNiftyFromLastCandle,
    NiftyDayChange? dayChange,
    bool clearDayChange = false,
    Outlook? outlook,
    StrikeSuggestion? strikeSuggestion,
    bool clearStrikeSuggestion = false,
    AnalyticsSnapshot? analytics,
    PurchaseStrategy? purchaseStrategy,
    bool clearPurchaseStrategy = false,
    bool? strategyLoading,
    String? strategyError,
    bool? signalScanActive,
    bool? socketConnected,
    String? indexSource,
    DateTime? lastSignalCheckAt,
    DateTime? signalDetectedAt,
    bool clearSignalDetectedAt = false,
    int? signalsToday,
    String? signalDayKey,
    String? holdSuggestion,
    bool clearHoldSuggestion = false,
    double? ceScore,
    double? peScore,
    double? liveRsi,
    Map<String, StrategyRuleLeg?>? strategyRules,
    bool? hasPosition,
    String? openOrderId,
    bool clearOpenOrderId = false,
    double? entryPrice,
    double? currentPrice,
    bool? trailingSlActive,
    double? profitPercent,
  }) {
    return NiftyAlphaState(
      niftySpot: niftySpot ?? this.niftySpot,
      liveNiftyLtp: liveNiftyLtp ?? this.liveNiftyLtp,
      liveNiftyLoading: liveNiftyLoading ?? this.liveNiftyLoading,
      liveNiftyError: liveNiftyError ?? this.liveNiftyError,
      liveNiftyFromLastCandle: liveNiftyFromLastCandle ?? this.liveNiftyFromLastCandle,
      dayChange: clearDayChange ? null : (dayChange ?? this.dayChange),
      outlook: outlook ?? this.outlook,
      strikeSuggestion:
          clearStrikeSuggestion ? null : (strikeSuggestion ?? this.strikeSuggestion),
      analytics: analytics ?? this.analytics,
      purchaseStrategy: clearPurchaseStrategy ? null : (purchaseStrategy ?? this.purchaseStrategy),
      strategyLoading: strategyLoading ?? this.strategyLoading,
      strategyError: strategyError ?? this.strategyError,
      signalScanActive: signalScanActive ?? this.signalScanActive,
      socketConnected: socketConnected ?? this.socketConnected,
      indexSource: indexSource ?? this.indexSource,
      lastSignalCheckAt: lastSignalCheckAt ?? this.lastSignalCheckAt,
      signalDetectedAt: clearSignalDetectedAt
          ? null
          : (signalDetectedAt ?? this.signalDetectedAt),
      signalsToday: signalsToday ?? this.signalsToday,
      signalDayKey: signalDayKey ?? this.signalDayKey,
      holdSuggestion: clearHoldSuggestion ? '' : (holdSuggestion ?? this.holdSuggestion),
      ceScore: ceScore ?? this.ceScore,
      peScore: peScore ?? this.peScore,
      liveRsi: liveRsi ?? this.liveRsi,
      strategyRules: strategyRules ?? this.strategyRules,
      hasPosition: hasPosition ?? this.hasPosition,
      openOrderId: clearOpenOrderId ? null : (openOrderId ?? this.openOrderId),
      entryPrice: entryPrice ?? this.entryPrice,
      currentPrice: currentPrice ?? this.currentPrice,
      trailingSlActive: trailingSlActive ?? this.trailingSlActive,
      profitPercent: profitPercent ?? this.profitPercent,
    );
  }
}
