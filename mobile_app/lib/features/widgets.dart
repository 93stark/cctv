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

/// "Developed with love by Silicon Corporation" footer with a tappable website link.
class BrandFooter extends StatelessWidget {
  const BrandFooter({super.key});
  static const _site = 'https://siliconcorporation.in';

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('Developed with ', style: TextStyle(color: muted, fontSize: 13)),
          const Icon(Icons.favorite, color: Color(0xFFE53935), size: 15),
          Text(' by ', style: TextStyle(color: muted, fontSize: 13)),
          const Text('Silicon Corporation', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 4),
        InkWell(
          borderRadius: BorderRadius.circular(6),
          onTap: () async {
            final ok = await launchUrl(Uri.parse(_site), mode: LaunchMode.externalApplication);
            if (!ok && context.mounted) snack(context, 'Could not open the website.');
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Text.rich(TextSpan(style: TextStyle(color: muted, fontSize: 12.5), children: [
              const TextSpan(text: 'Official website: '),
              TextSpan(text: 'siliconcorporation.in', style: TextStyle(color: Theme.of(context).colorScheme.primary, decoration: TextDecoration.underline)),
            ])),
          ),
        ),
      ]),
    );
  }
}
