import '../../niftyoptima/domain/entities/niftyoptima_models.dart';

/// Minimum score to qualify as a profitable setup (matches stat_react).
const minProfitableScore = 92.0;

String signalAlertKey(SignalPayload sig) {
  if (sig.dailyPick == true) {
    final idx = sig.signalIndex ?? 0;
    return 'daily-$idx-${sig.side}-${sig.strike}-${sig.ts}';
  }
  return '${sig.side}-${sig.strike}-${sig.ts ~/ 5000}';
}

String holdSuggestionAlertKey(HoldSuggestion hold) {
  return 'hold-${hold.strike}-${hold.optionType}-'
      '${hold.suppressedSide ?? 'na'}-${hold.ts}';
}

String holdForTargetVoiceText(HoldSuggestion hold) {
  final leg = hold.optionType == 'CE' ? 'call' : 'put';
  final tgt = hold.tgt.round();
  final entry = hold.entry.round();
  final suppressed = hold.suppressedSide != null && hold.suppressedScore != null
      ? ' A new ${hold.suppressedSide == 'CE' ? 'call' : 'put'} setup scored '
          '${hold.suppressedScore!.round()} percent, but '
      : ' ';
  return 'Position open.$suppressed'
      'Hold your NIFTY ${hold.strike} $leg for more target. '
      'Entry $entry, target $tgt. '
      'Do not take a new trade until this position closes.';
}

String signalVoiceText(SignalPayload sig, bool autoTrading) {
  final leg = sig.side == 'CE' ? 'call' : 'put';
  final entry = sig.entry.round();
  final modeLine = autoTrading
      ? 'Auto trading on. Order will be placed automatically.'
      : 'Manual trading on. Use execute trade when ready.';
  return 'Strategy alert. $modeLine Buy $leg. '
      'NIFTY ${sig.strike} ${sig.optionType}, entry $entry. '
      'Stop ${sig.sl.round()}, target ${sig.tgt.round()}.';
}

String tradingModeVoiceText(bool autoTrading) {
  return autoTrading
      ? 'Auto trading enabled. Voice alerts active for signals and automatic orders.'
      : 'Manual trading enabled. Voice alerts active for signals and manual orders.';
}

String orderLogVoiceText(OrderLogEntry entry) {
  if (entry.action == 'UPDATE') return '';
  final leg = entry.optionType == 'CE' ? 'call' : 'put';
  final mode = entry.mode == 'auto' ? 'Automatic' : 'Manual';

  if (entry.action == 'BUY') {
    final entryPx = (entry.entry ?? 0).round();
    final tgt = (entry.tgt ?? 0).round();
    if (entry.status == 'failed') {
      return '$mode buy failed for NIFTY ${entry.strike} $leg.';
    }
    return '$mode buy placed. NIFTY ${entry.strike} $leg, entry $entryPx, target $tgt.';
  }

  if (entry.action == 'SELL') {
    final exitPx = (entry.exitPrice ?? entry.ltp ?? entry.entry ?? 0).round();
    final sl = (entry.sl ?? 0).round();
    final tgt = (entry.tgt ?? 0).round();
    final isClosing = entry.status == 'target_exit' ||
        entry.status == 'stoploss_exit' ||
        entry.status == 'closed';
    if (entry.trigger == 'target') {
      if (isClosing) {
        return 'Target completed. NIFTY ${entry.strike} $leg reached target $tgt. '
            'Premium $exitPx. $mode sell filled.';
      }
      return '$mode target sell placed at $tgt for NIFTY ${entry.strike} $leg.';
    }
    if (entry.trigger == 'stoploss') {
      if (isClosing) {
        return 'Stop loss triggered. NIFTY ${entry.strike} $leg hit stop $sl. '
            'Premium $exitPx. $mode sell filled.';
      }
      return '$mode stop-loss sell placed at $sl for NIFTY ${entry.strike} $leg.';
    }
    return '$mode sell placed. NIFTY ${entry.strike} $leg, exit near $exitPx.';
  }
  return '';
}

String positionExitVoiceText(
  int strike,
  String optionType,
  String kind,
  double ltp,
  double level,
) {
  final leg = optionType == 'CE' ? 'call' : 'put';
  final px = ltp.round();
  final lvl = level.round();
  if (kind == 'target') {
    return 'Target completed. NIFTY $strike $leg premium $px reached target $lvl.';
  }
  return 'Stop loss triggered. NIFTY $strike $leg premium $px hit stop loss $lvl.';
}

String voiceTestText({bool? autoTrading}) {
  final mode = autoTrading == true
      ? 'Auto trading'
      : autoTrading == false
          ? 'Manual trading'
          : 'Auto or manual trading';
  return 'Strategy voice is on. You will hear alerts for $mode: '
      'signals, buy orders, target completed, and stop loss triggered.';
}

/// Which side scores higher and whether it qualifies as profitable.
({String label, String side, double score, bool qualifies}) profitableSide({
  required double ceScore,
  required double peScore,
}) {
  if (ceScore >= peScore && ceScore >= minProfitableScore) {
    return (label: 'CE (call)', side: 'CE', score: ceScore, qualifies: true);
  }
  if (peScore > ceScore && peScore >= minProfitableScore) {
    return (label: 'PE (put)', side: 'PE', score: peScore, qualifies: true);
  }
  if (ceScore >= peScore) {
    return (label: 'CE (call)', side: 'CE', score: ceScore, qualifies: false);
  }
  return (label: 'PE (put)', side: 'PE', score: peScore, qualifies: false);
}

String profitableSideVoiceText({
  required double ceScore,
  required double peScore,
}) {
  final best = profitableSide(ceScore: ceScore, peScore: peScore);
  if (best.qualifies) {
    return 'More profitable setup today is ${best.label} with score '
        '${best.score.round()} percent. Need at least ${minProfitableScore.round()} to trade.';
  }
  return 'No profitable setup yet. CE score ${ceScore.round()}, PE score '
      '${peScore.round()}. Need at least ${minProfitableScore.round()} percent.';
}
