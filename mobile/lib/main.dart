import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'push.dart';
import 'screens/auth.dart';
import 'screens/shell.dart';
import 'ui.dart';

final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Reads android/app/google-services.json; not awaited so the first frame isn't held up. The app still runs if Firebase can't start.
  firebaseReady = Firebase.initializeApp().then((_) {
    listenForPush();
    return true;
  }).catchError((Object e) {
    debugPrint('Firebase unavailable: $e');
    return false;
  });
  // Expired/revoked token: drop back to login from anywhere.
  Api.onUnauthorized = () => navigatorKey.currentState?.pushAndRemoveUntil(fade(const LoginScreen()), (_) => false);
  runApp(const RaktSethuApp());
}

class RaktSethuApp extends StatelessWidget {
  const RaktSethuApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Rakt Sethu',
        navigatorKey: navigatorKey,
        scaffoldMessengerKey: messengerKey,
        debugShowCheckedModeBanner: false,
        theme: appTheme(),
        home: const SplashGate(),
      );
}

/// Restores a saved session, otherwise shows login.
class SplashGate extends StatefulWidget {
  const SplashGate({super.key});

  @override
  State<SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<SplashGate> {
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    Session? s;
    try {
      s = await Api.restore();
    } catch (_) {} // storage unavailable: fall through to login
    if (!mounted) return;
    Navigator.of(context).pushReplacement(fade(s == null ? const LoginScreen() : Shell(session: s)));
  }

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Drop(size: 72)));
}
