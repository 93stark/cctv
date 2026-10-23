import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/format.dart';
import '../providers.dart';
import 'widgets.dart';

class PlansScreen extends ConsumerWidget {
  const PlansScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final member = ref.watch(membershipProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Support plans')),
      body: SafeArea(
        child: AsyncBody<List<dynamic>>(
          value: ref.watch(plansProvider),
          onRetry: () => ref.invalidate(plansProvider),
          builder: (plans) => ListView(padding: const EdgeInsets.all(16), children: [
            const Text('One-time payment. No subscription, no auto-renewal.', style: TextStyle(color: Color(0xFF9FB2CC))),
            const SizedBox(height: 4),
            TextButton.icon(onPressed: () => _showInfo(context), icon: const Icon(Icons.info_outline, size: 18), label: const Text('What do Limited and Lifetime mean? Terms, privacy and refunds')),
            const SizedBox(height: 4),
            for (final p in plans.cast<Map<String, dynamic>>())
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(p['name'] as String, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
                      Text(p['priceDisplay'] as String, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFFFFB703))),
                    ]),
                    const SizedBox(height: 4),
                    Text(p['isLifetime'] == true ? 'One time, no expiry' : 'One time, valid for ${p['durationDays']} days', style: const TextStyle(color: Color(0xFF9FB2CC))),
                    const SizedBox(height: 10),
                    for (final b in (p['benefits'] as List)) Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.check_circle, size: 18, color: Color(0xFF2FB26B)), const SizedBox(width: 8), Expanded(child: Text(b as String))])),
                    if ((p['terms'] as String).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(p['terms'] as String, style: const TextStyle(fontSize: 12, color: Color(0xFF9FB2CC)))),
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: (member != null && (member['isLifetime'] == true || p['isLifetime'] != true)) ? null : () => context.push('/checkout', extra: p),
                      child: Text(member != null && (member['isLifetime'] == true || p['isLifetime'] != true) ? 'Already active' : 'Buy ${p['name']}'),
                    ),
                  ]),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

void _showInfo(BuildContext context) {
  showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      title: const Text('Support plans, terms and refunds'),
      content: const SingleChildScrollView(
        child: Text(
          'Limited Support (₹99): WhatsApp support for 1000 days from the date your payment is approved.\n\n'
          'Lifetime Support (₹999): WhatsApp support with no expiry date, for as long as this support service is offered by Silicon Corporation.\n\n'
          'Both are one-time payments. There is no subscription and no auto-renewal. Support covers questions about the book and CCTV learning; on-site visits and repairs are not included. Replies within 24 working hours (Mon to Sat, 10 AM to 6 PM).\n\n'
          'Privacy: we store your name, mobile number, city, PIN code and category only to run your account and support. You can delete your account anytime from the Account screen.\n\n'
          'Refunds: handled case by case by Silicon Corporation. Contact us on WhatsApp.',
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
    ),
  );
}

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, required this.plan});
  final Map<String, dynamic> plan;
  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutState();
}

