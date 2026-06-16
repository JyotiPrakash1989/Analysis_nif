/// Option Greeks for a strike (Delta, Theta, Vega).
class OptionGreeks {
  const OptionGreeks({
    required this.delta,
    required this.theta,
    required this.vega,
    this.gamma,
  });

  final double delta;
  final double theta;
  final double vega;
  final double? gamma;
}
