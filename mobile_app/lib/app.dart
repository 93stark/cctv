import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/theme.dart';
import 'features/account.dart';
import 'features/auth.dart';
import 'features/checkout.dart';
import 'features/home.dart';
import 'features/learn.dart';
import 'features/notifications.dart';
import 'features/profile.dart';
import 'features/splash.dart';
import 'features/support.dart';
import 'providers.dart';

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen<AuthState>(authProvider, (_, __) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final listenable = _AuthListenable(ref);
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: listenable,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final loc = state.matchedLocation;
      if (auth.status == AuthStatus.unknown) return loc == '/splash' ? null : '/splash';
      final publicPage = loc == '/login' || loc.startsWith('/otp');
      if (auth.status == AuthStatus.signedOut) return publicPage ? null : '/login';
      if (!auth.profileComplete) return loc == '/profile-setup' ? null : '/profile-setup';
      if (loc == '/splash' || publicPage || loc == '/profile-setup') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/otp', builder: (_, s) => OtpScreen(mobile: s.extra as String)),
      GoRoute(path: '/profile-setup', builder: (_, __) => const ProfileScreen(setup: true)),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen(setup: false)),
      GoRoute(path: '/', builder: (_, __) => const HomeShell()),
      GoRoute(path: '/videos', builder: (_, __) => const VideosScreen()),
      GoRoute(path: '/resources', builder: (_, __) => const ResourcesScreen()),
      GoRoute(path: '/resource', builder: (_, s) => ResourceDetailScreen(item: s.extra as Map<String, dynamic>)),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/plans', builder: (_, __) => const PlansScreen()),
      GoRoute(path: '/checkout', builder: (_, s) => CheckoutScreen(plan: s.extra as Map<String, dynamic>)),
      GoRoute(path: '/membership', builder: (_, __) => const MembershipScreen()),
      GoRoute(path: '/history', builder: (_, __) => const HistoryScreen()),
      GoRoute(path: '/legal', builder: (_, s) => LegalScreen(kind: s.extra as String)),
    ],
  );
});

class CctvApp extends ConsumerWidget {
  const CctvApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'CCTV Secret & Entrepreneurship',
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      routerConfig: ref.watch(routerProvider),
      debugShowCheckedModeBanner: false,
    );
  }
}
