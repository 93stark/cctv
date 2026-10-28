import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/format.dart';
import '../providers.dart';
import 'widgets.dart';

class SupportTab extends ConsumerWidget {
  const SupportTab({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncBody<Map<String, dynamic>?>(
      value: ref.watch(membershipProvider),
      onRetry: () => ref.invalidate(membershipProvider),
      builder: (m) => m == null
          ? Column(children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async => ref.refresh(membershipProvider.future),
                  child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 8), children: [
                    const _SupportHero(),
                    const SizedBox(height: 22),
                    const Text('Support advantages', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 12),
                    for (final a in _advantages) _AdvantageCard(item: a),
                    const SizedBox(height: 4),
                    OutlinedButton(onPressed: () => context.push('/history'), child: const Text('Payment history')),
                  ]),
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                decoration: const BoxDecoration(color: Color(0xFF101C2F), border: Border(top: BorderSide(color: Color(0xFF22364F)))),
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFFB703), foregroundColor: const Color(0xFF1A1200)),
                  onPressed: () => context.push('/plans'),
                  child: const Text('Get Support Now', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                ),
              ),
            ])
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(membershipProvider.future),
              child: ListView(padding: const EdgeInsets.all(16), children: [
                const Text('Support', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                MembershipCard(membership: m),
                const SizedBox(height: 10),
                OutlinedButton(onPressed: () => context.push('/history'), child: const Text('Payment history')),
              ]),
            ),
    );
  }
}

class _Advantage {
  const _Advantage(this.icon, this.title, this.text);
  final IconData icon;
  final String title;
  final String text;
}

const _advantages = [
  _Advantage(Icons.chat, 'Direct WhatsApp support', 'Tap once and chat with our team. Your name, plan and reference are filled in for you.'),
  _Advantage(Icons.schedule, 'Replies within 24 working hours', 'Monday to Saturday, 10 AM to 6 PM. Ask about the book and CCTV learning.'),
  _Advantage(Icons.school, 'Learn and start earning', 'Help with choosing cameras, installation, troubleshooting and starting your own CCTV business.'),
  _Advantage(Icons.payments, 'One-time payment', 'Pay once. No subscription and no auto-renewal. Choose 1000 days or Lifetime.'),
  _Advantage(Icons.verified_user, 'Safe and verified', 'Pay with any UPI app. Your plan activates after our team verifies the payment.'),
];

class _SupportHero extends StatelessWidget {
  const _SupportHero();
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 190,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF1D8CF0), Color(0xFF0B3A75)]),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        Positioned(right: -18, top: -14, child: Icon(Icons.support_agent, size: 150, color: Colors.white.withOpacity(0.10))),
        Positioned(left: -24, bottom: -30, child: Icon(Icons.videocam, size: 120, color: Colors.white.withOpacity(0.07))),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Align(
            alignment: Alignment.bottomLeft,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.16), borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.white24)),
              child: const Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('CCTV Expert Support', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                SizedBox(height: 6),
                Text('Get your CCTV doubts solved directly on WhatsApp. One-time plan, no monthly charges.', style: TextStyle(fontSize: 14, color: Colors.white, height: 1.35)),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _AdvantageCard extends StatelessWidget {
  const _AdvantageCard({required this.item});
  final _Advantage item;
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFF14233A), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFF22364F))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 46, height: 46,
          decoration: BoxDecoration(color: const Color(0xFF1D8CF0).withOpacity(0.18), shape: BoxShape.circle),
          child: Icon(item.icon, color: const Color(0xFF5BB4FF)),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(item.text, style: const TextStyle(fontSize: 13.5, color: Color(0xFF9FB2CC), height: 1.35)),
          ]),
        ),
      ]),
    );
  }
}

class MembershipCard extends ConsumerStatefulWidget {
  const MembershipCard({super.key, required this.membership});
  final Map<String, dynamic> membership;
  @override
  ConsumerState<MembershipCard> createState() => _MembershipCardState();
}

class _MembershipCardState extends ConsumerState<MembershipCard> {
  bool _busy = false;

