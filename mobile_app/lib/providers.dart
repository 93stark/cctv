import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/api.dart';
import 'core/storage.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

final apiProvider = Provider<Api>((ref) {
  return Api(ref.read(tokenStoreProvider), onSessionExpired: () => ref.read(authProvider.notifier).sessionExpired());
});

enum AuthStatus { unknown, signedOut, signedIn }

class AuthState {
  const AuthState(this.status, [this.user]);
  final AuthStatus status;
  final Map<String, dynamic>? user;
  bool get profileComplete => user?['profileComplete'] == true;
  Map<String, dynamic> get profile => Map<String, dynamic>.from((user?['profile'] as Map?) ?? {});
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState(AuthStatus.unknown);

  Api get _api => ref.read(apiProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);

  /// Called on app start: restore the session if a refresh token exists.
  Future<void> bootstrap() async {
    final t = await _tokens.refresh;
    if (t == null) {
      state = const AuthState(AuthStatus.signedOut);
      return;
    }
    try {
      final r = await _api.get('/me');
      state = AuthState(AuthStatus.signedIn, Map<String, dynamic>.from(r['user'] as Map));
    } on ApiException catch (e) {
      // Offline: keep the user signed in with an empty profile rather than logging them out.
      if (e.code == 'network') {
        state = const AuthState(AuthStatus.signedIn, {'profileComplete': true});
      } else {
        await _tokens.clear();
        state = const AuthState(AuthStatus.signedOut);
      }
    }
  }

  Future<void> requestOtp(String mobile) async {
    await _api.post('/auth/otp/request', body: {'mobile': mobile}, auth: false);
  }

  Future<void> verifyOtp(String mobile, String code) async {
    final r = await _api.post('/auth/otp/verify', body: {'mobile': mobile, 'code': code, 'deviceLabel': 'Android app'}, auth: false);
    await _tokens.save(r['accessToken'] as String, r['refreshToken'] as String);
    state = AuthState(AuthStatus.signedIn, Map<String, dynamic>.from(r['user'] as Map));
  }

  Future<void> saveProfile(Map<String, dynamic> body) async {
    final r = await _api.put('/me', body);
    state = AuthState(AuthStatus.signedIn, Map<String, dynamic>.from(r['user'] as Map));
  }

  Future<void> refreshUser() async {
    final r = await _api.get('/me');
    state = AuthState(AuthStatus.signedIn, Map<String, dynamic>.from(r['user'] as Map));
  }

  Future<void> logout() async {
    final rt = await _tokens.refresh;
    try {
      if (rt != null) await _api.post('/auth/logout', body: {'refreshToken': rt});
    } catch (_) {
      // Signing out locally must always work, even offline.
    }
    await _tokens.clear();
    state = const AuthState(AuthStatus.signedOut);
  }

  Future<void> deleteAccount() async {
    await _api.delete('/me');
    await _tokens.clear();
    state = const AuthState(AuthStatus.signedOut);
  }

  void sessionExpired() {
    state = const AuthState(AuthStatus.signedOut);
  }
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Public remote config, cached for offline use.
final configProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  try {
    final r = await ref.read(apiProvider).get('/config', auth: false);
    final s = Map<String, dynamic>.from(r['settings'] as Map);
    await ConfigCache.save(s);
    return s;
  } catch (_) {
    final cached = await ConfigCache.load();
    if (cached != null) return cached;
    rethrow;
  }
});

final homeProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => ref.read(apiProvider).get('/home'));
final videosProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async => (await ref.read(apiProvider).get('/videos'))['items'] as List);
final resourcesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async => (await ref.read(apiProvider).get('/resources'))['items'] as List);
final plansProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async => (await ref.read(apiProvider).get('/plans', auth: false))['items'] as List);
final quotePackagesProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => ref.read(apiProvider).get('/quotes/packages'));
final membershipProvider = FutureProvider.autoDispose<Map<String, dynamic>?>((ref) async {
  final r = await ref.read(apiProvider).get('/membership');
  return r['membership'] == null ? null : Map<String, dynamic>.from(r['membership'] as Map);
});
final historyProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async => (await ref.read(apiProvider).get('/payments/history'))['items'] as List);
final notificationsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) => ref.read(apiProvider).get('/notifications'));
