import 'entities/backtest_config_model.dart';

/// A named strategy preset (config + label) for multi-strategy evaluation.
class StrategyVariant {
  const StrategyVariant({
    required this.name,
    required this.config,
  });

  final String name;
  final BacktestConfigModel config;
}

/// Catalog of strategy variants screened for profitable suggestions.
class StrategyVariantCatalog {
  StrategyVariantCatalog._();

  static const all = <StrategyVariant>[
    StrategyVariant(name: 'Optimal', config: BacktestConfigModel.optimal),
    StrategyVariant(name: 'Conservative', config: BacktestConfigModel.conservative),
    StrategyVariant(name: 'Aggressive', config: BacktestConfigModel.aggressive),
    StrategyVariant(name: 'Momentum', config: BacktestConfigModel.momentum),
    StrategyVariant(name: 'Scalping', config: BacktestConfigModel.scalpingStyle),
  ];
}
