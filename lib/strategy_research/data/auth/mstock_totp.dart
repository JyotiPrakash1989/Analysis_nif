import 'package:otp/otp.dart';

/// TOTP helpers — mirrors stat_react/server/mstockTotp.mjs.
class MstockTotp {
  MstockTotp._();

  static String normalizeSecret(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return '';
    if (s.toLowerCase().startsWith('otpauth://')) {
      try {
        final uri = Uri.parse(s);
        final secret = uri.queryParameters['secret'];
        if (secret != null && secret.isNotEmpty) {
          return secret.replaceAll(RegExp(r'\s'), '').toUpperCase();
        }
      } catch (_) {}
    }
    return s.replaceAll(RegExp(r'\s'), '').replaceAll('-', '').toUpperCase();
  }

  /// 6-digit TOTP for mStock verifytotp.
  static String generateCode(String secretRaw) {
    final secret = normalizeSecret(secretRaw);
    if (secret.isEmpty) {
      throw StateError('MSTOCK_TOTP_SECRET is empty');
    }
    return OTP.generateTOTPCodeString(
      secret,
      DateTime.now().millisecondsSinceEpoch,
      length: 6,
      interval: 30,
      algorithm: Algorithm.SHA1,
      isGoogle: true,
    );
  }
}
