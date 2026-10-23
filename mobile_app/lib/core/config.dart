/// Build-time configuration. Pass with --dart-define, never hard-code secrets here.
class AppConfig {
  static const _env = String.fromEnvironment('API_BASE_URL');
  static const _default = 'https://cctv-api-five.vercel.app';

  /// An empty value or the example.com placeholder falls back to the deployed backend.
  static String get apiBaseUrl {
    final v = _env.trim();
    if (v.isEmpty || v.contains('example.com')) return _default;
    return v.endsWith('/') ? v.substring(0, v.length - 1) : v;
  }

  static const privacyUrl = String.fromEnvironment('PRIVACY_URL', defaultValue: '');
  static const termsUrl = String.fromEnvironment('TERMS_URL', defaultValue: '');
}
