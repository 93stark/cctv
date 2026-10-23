import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashState();
}

class _SplashState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      // Show the splash for at least a moment so the message can be read.
      await Future.wait([ref.read(authProvider.notifier).bootstrap(), Future<void>.delayed(const Duration(milliseconds: 1600))]);
    });
  }

  @override
  Widget build(BuildContext context) {
    final cfg = ref.watch(configProvider).valueOrNull;
    final en = (cfg?['splash_text_en'] as String?) ?? 'Learn CCTV, build your skills and start your own business!';
    final hi = (cfg?['splash_text_hi'] as String?) ?? 'CCTV सीखें, हुनर बढ़ाएँ और अपना बिज़नेस शुरू करके कमाएँ!';
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.videocam, size: 84, color: Color(0xFF5BB4FF)),
            const SizedBox(height: 18),
            const Text('CCTV Secret &\nEntrepreneurship', textAlign: TextAlign.center, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, height: 1.15)),
            const SizedBox(height: 26),
            Text(hi, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            Text(en, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF9FB2CC))),
            const SizedBox(height: 32),
            const CircularProgressIndicator(),
          ]),
        ),
      ),
    );
  }
}
