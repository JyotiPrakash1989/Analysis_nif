import 'package:flutter/material.dart';

import '../../../core/constants/k_sizes.dart';
import '../../../strategy_research/data/auth/mstock_auth_service.dart';
import '../../../strategy_research/data/auth/mstock_jwt_manager.dart';
import '../../../strategy_research/data/constants/strategy_research_api_keys.dart';

/// SMS OTP login dialog — shared by the auth banner and Settings page.
Future<bool> showMstockSmsLoginDialog(
  BuildContext context, {
  VoidCallback? onAuthenticated,
}) async {
  final mgr = MstockJwtManager.instance;
  final savedUser = mgr.savedUsername.trim();
  final savedPass = mgr.savedPassword.trim();
  final envUser = StrategyResearchApiKeys.username.trim();
  final envPass = StrategyResearchApiKeys.password.trim();
  final fromSaved = savedUser.isNotEmpty && savedPass.isNotEmpty;
  final fromEnv = !fromSaved && envUser.isNotEmpty && envPass.isNotEmpty;
  final initialUser = fromSaved ? savedUser : envUser;
  final initialPass = fromSaved ? savedPass : envPass;

  final userCtrl = TextEditingController(text: initialUser);
  final passCtrl = TextEditingController(text: initialPass);
  final otpCtrl = TextEditingController();
  var otpSent = false;
  var dialogBusy = false;
  var dialogError = '';
  var dialogInfo = '';
  var showPassword = false;
  var verified = false;

  Future<void> sendOtp(void Function(void Function()) setDialog) async {
    final user = userCtrl.text.trim();
    final pass = passCtrl.text.trim();
    if (user.isEmpty || pass.isEmpty) {
      setDialog(() {
        dialogError =
            'Enter client ID and password, or set MSTOCK_USERNAME / MSTOCK_PASSWORD in .env.';
        dialogInfo = '';
      });
      return;
    }
    if (StrategyResearchApiKeys.apiKey.trim().isEmpty) {
      setDialog(() {
        dialogError = 'MSTOCK_API_KEY is missing in .env';
        dialogInfo = '';
      });
      return;
    }

    setDialog(() {
      dialogBusy = true;
      dialogError = '';
      dialogInfo = '';
    });
    try {
      final msg = await mgr.requestSmsOtp(username: user, password: pass);
      setDialog(() {
        otpSent = true;
        dialogBusy = false;
        dialogInfo = msg;
      });
    } on MstockAuthException catch (e) {
      setDialog(() {
        dialogError = e.hint != null ? '${e.message}\n${e.hint}' : e.message;
        dialogBusy = false;
      });
    } catch (e) {
      setDialog(() {
        dialogError = e.toString();
        dialogBusy = false;
      });
    }
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setDialog) {
        return AlertDialog(
          title: const Text('mStock SMS login'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if ((fromSaved || fromEnv) && !otpSent)
                  Padding(
                    padding: const EdgeInsets.only(bottom: KSize.margin2x),
                    child: Text(
                      fromSaved
                          ? 'Client ID and password saved from last login'
                          : 'Client ID and password loaded from .env',
                      style: Theme.of(ctx).textTheme.labelSmall?.copyWith(
                            color: Theme.of(ctx).colorScheme.secondary,
                          ),
                    ),
                  ),
                if (!otpSent) ...[
                  TextField(
                    controller: userCtrl,
                    enabled: !dialogBusy,
                    decoration: const InputDecoration(
                      labelText: 'Client ID / username',
                      hintText: 'MSTOCK_USERNAME',
                    ),
                  ),
                  const SizedBox(height: KSize.margin2x),
                  TextField(
                    controller: passCtrl,
                    enabled: !dialogBusy,
                    obscureText: !showPassword,
                    decoration: InputDecoration(
                      labelText: 'Password',
                      hintText: 'MSTOCK_PASSWORD',
                      suffixIcon: IconButton(
                        icon: Icon(
                          showPassword
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                        ),
                        onPressed: dialogBusy
                            ? null
                            : () => setDialog(() => showPassword = !showPassword),
                      ),
                    ),
                  ),
                ] else ...[
                  const Text('Enter the OTP sent to your registered mobile.'),
                  const SizedBox(height: KSize.margin2x),
                  TextField(
                    controller: otpCtrl,
                    enabled: !dialogBusy,
                    keyboardType: TextInputType.number,
                    maxLength: 8,
                    decoration: const InputDecoration(labelText: 'SMS OTP'),
                  ),
                ],
                if (dialogInfo.isNotEmpty) ...[
                  const SizedBox(height: KSize.margin2x),
                  Text(
                    dialogInfo,
                    style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                          color: Theme.of(ctx).colorScheme.primary,
                        ),
                  ),
                ],
                if (dialogError.isNotEmpty) ...[
                  const SizedBox(height: KSize.margin2x),
                  Text(
                    dialogError,
                    style: TextStyle(color: Theme.of(ctx).colorScheme.error),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: dialogBusy ? null : () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            if (!otpSent)
              FilledButton(
                onPressed: dialogBusy ? null : () => sendOtp(setDialog),
                child: dialogBusy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Send OTP'),
              )
            else ...[
              TextButton(
                onPressed: dialogBusy ? null : () => sendOtp(setDialog),
                child: const Text('Resend OTP'),
              ),
              FilledButton(
                onPressed: dialogBusy
                    ? null
                    : () async {
                        final code = otpCtrl.text.trim();
                        if (code.length < 4) {
                          setDialog(() {
                            dialogError = 'Enter the OTP from SMS (4–8 digits).';
                          });
                          return;
                        }
                        setDialog(() {
                          dialogBusy = true;
                          dialogError = '';
                        });
                        final ok = await mgr.completeWithSmsOtp(code);
                        if (ok && ctx.mounted) {
                          verified = true;
                          Navigator.pop(ctx);
                          onAuthenticated?.call();
                        } else {
                          setDialog(() {
                            dialogError = mgr.error;
                            dialogBusy = false;
                          });
                        }
                      },
                child: const Text('Verify OTP'),
              ),
            ],
          ],
        );
      },
    ),
  );

  userCtrl.dispose();
  passCtrl.dispose();
  otpCtrl.dispose();
  return verified;
}
