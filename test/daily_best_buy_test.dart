import 'package:flutter_test/flutter_test.dart';
import 'package:strategy/niftyoptima/data/local/breakout_analysis.dart';
import 'package:strategy/niftyoptima/data/local/daily_best_buy.dart';
import 'package:strategy/niftyoptima/data/local/local_market_helpers.dart';
import 'package:strategy/niftyoptima/domain/entities/niftyoptima_models.dart';

void main() {
  group('daily best buy (stat_react parity)', () {
    test('weak setup stays below threshold', () {
      const prior = FifteenBar(
        open: 90,
        high: 100,
        low: 90,
        close: 99,
        start: 0,
        end: 1,
      );
      final ctx = DailyBuyContext(
        rsi: 65,
        prior15: prior,
        prevClose: 99,
        rules: StrategyRules(
          ce: StrategyRuleLeg(rsiOk: true, ready: true),
          pe: StrategyRuleLeg(rsiOk: false, ready: false),
        ),
      );
      final ce = scoreCeSetup(101, prior, 65, 99);
      final pick = pickBestSideForDay(ctx, 101);
      expect(ce < minDailyScore, isTrue);
      expect(pick, isNull);
    });

    test('strong CE breakout qualifies', () {
      const prior = FifteenBar(
        open: 24400,
        high: 24500,
        low: 24400,
        close: 24498,
        start: 0,
        end: 1,
      );
      final ctx = DailyBuyContext(
        rsi: 78,
        prior15: prior,
        prevClose: 24498,
        rules: StrategyRules(
          ce: StrategyRuleLeg(rsiOk: true, ready: true),
          pe: StrategyRuleLeg(rsiOk: false, ready: false),
        ),
      );
      const spot = 24535.0;
      final ce = scoreCeSetup(spot, prior, 78, 24498);
      final pick = pickBestSideForDay(ctx, spot);
      expect(ce >= minDailyScore, isTrue);
      expect(pick?.side, 'CE');
    });

    test('same 15m window does not emit twice', () {
      const prior = FifteenBar(
        open: 24400,
        high: 24500,
        low: 24400,
        close: 24498,
        start: 0,
        end: 1_700_000_000_000,
      );
      final ctx = DailyBuyContext(
        rsi: 78,
        prior15: prior,
        prevClose: 24498,
        rules: StrategyRules(
          ce: StrategyRuleLeg(rsiOk: true, ready: true),
          pe: StrategyRuleLeg(rsiOk: false, ready: false),
        ),
      );
      const spot = 24535.0;
      final chain = buildSimulatedOptionChain(spot);

      final first = resolveDailyBestBuy(
        state: const DailyBuyState(dayKey: '2026-06-05'),
        now: DateTime.utc(2026, 6, 5, 10),
        spot: spot,
        ctx: ctx,
        chainRows: chain,
      );
      expect(first.isNewSignal, isTrue);
      expect(first.signalsToday, 1);

      final second = resolveDailyBestBuy(
        state: DailyBuyState(
          dayKey: first.dayKey,
          emittedKeys: first.emittedKeys,
          signalsToday: first.signalsToday,
          lastSignal: first.lastSignal,
        ),
        now: DateTime.utc(2026, 6, 5, 10, 5),
        spot: spot,
        ctx: ctx,
        chainRows: chain,
      );
      expect(second.isNewSignal, isFalse);
    });

    test('open position suppresses UI signal', () {
      const prior = FifteenBar(
        open: 24400,
        high: 24500,
        low: 24400,
        close: 24498,
        start: 0,
        end: 1_700_000_000_000,
      );
      final ctx = DailyBuyContext(
        rsi: 78,
        prior15: prior,
        prevClose: 24498,
        rules: StrategyRules(
          ce: StrategyRuleLeg(rsiOk: true, ready: true),
          pe: StrategyRuleLeg(rsiOk: false, ready: false),
        ),
      );
      const spot = 24535.0;
      final result = resolveDailyBestBuy(
        state: const DailyBuyState(dayKey: '2026-06-05'),
        now: DateTime.utc(2026, 6, 5, 10),
        spot: spot,
        ctx: ctx,
        chainRows: buildSimulatedOptionChain(spot),
        hasOpenPosition: true,
        openPosition: const OrderLogEntry(
          id: '1',
          ts: 0,
          dayKey: '2026-06-05',
          action: 'BUY',
          mode: 'manual',
          trigger: 'signal',
          strike: 24500,
          optionType: 'CE',
          status: 'simulated',
          entry: 120,
          sl: 100,
          tgt: 160,
        ),
      );
      expect(result.suppressedByPosition, isTrue);
      expect(result.signal, isNull);
    });
  });
}
