import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/format.dart';
import '../providers.dart';
import 'widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginState();
}

class _LoginState extends ConsumerState<LoginScreen> {
  final _mobile = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _send() async {
    if (!isValidIndianMobile(_mobile.text)) {
      setState(() => _error = 'Enter a valid 10-digit mobile number');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final m = toE164India(_mobile.text);
    try {
      await ref.read(authProvider.notifier).requestOtp(m);
      if (mounted) context.push('/otp', extra: m);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Expanded(child: _form(context)),
          // Pinned to the bottom like a footer. It rides just above the keyboard, so it is always visible.
          const BrandFooter(padding: EdgeInsets.fromLTRB(0, 4, 0, 6)),
        ]),
      ),
    );
  }

  Widget _form(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(24), children: [
          const SizedBox(height: 40),
          const Icon(Icons.videocam, size: 56, color: Color(0xFF5BB4FF)),
          const SizedBox(height: 16),
          const Text('Welcome', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Enter your mobile number. We will send a verification code by SMS.', style: TextStyle(color: Color(0xFF9FB2CC))),
          const SizedBox(height: 28),
          TextField(
            controller: _mobile,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumberNational],
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')), LengthLimitingTextInputFormatter(16)],
            decoration: InputDecoration(labelText: 'Mobile number', prefixText: '+91  ', errorText: _error),
            onSubmitted: (_) => _send(),
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _send, child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Send code')),
          const SizedBox(height: 18),
          const Text('By continuing you agree to the Terms and Privacy Policy.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF9FB2CC))),
        ]);
  }
}

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.mobile});
  final String mobile;
  @override
  ConsumerState<OtpScreen> createState() => _OtpState();
}

class _OtpState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;
  int _cooldown = 60;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _cooldown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _cooldown = _cooldown > 0 ? _cooldown - 1 : 0);
      if (_cooldown == 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_code.text.length < 4) {
      setState(() => _error = 'Enter the verification code');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).verifyOtp(widget.mobile, _code.text);
      // The router redirects automatically once the auth state changes.
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    try {
      await ref.read(authProvider.notifier).requestOtp(widget.mobile);
      _startTimer();
      if (mounted) snack(context, 'A new code was sent.');
    } catch (e) {
      if (mounted) snack(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const Text('Verify your number', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Enter the code sent to ${widget.mobile} by SMS.', style: const TextStyle(color: Color(0xFF9FB2CC))),
          const SizedBox(height: 24),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            style: const TextStyle(fontSize: 26, letterSpacing: 8),
            textAlign: TextAlign.center,
            decoration: InputDecoration(errorText: _error),
            onChanged: (v) {
              if (v.length == 6) _verify();
            },
          ),
          const SizedBox(height: 18),
          FilledButton(onPressed: _busy ? null : _verify, child: _busy ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Verify')),
          const SizedBox(height: 12),
          Center(child: TextButton(onPressed: _cooldown == 0 ? _resend : null, child: Text(_cooldown == 0 ? 'Resend code' : 'Resend in ${_cooldown}s'))),
        ]),
      ),
    );
  }
}
