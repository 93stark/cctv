import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Shows a friendly error with a retry button for any AsyncValue-based screen.
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_off, size: 44),
          const SizedBox(height: 12),
          Text(error.toString().replaceFirst('Exception: ', ''), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
        ]),
      ),
    );
  }
}

class AsyncBody<T> extends ConsumerWidget {
  const AsyncBody({super.key, required this.value, required this.onRetry, required this.builder});
  final AsyncValue<T> value;
  final VoidCallback onRetry;
  final Widget Function(T data) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return value.when(
      data: builder,
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorRetry(error: e, onRetry: onRetry),
    );
  }
}

void snack(BuildContext context, String msg) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
}

const siliconSite = 'https://www.siliconcorporation.in';
const siliconAbout = 'https://www.siliconcorporation.in/about';

Future<void> openSiliconSite(BuildContext context, [String url = siliconSite]) async {
  final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) snack(context, 'Could not open the website.');
}

/// "Developed with (red heart) by Silicon Corporation", optionally with the company logo above it.
class BrandFooter extends StatelessWidget {
  const BrandFooter({super.key, this.showLogo = true, this.logoWidth = 100});
  final bool showLogo;
  final double logoWidth;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('Developed ', style: TextStyle(color: muted, fontSize: 13)),
          const Icon(Icons.favorite, color: Color(0xFFE53935), size: 15),
          Text(' by', style: TextStyle(color: muted, fontSize: 13)),
        ]),
        if (showLogo) ...[
          const SizedBox(height: 8),
          Image.asset('assets/silicon_logo.png', width: logoWidth, fit: BoxFit.contain, semanticLabel: 'Silicon Corporation'),
        ] else
          const Padding(padding: EdgeInsets.only(top: 2), child: Text('Silicon Corporation', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
      ]),
    );
  }
}
