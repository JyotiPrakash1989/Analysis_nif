import 'package:flutter/material.dart';

import '../../../core/constants/k_sizes.dart';
import '../../../strategy_research/data/auth/mstock_jwt_manager.dart';
import '../../../strategy_research/data/constants/strategy_research_api_keys.dart';
import 'mstock_login_dialog.dart';

/// Shows login status; offers SMS OTP flow when auto-TOTP is unavailable.
class MstockAuthBanner extends StatefulWidget {
  const MstockAuthBanner({super.key, this.onAuthenticated});

  final VoidCallback? onAuthenticated;

  @override
  State<MstockAuthBanner> createState() => _MstockAuthBannerState();
}

class _MstockAuthBannerState extends State<MstockAuthBanner> {
  final _mgr = MstockJwtManager.instance;
  bool _bannerBusy = false;

  @override
  void initState() {
    super.initState();
    _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    if (mounted) setState(() {});
  }

  Future<void> _autoLogin() async {
    setState(() => _bannerBusy = true);
    final ok = await _mgr.refreshFromTotp();
    setState(() => _bannerBusy = false);
    if (ok) widget.onAuthenticated?.call();
    if (mounted) setState(() {});
  }

  Future<void> _showSmsOtpDialog() async {
    await showMstockSmsLoginDialog(
      context,
      onAuthenticated: widget.onAuthenticated,
    );
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (_mgr.isAuthenticated) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final apiMissing = StrategyResearchApiKeys.apiKey.trim().isEmpty;

    return Material(
      color: theme.colorScheme.errorContainer.withValues(alpha: 0.35),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: KSize.margin4x,
          vertical: KSize.margin2x,
        ),
        child: Row(
          children: [
            Icon(Icons.lock_outline, color: theme.colorScheme.error, size: 20),
            const SizedBox(width: KSize.margin2x),
            Expanded(
              child: Text(
                apiMissing
                    ? 'Set MSTOCK_API_KEY in .env for live data'
                    : _mgr.error.isNotEmpty
                        ? _mgr.error
                        : 'mStock session required for live data',
                style: theme.textTheme.bodySmall,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (_bannerBusy)
              const Padding(
                padding: EdgeInsets.all(8),
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            else ...[
              TextButton(
                onPressed: apiMissing ? null : _autoLogin,
                child: const Text('Auto TOTP'),
              ),
              TextButton(
                onPressed: apiMissing ? null : _showSmsOtpDialog,
                child: const Text('SMS OTP'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
