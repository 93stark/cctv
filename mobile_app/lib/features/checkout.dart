import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/format.dart';
import '../providers.dart';
import 'widgets.dart';

class PlansScreen extends ConsumerStatefulWidget {
  const PlansScreen({super.key});
  @override
  ConsumerState<PlansScreen> createState() => _PlansScreenState();
}

class _PlansScreenState extends ConsumerState<PlansScreen> {
  String? _selected;
  bool _agreed = false;
  late final TapGestureRecognizer _termsTap;

  @override
  void initState() {
    super.initState();
    _termsTap = TapGestureRecognizer()..onTap = () => _showInfo(context);
  }

  @override
  void dispose() {
    _termsTap.dispose();
    super.dispose();
  }

  bool _blocked(Map<String, dynamic>? member, Map<String, dynamic> p) => member != null && (member['isLifetime'] == true || p['isLifetime'] != true);

  @override
  Widget build(BuildContext context) {
    final member = ref.watch(membershipProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Support plans')),
      body: SafeArea(
        child: AsyncBody<List<dynamic>>(
          value: ref.watch(plansProvider),
          onRetry: () => ref.invalidate(plansProvider),
          builder: (raw) {
            final plans = raw.cast<Map<String, dynamic>>();
            Map<String, dynamic>? chosen;
            for (final p in plans) {
              if (p['code'] == _selected && !_blocked(member, p)) chosen = p;
            }
            if (chosen == null) {
              for (final p in plans) {
                if (!_blocked(member, p)) {
                  chosen = p;
                  break;
                }
              }
            }
            return Column(children: [
              Expanded(
                child: ListView(padding: const EdgeInsets.all(16), children: [
                  const Text('One-time payment. No subscription, no auto-renewal.', style: TextStyle(color: Color(0xFF9FB2CC))),
                  const SizedBox(height: 14),
                  for (final p in plans)
                    _PlanCard(
                      plan: p,
                      selected: chosen != null && chosen['code'] == p['code'],
                      blocked: _blocked(member, p),
                      onTap: () => setState(() => _selected = p['code'] as String),
                    ),
                ]),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(12, 6, 16, 12),
                decoration: const BoxDecoration(color: Color(0xFF101C2F), border: Border(top: BorderSide(color: Color(0xFF22364F)))),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Row(children: [
                    Checkbox(value: _agreed, onChanged: (v) => setState(() => _agreed = v ?? false)),
                    Expanded(
                      child: Text.rich(TextSpan(style: const TextStyle(fontSize: 13.5), children: [
                        const TextSpan(text: 'I read and agree to the '),
                        TextSpan(text: 'Terms, Privacy & Refund policy', style: const TextStyle(color: Color(0xFF5BB4FF), decoration: TextDecoration.underline), recognizer: _termsTap),
                      ])),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Padding(
                    padding: const EdgeInsets.only(left: 4),
                    child: FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFFB703), foregroundColor: const Color(0xFF1A1200)),
                      onPressed: (chosen != null && _agreed) ? () => context.push('/checkout', extra: chosen) : null,
                      child: Text(chosen == null ? 'Already active' : 'Buy Now  ${chosen['priceDisplay']}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                    ),
                  ),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.selected, required this.blocked, required this.onTap});
  final Map<String, dynamic> plan;
  final bool selected;
  final bool blocked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final lifetime = plan['isLifetime'] == true;
    final days = plan['durationDays'];
    final unit = lifetime ? '/Lifetime' : '/$days days';
    final headline = lifetime ? 'WhatsApp support with no expiry' : 'WhatsApp support for $days days';
    final validity = lifetime
        ? 'Validity: Service is valid for as long as this support service runs'
        : 'Validity: Service is valid for $days days (about ${((days as num) / 365).toStringAsFixed(1)} years)';
    final benefits = (plan['benefits'] as List).cast<String>();
    return Opacity(
      opacity: blocked ? 0.55 : 1,
      child: GestureDetector(
        onTap: blocked ? null : onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? const Color(0xFF1D8CF0) : const Color(0xFF22364F), width: selected ? 2 : 1),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            Container(
              color: const Color(0xFF1B2D47),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(
                  padding: const EdgeInsets.only(top: 6, right: 12),
                  child: Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, color: selected ? const Color(0xFF1D8CF0) : const Color(0xFF9FB2CC)),
                ),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text.rich(TextSpan(children: [
                      TextSpan(text: plan['priceDisplay'] as String, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
                      TextSpan(text: unit, style: const TextStyle(fontSize: 17, color: Color(0xFF9FB2CC))),
                    ])),
                    const SizedBox(height: 2),
                    Text(headline, style: const TextStyle(fontSize: 15, color: Color(0xFF5BB4FF), fontWeight: FontWeight.w600)),
                  ]),
                ),
                if (blocked)
                  const _Badge(text: 'ACTIVE', color: Color(0xFF2FB26B))
                else if (lifetime)
                  const _Badge(text: 'BEST VALUE', color: Color(0xFFFFB703)),
              ]),
            ),
            Container(
              width: double.infinity,
              color: const Color(0xFF14233A),
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(validity, style: const TextStyle(fontSize: 14.5, height: 1.35)),
                const SizedBox(height: 8),
                for (final b in benefits.skip(1))
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.check_circle, size: 16, color: Color(0xFF2FB26B)),
                      const SizedBox(width: 8),
                      Expanded(child: Text(b, style: const TextStyle(fontSize: 13, color: Color(0xFF9FB2CC)))),
                    ]),
                  ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: color.withOpacity(0.18), borderRadius: BorderRadius.circular(6), border: Border.all(color: color)),
        child: Text(text, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: color)),
      );
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
