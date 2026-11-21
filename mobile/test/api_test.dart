import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:rakt_sethu/api.dart';

String jwt(Map<String, dynamic> payload) => 'h.${base64Url.encode(utf8.encode(jsonEncode(payload))).replaceAll('=', '')}.s';

void main() {
  test('jwtExpiry reads exp from an unpadded payload', () => expect(jwtExpiry(jwt({'sub': '2', 'exp': 1800000000})), 1800000000));
  test('jwtExpiry is 0 for garbage, so restore sends the user to login', () {
    expect(jwtExpiry('not-a-jwt'), 0);
    expect(jwtExpiry(jwt({'sub': '2'})), 0);
  });
}
