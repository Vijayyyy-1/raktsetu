import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rakt_sethu/screens/auth.dart';

void main() {
  // Plain MaterialApp: the branded theme fetches Google Fonts over the network, which tests block.
  testWidgets('shows login form', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginScreen()));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Sign in'), findsOneWidget);
  });
}
