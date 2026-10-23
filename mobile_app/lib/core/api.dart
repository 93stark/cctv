import 'dart:async';
import 'package:dio/dio.dart';
import 'config.dart';
import 'storage.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.code, this.status});
  final String message;
  final String? code;
  final int? status;
  @override
  String toString() => message;
}

/// REST client. Adds the access token, refreshes it once on 401 and retries.
class Api {
  Api(this.tokens, {this.onSessionExpired}) {
    _dio = Dio(BaseOptions(
      baseUrl: '${AppConfig.apiBaseUrl}/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 25),
      contentType: 'application/json',
    ));
    _refreshDio = Dio(BaseOptions(
      baseUrl: '${AppConfig.apiBaseUrl}/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 25),
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (o, h) async {
        final t = await tokens.access;
        if (t != null && o.extra['noAuth'] != true) o.headers['Authorization'] = 'Bearer $t';
        h.next(o);
      },
      onError: (e, h) async {
        final req = e.requestOptions;
        if (e.response?.statusCode == 401 && req.extra['noAuth'] != true && req.extra['retried'] != true) {
          final ok = await _refresh();
          if (ok) {
            req.extra['retried'] = true;
            final t = await tokens.access;
            req.headers['Authorization'] = 'Bearer $t';
            try {
              h.resolve(await _dio.fetch<dynamic>(req));
              return;
            } catch (e2) {
              if (e2 is DioException) {
                h.next(e2);
                return;
              }
            }
          }
        }
        h.next(e);
      },
    ));
  }

  final TokenStore tokens;
  final void Function()? onSessionExpired;
  late final Dio _dio;
  late final Dio _refreshDio;
  Completer<bool>? _refreshing;

  Future<bool> _refresh() async {
    if (_refreshing != null) return _refreshing!.future;
    final c = _refreshing = Completer<bool>();
    try {
      final rt = await tokens.refresh;
      if (rt == null) {
        c.complete(false);
      } else {
        final r = await _refreshDio.post<dynamic>('/auth/refresh', data: {'refreshToken': rt});
        final d = Map<String, dynamic>.from(r.data as Map);
        await tokens.save(d['accessToken'] as String, d['refreshToken'] as String);
        c.complete(true);
      }
    } on DioException catch (e) {
      // Only a definite rejection ends the session; a network error keeps the user signed in.
      final s = e.response?.statusCode;
      if (s == 401 || s == 400) {
        await tokens.clear();
        onSessionExpired?.call();
      }
      c.complete(false);
    } catch (_) {
      c.complete(false);
    } finally {
      _refreshing = null;
    }
    return c.future;
  }

  Future<Map<String, dynamic>> _wrap(Future<Response<dynamic>> Function() f) async {
    try {
      final r = await f();
      final d = r.data;
      return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['error'] is Map) {
        final err = data['error'] as Map;
        throw ApiException(err['message']?.toString() ?? 'Something went wrong.', code: err['code']?.toString(), status: e.response?.statusCode);
      }
      if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout) {
        throw ApiException('No internet connection. Please check your network and try again.', code: 'network');
      }
      throw ApiException('Something went wrong. Please try again.', status: e.response?.statusCode);
    }
  }

  Future<Map<String, dynamic>> get(String path, {bool auth = true}) =>
      _wrap(() => _dio.get<dynamic>(path, options: Options(extra: {'noAuth': !auth})));
  Future<Map<String, dynamic>> post(String path, {Object? body, bool auth = true}) =>
      _wrap(() => _dio.post<dynamic>(path, data: body, options: Options(extra: {'noAuth': !auth})));
  Future<Map<String, dynamic>> put(String path, Object body) => _wrap(() => _dio.put<dynamic>(path, data: body));
  Future<Map<String, dynamic>> delete(String path) => _wrap(() => _dio.delete<dynamic>(path));

  Future<Map<String, dynamic>> uploadPhoto(String filePath) async {
    final form = FormData.fromMap({'file': await MultipartFile.fromFile(filePath)});
    return _wrap(() => _dio.post<dynamic>('/me/photo', data: form, options: Options(contentType: 'multipart/form-data')));
  }
}
