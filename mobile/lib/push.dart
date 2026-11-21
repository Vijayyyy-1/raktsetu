import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'ui.dart';

final messengerKey = GlobalKey<ScaffoldMessengerState>();

/// Firebase starts in the background so it never delays the first frame; push code awaits this.
late final Future<bool> firebaseReady;

/// Set when the donor opens a request notification; the shell switches to Requests and clears it.
/// A flag (not an event) so a tap that cold-starts the app is still seen once the shell exists.
final openRequests = ValueNotifier<bool>(false);

bool _listening = false, _refreshing = false;

/// Registers this phone for blood-request pushes. Donors only; safe to call on every sign-in.
Future<void> registerForPush() async {
  try {
    if (!await firebaseReady) return;
    final fm = FirebaseMessaging.instance;
    final perm = await fm.requestPermission(); // Android 13+ shows the system prompt
    if (perm.authorizationStatus == AuthorizationStatus.denied) return;
    // shortcut: classic FCM registration tokens (deprecated in firebase_messaging 17, still served); move to register()/onRegistered
    // once the backend's firebase-admin send is confirmed to accept installation IDs.
    // ignore: deprecated_member_use
    final token = await fm.getToken();
    if (token != null) await Api.setPushToken(token);
    if (!_refreshing) {
      _refreshing = true;
      // ignore: deprecated_member_use
      fm.onTokenRefresh.listen((t) => Api.setPushToken(t).catchError((_) {}));
    }
  } catch (e) {
    debugPrint('Push registration failed: $e'); // never block the app on push
  }
}


/// Foreground pushes become an in-app banner; taps on system notifications open Requests.
Future<void> listenForPush() async {
  if (_listening) return;
  _listening = true;
  FirebaseMessaging.onMessage.listen((m) {
    final n = m.notification;
    if (n == null) return;
    messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        backgroundColor: brand,
        content: Row(children: [
          const Icon(Icons.bloodtype, color: Colors.white),
          const SizedBox(width: 12),
          Expanded(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(n.title ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
              if (n.body != null) Text(n.body!, style: const TextStyle(color: Colors.white)),
            ]),
          ),
        ]),
        action: SnackBarAction(label: 'VIEW', textColor: Colors.white, onPressed: () => openRequests.value = true),
      ));
  });
  FirebaseMessaging.onMessageOpenedApp.listen((_) => openRequests.value = true);
  if (await FirebaseMessaging.instance.getInitialMessage() != null) openRequests.value = true;
}
