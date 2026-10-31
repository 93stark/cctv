import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../providers.dart';
import 'home.dart';
import 'widgets.dart';

class AccountTab extends ConsumerWidget {
  const AccountTab({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final cfg = ref.watch(configProvider).valueOrNull ?? const <String, dynamic>{};
    final p = auth.profile;
    final phone = cfg['office_phone'] as String?;
    final email = cfg['support_email'] as String?;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Row(children: [
        CircleAvatar(radius: 32, backgroundImage: (p['photoUrl'] as String?) != null ? NetworkImage(p['photoUrl'] as String) : null, child: (p['photoUrl'] as String?) == null ? const Icon(Icons.person, size: 32) : null),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text((p['fullName'] as String?) ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          Text((auth.user?['mobile'] as String?) ?? '', style: const TextStyle(color: Color(0xFF9FB2CC))),
        ])),
      ]),
      const SizedBox(height: 14),
      ListTile(leading: const Icon(Icons.edit), title: const Text('Edit profile'), onTap: () => context.push('/profile')),
      ListTile(leading: const Icon(Icons.receipt_long), title: const Text('Payment history'), onTap: () => context.push('/history')),
      ListTile(leading: const Icon(Icons.notifications_none), title: const Text('Notifications'), onTap: () => context.push('/notifications')),
      if (phone != null) ListTile(leading: const Icon(Icons.call), title: Text('Call $phone'), onTap: () => openUrl(context, 'tel:$phone')),
      if (email != null) ListTile(leading: const Icon(Icons.email_outlined), title: Text(email), onTap: () => openUrl(context, 'mailto:$email')),
      ListTile(
        leading: const Icon(Icons.share_outlined),
        title: const Text('Refer'),
        subtitle: const Text('Share this app with friends'),
        onTap: () async {
          // Always use the latest admin-set link.
          Map<String, dynamic> fresh = cfg;
          try {
            fresh = await ref.refresh(configProvider.future);
          } catch (_) {}
          if (context.mounted) await _referApp(context, fresh);
        },
      ),
      ListTile(leading: const Icon(Icons.info_outline), title: const Text('About us'), onTap: () => context.push('/about')),
      ListTile(leading: const Icon(Icons.privacy_tip_outlined), title: const Text('Privacy policy'), onTap: () => context.push('/legal', extra: 'privacy')),
      ListTile(leading: const Icon(Icons.description_outlined), title: const Text('Terms and support policy'), onTap: () => context.push('/legal', extra: 'terms')),
      const Divider(),
      ListTile(leading: const Icon(Icons.logout), title: const Text('Log out'), onTap: () => ref.read(authProvider.notifier).logout()),
      ListTile(
        leading: const Icon(Icons.delete_forever, color: Color(0xFFEF5350)),
        title: const Text('Delete my account', style: TextStyle(color: Color(0xFFEF5350))),
        onTap: () async {
          final yes = await showDialog<bool>(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Delete account?'),
              content: const Text('Your profile and personal details will be removed and you will be logged out. Payment records are kept as required by law. Active support plans cannot be recovered.'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete', style: TextStyle(color: Color(0xFFEF5350)))),
              ],
            ),
          );
          if (yes == true) {
            try {
              await ref.read(authProvider.notifier).deleteAccount();
            } catch (e) {
              if (context.mounted) snack(context, e.toString());
            }
          }
        },
      ),
    ]);
  }
}

class LegalScreen extends ConsumerWidget {
  const LegalScreen({super.key, required this.kind});
  final String kind;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cfg = ref.watch(configProvider);
    final isPrivacy = kind == 'privacy';
    return Scaffold(
      appBar: AppBar(title: Text(isPrivacy ? 'Privacy policy' : 'Terms and support policy')),
      body: SafeArea(
        child: AsyncBody<Map<String, dynamic>>(
          value: cfg,
          onRetry: () => ref.invalidate(configProvider),
          builder: (c) => SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: SelectableText(
              isPrivacy ? '${c['privacy_policy_text']}' : '${c['terms_text']}\n\nSupport policy\n${c['support_policy']}',
              style: const TextStyle(fontSize: 15, height: 1.5),
            ),
          ),
        ),
      ),
    );
  }
}

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('About us')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const SizedBox(height: 16),
          Center(child: Image.asset('assets/silicon_logo.png', width: 160, fit: BoxFit.contain, semanticLabel: 'Silicon Corporation')),
          const SizedBox(height: 28),
          const Text('Silicon Corporation', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Technology End-Point', textAlign: TextAlign.center, style: TextStyle(fontSize: 16, color: scheme.primary, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
          const SizedBox(height: 10),
          Text('IT & IoT products and services', textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 32),
          FilledButton.icon(
            onPressed: () => openSiliconSite(context, siliconAbout),
            icon: const Icon(Icons.language),
            label: const Text('Official website'),
          ),
          const SizedBox(height: 10),
          Center(child: Text('siliconcorporation.in', style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13))),
          const SizedBox(height: 40),
          const BrandFooter(showLogo: false),
        ]),
      ),
    );
  }
}


/// Shares the Play Store link when the admin has set one, otherwise the
/// installed APK itself (Android).
Future<void> _referApp(BuildContext context, Map<String, dynamic> cfg) async {
  final link = (cfg['app_share_link'] as String?)?.trim();
  final name = (cfg['company_name'] as String?) ?? 'Silicon Corporation';
  try {
    if (link != null && link.isNotEmpty) {
      await Share.share(
        'CCTV Secret & Entrepreneurship app by $name\n\nDownload & install:\n$link\n\n'
        '(If asked, allow "Install from this source" to finish installing.)',
        subject: 'CCTV Secret & Entrepreneurship app',
      );
      return;
    }
    if (kIsWeb || !Platform.isAndroid) {
      snack(context, 'Sharing is available on Android.');
      return;
    }
    String? apk;
    for (final line in await File('/proc/self/maps').readAsLines()) {
      final i = line.indexOf('/');
      if (i >= 0) {
        final path = line.substring(i).trim();
        if (path.endsWith('base.apk')) {
          apk = path;
          break;
        }
      }
    }
    if (apk == null) {
      if (context.mounted) snack(context, 'Could not prepare the app file. Please try again.');
      return;
    }
    final dir = await getTemporaryDirectory();
    final out = await File(apk).copy('${dir.path}/CCTV-Secret.apk');
    await Share.shareXFiles(
      [XFile(out.path, mimeType: 'application/vnd.android.package-archive', name: 'CCTV-Secret.apk')],
      text: 'CCTV Secret & Entrepreneurship app',
    );
  } catch (_) {
    if (context.mounted) snack(context, 'Could not share right now.');
  }
}
