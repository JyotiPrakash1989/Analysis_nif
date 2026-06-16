/// Domain errors for strategy research feature.
sealed class StrategyResearchError {
  const StrategyResearchError();
}

final class StrategyResearchErrorNotFound extends StrategyResearchError {
  const StrategyResearchErrorNotFound();
}

final class StrategyResearchErrorValidation extends StrategyResearchError {
  const StrategyResearchErrorValidation(this.message);
  final String message;
}

final class StrategyResearchErrorTimeout extends StrategyResearchError {
  const StrategyResearchErrorTimeout();
}

final class StrategyResearchErrorUnknown extends StrategyResearchError {
  const StrategyResearchErrorUnknown([this.message]);
  final String? message;
}
