import 'package:shared_preferences/shared_preferences.dart';

import '../constants/strategy_research_api_keys.dart';
import '../sources/remote/mstock_api_helpers.dart';
import 'mstock_auth_service.dart';

/// Holds MSTOCK_JWT_TOKEN in memory + SharedPreferences; auto-refreshes via TOTP.
class MstockJwtManager {
  MstockJwtManager._();
  static final instance = MstockJwtManager._();

  static const _prefsKey = 'mstock_jwt_token';
  static const _prefsFetchedAt = 'mstock_jwt_fetched_at';
  static const _prefsUsername = 'mstock_saved_username';
  static const _prefsPassword = 'mstock_saved_password';

  final MstockAuthService _auth = MstockAuthService();

  String? _token;
  String? _savedUsername;
  String? _savedPassword;
  String _status = 'pending';
  String _error = '';
  bool _bootstrapping = false;

  String get accessToken => _token ?? StrategyResearchApiKeys.envJwtToken;
  bool get hasToken => accessToken.isNotEmpty;
  bool get hasSessionJwt => hasMstockSessionJwt(
        accessToken,
        StrategyResearchApiKeys.apiKey,
      );
  String get status => _status;
  String get error => _error;
  bool get isAuthenticated => hasSessionJwt && _status == 'ok';
  String get savedUsername => _savedUsername ?? '';
  String get savedPassword => _savedPassword ?? '';
  bool get hasSavedCredentials =>
      savedUsername.isNotEmpty && savedPassword.isNotEmpty;

  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_prefsKey);
    _token ??= StrategyResearchApiKeys.envJwtToken;
    await _loadCredentials(prefs);
    if (_token != null && _token!.isNotEmpty) {
      StrategyResearchApiKeys.setRuntimeJwt(_token);
    }
    _status = hasToken ? 'ok' : 'needs_auth';
  }

  /// Called on app start and when API returns 401.
  Future<bool> bootstrapIfNeeded({bool force = false}) async {
    if (_bootstrapping) return hasToken;
    _bootstrapping = true;
    try {
      if (!force && hasSessionJwt) {
        _status = 'ok';
        _error = '';
        return true;
      }

      final result = await _auth.bootstrapJwt(
        force: force,
        existingToken: force ? null : accessToken,
      );
      await _persist(result.accessToken);
      await _persistCredentialsFromLastLogin();
      _status = 'ok';
      _error = '';
      return true;
    } on MstockAuthException catch (e) {
      _status = 'needs_auth';
      _error = e.hint != null ? '${e.message}\n${e.hint}' : e.message;
      return false;
    } catch (e) {
      _status = 'error';
      _error = e.toString();
      return false;
    } finally {
      _bootstrapping = false;
    }
  }

  /// TOTP auto-login (uses MSTOCK_TOTP_SECRET from .env).
  Future<bool> refreshFromTotp() => bootstrapIfNeeded(force: true);

  String? _lastLoginUser;
  String? _lastLoginPass;

  /// Send SMS OTP to registered mobile.
  Future<String> requestSmsOtp({String? username, String? password}) async {
    final user = (username ?? savedUsername).trim();
    final pass = (password ?? savedPassword).trim();
    final resolvedUser =
        user.isNotEmpty ? user : StrategyResearchApiKeys.username.trim();
    final resolvedPass =
        pass.isNotEmpty ? pass : StrategyResearchApiKeys.password.trim();
    final message = await _auth.connectLogin(
      username: resolvedUser,
      password: resolvedPass,
    );
    _lastLoginUser = resolvedUser;
    _lastLoginPass = resolvedPass;
    _status = 'awaiting_sms_otp';
    _error = '';
    return message;
  }

  /// Resend SMS OTP using the last username/password.
  Future<String> resendSmsOtp() async {
    if ((_lastLoginUser ?? '').isEmpty || (_lastLoginPass ?? '').isEmpty) {
      throw MstockAuthException(
        'No saved login — enter username and password first.',
      );
    }
    return requestSmsOtp(username: _lastLoginUser, password: _lastLoginPass);
  }

  /// Complete login with SMS OTP from user.
  Future<bool> completeWithSmsOtp(String smsOtp) async {
    _bootstrapping = true;
    try {
      final token = await _auth.generateSession(smsOtp);
      await _persist(token);
      await _persistCredentialsFromLastLogin();
      _status = 'ok';
      _error = '';
      return true;
    } on MstockAuthException catch (e) {
      _status = 'awaiting_sms_otp';
      _error = e.hint != null ? '${e.message}\n${e.hint}' : e.message;
      return false;
    } finally {
      _bootstrapping = false;
    }
  }

  Future<void> clear() async {
    _token = null;
    StrategyResearchApiKeys.setRuntimeJwt(null);
    _status = 'needs_auth';
    _error = '';
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefsKey);
    await prefs.remove(_prefsFetchedAt);
    // Keep saved username/password so the next sign-in is one tap.
  }

  /// Clears expired/invalid JWT after Type B 401 — keeps saved SMS credentials.
  Future<void> invalidateOnUnauthorized() async {
    await clear();
    _error = StrategyResearchApiKeys.totpSecret.isEmpty
        ? 'Session expired — sign in with SMS OTP (TOTP is not enabled on your account).'
        : 'Session expired — sign in again (JWT valid until midnight IST).';
    _status = 'needs_auth';
  }

  /// Stores client ID and password on device after a successful login.
  Future<void> saveCredentials(String username, String password) async {
    final user = username.trim();
    final pass = password.trim();
    if (user.isEmpty || pass.isEmpty) return;
    _savedUsername = user;
    _savedPassword = pass;
    _lastLoginUser = user;
    _lastLoginPass = pass;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsUsername, user);
    await prefs.setString(_prefsPassword, pass);
  }

  Future<void> _loadCredentials(SharedPreferences prefs) async {
    _savedUsername = prefs.getString(_prefsUsername);
    _savedPassword = prefs.getString(_prefsPassword);
    if ((_savedUsername ?? '').isNotEmpty) {
      _lastLoginUser = _savedUsername;
    }
    if ((_savedPassword ?? '').isNotEmpty) {
      _lastLoginPass = _savedPassword;
    }
  }

  Future<void> _persistCredentialsFromLastLogin() async {
    final user = (_lastLoginUser ?? savedUsername).trim();
    final pass = (_lastLoginPass ?? savedPassword).trim();
    if (user.isEmpty || pass.isEmpty) {
      final envUser = StrategyResearchApiKeys.username.trim();
      final envPass = StrategyResearchApiKeys.password.trim();
      if (envUser.isNotEmpty && envPass.isNotEmpty) {
        await saveCredentials(envUser, envPass);
      }
      return;
    }
    await saveCredentials(user, pass);
  }

  Future<void> _persist(String token) async {
    _token = token;
    StrategyResearchApiKeys.setRuntimeJwt(token);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, token);
    await prefs.setInt(_prefsFetchedAt, DateTime.now().millisecondsSinceEpoch);
  }
}
