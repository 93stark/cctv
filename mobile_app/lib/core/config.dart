/// Build-time configuration. Pass with --dart-define, never hard-code secrets here.
class AppConfig {
  /// e.g. flutter build appbundle --dart-define=API_BASE_URL=https://api.example.com
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
  static const privacyUrl = String.fromEnvironment('PRIVACY_URL', defaultValue: '');
  static const termsUrl = String.fromEnvironment('TERMS_URL', defaultValue: '');
}
