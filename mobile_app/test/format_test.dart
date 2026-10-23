import 'package:flutter_test/flutter_test.dart';
import 'package:cctv_secret/core/format.dart';

void main() {
  test('rupees formats whole and fractional amounts', () {
    expect(rupees(9900), '₹99');
    expect(rupees(99900), '₹999');
    expect(rupees(12950), '₹129.50');
  });

  test('mobile normalisation and validation', () {
    expect(toE164India('98765 43210'), '+919876543210');
    expect(isValidIndianMobile('9876543210'), isTrue);
    expect(isValidIndianMobile('+919876543210'), isTrue);
    expect(isValidIndianMobile('1234567890'), isFalse);
    expect(isValidIndianMobile('98765'), isFalse);
  });
}