class _CheckoutState extends ConsumerState<CheckoutScreen> {
  Map<String, dynamic>? _order;
  String? _error;
  bool _busy = false;
  final _utr = TextEditingController();
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _create();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _utr.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final r = await ref.read(apiProvider).post('/payments/orders', body: {'planCode': widget.plan['code']});
      _order = Map<String, dynamic>.from(r['order'] as Map);
      _startPolling();
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 6), (_) => _refresh());
  }

  /// The server is the only source of truth. The app never marks a payment as successful on its own.
  Future<void> _refresh() async {
    final id = _order?['id'];
    if (id == null) return;
    try {
      final r = await ref.read(apiProvider).get('/payments/orders/$id');
      final o = Map<String, dynamic>.from(r['order'] as Map);
      if (!mounted) return;
      setState(() => _order = o);
      if (o['status'] == 'paid') {
        _poll?.cancel();
        ref.invalidate(membershipProvider);
      } else if (o['status'] != 'pending' && o['status'] != 'awaiting_review') {
        _poll?.cancel();
      }
    } catch (_) {}
  }

  Future<void> _submitUtr() async {
    final v = _utr.text.trim();
    if (v.length < 6) {
      snack(context, 'Enter the transaction / UTR number from your payment app.');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).post('/payments/orders/${_order!['id']}/manual-proof', body: {'utr': v});
      await _refresh();
      if (mounted) snack(context, 'Submitted. We will verify your payment soon.');
    } catch (e) {
      if (mounted) snack(context, e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    return Scaffold(
      appBar: AppBar(title: Text(widget.plan['name'] as String)),
      body: SafeArea(
        child: _error != null
            ? ErrorRetry(error: _error!, onRetry: _create)
            : o == null
                ? const Center(child: CircularProgressIndicator())
                : ListView(padding: const EdgeInsets.all(18), children: _content(o)),
      ),
    );
  }

  List<Widget> _content(Map<String, dynamic> o) {
    final status = o['status'] as String;
    final amount = rupees(o['amountPaise'] as num);
    if (status == 'paid') {
      return [
        const SizedBox(height: 30),
        const Icon(Icons.verified, size: 80, color: Color(0xFF2FB26B)),
        const SizedBox(height: 14),
        const Center(child: Text('Payment verified', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800))),
        const SizedBox(height: 8),
        Center(child: Text('${o['plan']['name']} is now active.')),
        const SizedBox(height: 24),
        FilledButton(onPressed: () => context.go('/membership'), child: const Text('Go to my support')),
      ];
    }
    if (status != 'pending' && status != 'awaiting_review') {
      return [
        const SizedBox(height: 30),
        Center(child: Text('This order is $status.', style: const TextStyle(fontSize: 18))),
        const SizedBox(height: 16),
        FilledButton(onPressed: _create, child: const Text('Start again')),
      ];
    }
    final c = o['checkout'] == null ? <String, dynamic>{} : Map<String, dynamic>.from(o['checkout'] as Map);
    final widgets = <Widget>[
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [Expanded(child: Text(widget.plan['name'] as String, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))), Text(amount, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800))]))),
    ];
    if (c['type'] == 'manual_upi') {
      final qr = c['qrImageUrl'] as String?;
      final upiLink = c['upiLink'] as String?;
      widgets.addAll([
        const SizedBox(height: 8),
        if (upiLink != null) Center(child: Container(color: Colors.white, padding: const EdgeInsets.all(10), child: QrImageView(data: upiLink, size: 230, backgroundColor: Colors.white)))
        else if (qr != null) Center(child: Container(color: Colors.white, padding: const EdgeInsets.all(8), child: CachedNetworkImage(imageUrl: qr, width: 240, height: 240, fit: BoxFit.contain))),
        if (upiLink != null && status == 'pending') ...[
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () async {
              final ok = await launchUrl(Uri.parse(upiLink), mode: LaunchMode.externalApplication).catchError((_) => false);
              if (!ok && mounted) snack(context, 'No UPI app found. Scan the QR from another phone, or pay using the UPI ID ${c['upiId']}.');
            },
            icon: const Icon(Icons.payments),
            label: Text('Pay $amount with PhonePe / GPay / any UPI app'),
          ),
          const SizedBox(height: 6),
          const Text('Paying from another phone? Scan the QR above, then enter the UTR number below.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF9FB2CC))),
        ],
        if (c['payeeName'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Center(child: Text('Pay to: ${c['payeeName']}'))),
        const SizedBox(height: 8),
        for (final i in (c['instructions'] as List? ?? const [])) Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Text('• $i')),
        const SizedBox(height: 6),
        Text('Pay exactly $amount. Put this in the payment note: ${c['paymentNote']}', style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        if (status == 'awaiting_review')
          const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('Waiting for verification. Support will activate automatically once your payment is confirmed. You can close this screen.')))
        else ...[
          TextField(controller: _utr, decoration: const InputDecoration(labelText: 'Transaction / UTR number', helperText: 'Shown in your payment app after paying')),
          const SizedBox(height: 12),
          FilledButton(onPressed: _busy ? null : _submitUtr, child: const Text('I have paid, submit')),
        ],
      ]);
    } else {
      widgets.add(Padding(padding: const EdgeInsets.all(12), child: Text((c['message'] as String?) ?? 'Waiting for payment confirmation from the payment provider.')));
    }
    widgets.addAll([
      const SizedBox(height: 14),
      OutlinedButton(onPressed: _refresh, child: const Text('Check payment status')),
      const SizedBox(height: 8),
      const Text('Your plan activates only after the payment is verified by our server.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF9FB2CC))),
    ]);
    return widgets;
  }
}
