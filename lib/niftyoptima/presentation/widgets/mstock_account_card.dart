import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/constants/k_sizes.dart';
import '../../../strategy_research/data/auth/mstock_jwt_manager.dart';
import '../../../strategy_research/data/constants/strategy_research_api_keys.dart';
import 'mstock_login_dialog.dart';

/// mStock login status + sign in / sign out — used on the Settings page.
class MstockAccountCard extends StatefulWidget {
  const MstockAccountCard({super.key, this.onAuthChanged});

  /// Called after login or sign out so the shell can refresh live data.
  final VoidCallback? onAuthChanged;

  @override
  State<MstockAccountCard> createState() => _MstockAccountCardState();
}

class _MstockAccountCardState extends State<MstockAccountCard> {
  final _mgr = MstockJwtManager.instance;
  bool _busy = false;
  bool _jwtVisible = false;

  String _maskJwt(String token) {
    if (token.length <= 24) return '${token.substring(0, 6)}…';
    return '${token.substring(0, 12)}…${token.substring(token.length - 8)}';
  }

  Future<void> _copyJwt(String token) async {
    await Clipboard.setData(ClipboardData(text: token));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('JWT copied to clipboard')),
    );
  }

  Future<void> _loginWithTotp() async {
    setState(() => _busy = true);
    final ok = await _mgr.refreshFromTotp();
    setState(() => _busy = false);
    if (ok) {
      widget.onAuthChanged?.call();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Signed in to mStock')),
        );
      }
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_mgr.error.isNotEmpty ? _mgr.error : 'Login failed')),
      );
    }
    if (mounted) setState(() {});
  }

  Future<void> _loginWithSms() async {
    final ok = await showMstockSmsLoginDialog(
      context,
      onAuthenticated: widget.onAuthChanged,
    );
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Signed in to mStock')),
      );
      setState(() {});
    }
  }

  Future<void> _signOut() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'Live quotes and broker orders need an mStock session. '
          'You can sign in again with TOTP or SMS OTP.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
            ),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    await _mgr.clear();
    widget.onAuthChanged?.call();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Signed out of mStock')),
      );
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final apiMissing = StrategyResearchApiKeys.apiKey.trim().isEmpty;
    final signedIn = _mgr.isAuthenticated;
    final jwt = _mgr.accessToken;
    final username = _mgr.savedUsername.isNotEmpty
        ? _mgr.savedUsername
        : StrategyResearchApiKeys.username.trim();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(KSize.margin3x),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  signedIn ? Icons.verified_user_outlined : Icons.lock_outline,
                  color: signedIn
                      ? Colors.green.shade400
                      : theme.colorScheme.error,
                ),
                const SizedBox(width: KSize.margin2x),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        signedIn ? 'Signed in to mStock' : 'Not signed in',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        apiMissing
                            ? 'Set MSTOCK_API_KEY in .env'
                            : signedIn
                                ? username.isNotEmpty
                                    ? 'Client $username · session active until midnight'
                                    : 'Session active until midnight'
                                : _mgr.error.isNotEmpty
                                    ? _mgr.error
                                    : 'Sign in for live data and broker orders',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 4,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: KSize.margin3x),
            if (_busy)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(KSize.margin2x),
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            else if (signedIn) ...[
              if (jwt.isNotEmpty) ...[
                const Divider(height: KSize.margin4x),
                Row(
                  children: [
                    Text(
                      'MSTOCK_JWT_TOKEN',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.secondary,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      tooltip: 'Copy JWT',
                      onPressed: () => _copyJwt(jwt),
                      icon: const Icon(Icons.copy_outlined, size: 20),
                      visualDensity: VisualDensity.compact,
                    ),
                    IconButton(
                      tooltip: _jwtVisible ? 'Hide JWT' : 'Show JWT',
                      onPressed: () => setState(() => _jwtVisible = !_jwtVisible),
                      icon: Icon(
                        _jwtVisible
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 20,
                      ),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
                const SizedBox(height: KSize.margin1x),
                SelectableText(
                  _jwtVisible ? jwt : _maskJwt(jwt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontFamily: 'monospace',
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: KSize.margin2x),
                Text(
                  'Paste into .env as MSTOCK_JWT_TOKEN (valid until midnight).',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: KSize.margin3x),
              ],
              OutlinedButton.icon(
                onPressed: _signOut,
                icon: const Icon(Icons.logout, size: 20),
                label: const Text('Sign out'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: theme.colorScheme.error,
                  side: BorderSide(
                    color: theme.colorScheme.error.withValues(alpha: 0.5),
                  ),
                ),
              ),
            ]
            else
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: apiMissing ? null : _loginWithTotp,
                      icon: const Icon(Icons.pin_outlined, size: 18),
                      label: const Text('Auto TOTP'),
                    ),
                  ),
                  const SizedBox(width: KSize.margin2x),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: apiMissing ? null : _loginWithSms,
                      icon: const Icon(Icons.sms_outlined, size: 18),
                      label: const Text('SMS OTP'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
