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
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(membershipProvider.future),
      child: AsyncBody<Map<String, dynamic>?>(
        value: ref.watch(membershipProvider),
        onRetry: () => ref.invalidate(membershipProvider),
        builder: (m) => ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Support', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          if (m == null) ...[
            const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Get direct WhatsApp support for your CCTV questions with a one-time Support plan. No subscription.'))),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => context.push('/plans'), child: const Text('See support plans')),
          ] else
            MembershipCard(membership: m),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () => context.push('/history'), child: const Text('Payment history')),
        ]),
      ),
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
              : ListView(children: [
                  for (final h in items.cast<Map<String, dynamic>>())
                    ListTile(
                      title: Text('${h['planName']}  ${rupees(h['amountPaise'] as num)}'),
                      subtitle: Text('${dateOnly(h['createdAt'])} · ${h['orderRef']}${h['txnRef'] != null ? '\nTxn: ${h['txnRef']}' : ''}'),
                      isThreeLine: h['txnRef'] != null,
                      trailing: Text((h['txnStatus'] == 'refunded' ? 'refunded' : h['status']).toString().replaceAll('_', ' ')),
                    ),
                ]),
        ),
      ),
    );
  }
}