  Future<void> _whatsapp() async {
    setState(() => _busy = true);
    try {
      final r = await ref.read(apiProvider).post('/support/whatsapp-link');
      final ok = await launchUrl(Uri.parse(r['url'] as String), mode: LaunchMode.externalApplication);
      if (!ok && mounted) snack(context, 'WhatsApp could not be opened.');
    } catch (e) {
      if (mounted) snack(context, e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.membership;
    final lifetime = m['isLifetime'] == true;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Icon(Icons.verified, color: Color(0xFF2FB26B)), const SizedBox(width: 8), Expanded(child: Text(m['planName'] as String, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)))]),
          const SizedBox(height: 8),
          Text('Reference: ${m['reference']}'),
          Text('Started: ${dateOnly(m['startsAt'])}'),
          Text(lifetime ? 'Valid: Lifetime' : 'Valid until: ${dateOnly(m['endsAt'])}'),
          const SizedBox(height: 14),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF25D366), foregroundColor: const Color(0xFF052E16)),
            onPressed: _busy ? null : _whatsapp,
            icon: const Icon(Icons.chat),
            label: const Text('Chat with support on WhatsApp'),
          ),
        ]),
      ),
    );
  }
}

class MembershipScreen extends ConsumerWidget {
  const MembershipScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('My support')),
      body: SafeArea(
        child: AsyncBody<Map<String, dynamic>?>(
          value: ref.watch(membershipProvider),
          onRetry: () => ref.invalidate(membershipProvider),
          builder: (m) => ListView(padding: const EdgeInsets.all(16), children: [
            if (m == null) const Text('No active support plan.') else MembershipCard(membership: m),
          ]),
        ),
      ),
    );
  }
}

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  static (String, Color) _status(String s) {
    switch (s) {
      case 'paid':
        return ('Paid', const Color(0xFF2FB26B));
      case 'awaiting_review':
        return ('Under review', const Color(0xFFFFB703));
      case 'pending':
        return ('Payment pending', const Color(0xFF9FB2CC));
      case 'refunded':
        return ('Refunded', const Color(0xFF5BB4FF));
      case 'failed':
        return ('Failed', const Color(0xFFE5484D));
      case 'expired':
        return ('Expired', const Color(0xFF9FB2CC));
      case 'cancelled':
        return ('Cancelled', const Color(0xFF9FB2CC));
      default:
        return (s.replaceAll('_', ' '), const Color(0xFF9FB2CC));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment history')),
      body: SafeArea(
        child: AsyncBody<List<dynamic>>(
          value: ref.watch(historyProvider),
          onRetry: () => ref.invalidate(historyProvider),
          builder: (items) => items.isEmpty
              ? const Center(child: Text('No payments yet.'))
              : RefreshIndicator(
                  onRefresh: () async => ref.refresh(historyProvider.future),
                  child: ListView(padding: const EdgeInsets.all(14), children: [
                    for (final h in items.cast<Map<String, dynamic>>()) _historyCard(h),
                  ]),
                ),
        ),
      ),
    );
  }

  Widget _historyCard(Map<String, dynamic> h) {
    final (label, color) = _status((h['status'] ?? '').toString());
    final txn = h['transactionRef'] as String?;
    final memRef = h['membershipReference'] as String?;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: const Color(0xFF14233A), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFF22364F))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text((h['plan'] ?? 'Support plan').toString(), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
          Text(rupees(h['amountPaise'] as num), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        ]),
        const SizedBox(height: 6),
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: color.withOpacity(0.16), borderRadius: BorderRadius.circular(6), border: Border.all(color: color)),
            child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
          ),
          const SizedBox(width: 10),
          Text(dateOnly(h['date']), style: const TextStyle(fontSize: 13, color: Color(0xFF9FB2CC))),
        ]),
        const SizedBox(height: 8),
        Text('Order: ${h['orderRef']}', style: const TextStyle(fontSize: 12.5, color: Color(0xFF9FB2CC))),
        if (txn != null && txn.isNotEmpty) Text('UTR / Txn: $txn', style: const TextStyle(fontSize: 12.5, color: Color(0xFF9FB2CC))),
        if (memRef != null) Text('Support reference: $memRef', style: const TextStyle(fontSize: 12.5, color: Color(0xFF9FB2CC))),
      ]),
    );
  }
}
