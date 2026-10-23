import 'package:intl/intl.dart';

String rupees(num paise) {
  final r = paise / 100;
  return r == r.roundToDouble() ? '₹${r.toInt()}' : '₹${r.toStringAsFixed(2)}';
}

String dateOnly(dynamic iso) {
  if (iso == null) return '';
  final d = DateTime.tryParse(iso.toString());
  if (d == null) return '';
  return DateFormat('d MMM y').format(d.toLocal());
}

/// Converts what the user typed into the +91 format the server expects.
String toE164India(String input) {
  final digits = input.replaceAll(RegExp(r'[^0-9+]'), '');
  if (digits.startsWith('+')) return digits;
  if (digits.length == 10) return '+91$digits';
  if (digits.length == 12 && digits.startsWith('91')) return '+$digits';
  return digits;
}

bool isValidIndianMobile(String input) => RegExp(r'^\+91[6-9][0-9]{9}$').hasMatch(toE164India(input));
