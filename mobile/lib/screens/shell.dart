import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../api.dart';
import '../push.dart';
import '../ui.dart';
import 'auth.dart';
import 'donor_home.dart';
import 'drives.dart';
import 'requests.dart';

/// App shell with a floating bottom nav; tabs depend on role (same as web NAV).
class Shell extends StatefulWidget {
  const Shell({super.key, required this.session});
  final Session session;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    if (widget.session.isDonor) registerForPush();
    openRequests.addListener(_openRequests);
    WidgetsBinding.instance.addPostFrameCallback((_) => _openRequests()); // tap that cold-started the app
  }

  @override
  void dispose() {
    openRequests.removeListener(_openRequests);
    super.dispose();
  }

  void _openRequests() {
    if (!openRequests.value || !mounted) return;
    openRequests.value = false;
    setState(() => _tab = widget.session.isDonor ? 1 : 0);
  }

  Future<void> _signOut() async {
    // Stop pushes to this phone before the session goes; ignore failures (e.g. already expired).
    if (widget.session.isDonor) await Api.clearPushToken().catchError((_) {});
    await Api.signOut();
    if (mounted) Navigator.of(context).pushAndRemoveUntil(fade(const LoginScreen()), (_) => false);
  }

  void _profile() {
    final s = widget.session;
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            _Avatar(s, radius: 40),
            const SizedBox(height: 14),
            Text(s.name ?? s.email, style: Theme.of(c).textTheme.headlineSmall, textAlign: TextAlign.center),
            if (s.name != null) Text(s.email, style: TextStyle(color: Theme.of(c).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 10),
            Pill(s.isDonor ? 'Donor' : 'Coordinator', color: brand, icon: s.isDonor ? Icons.favorite : Icons.badge_outlined),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: brand, side: const BorderSide(color: bloodSoft, width: 2)),
                onPressed: () {
                  Navigator.pop(c);
                  _signOut();
                },
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Sign out'),
              ),
            ),
          ].animate(interval: 40.ms).fadeIn().slideY(begin: 0.2)),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    final tabs = [
      if (s.isDonor) (item: (icon: Icons.person_outline_rounded, active: Icons.person_rounded, label: 'Me'), page: const DonorHome()),
      (item: (icon: Icons.bloodtype_outlined, active: Icons.bloodtype, label: 'Requests'), page: RequestsScreen(session: s)),
      (item: (icon: Icons.event_outlined, active: Icons.event_rounded, label: 'Drives'), page: DrivesScreen(session: s)),
    ];
    return Scaffold(
      extendBody: true, // content scrolls behind the floating nav
      appBar: AppBar(
        titleSpacing: 20,
        title: const Row(children: [Drop(size: 26), SizedBox(width: 8), Text('Rakt Sethu')]),
        actions: [
          IconButton(tooltip: 'Profile', onPressed: _profile, icon: _Avatar(s, radius: 18)),
          const SizedBox(width: 12),
        ],
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        transitionBuilder: (child, a) => FadeTransition(
          opacity: a,
          child: SlideTransition(position: Tween(begin: const Offset(0, 0.02), end: Offset.zero).animate(a), child: child),
        ),
        child: KeyedSubtree(key: ValueKey(_tab), child: tabs[_tab].page),
      ),
      bottomNavigationBar: FloatingNav(
        items: [for (final t in tabs) t.item],
        index: _tab,
        onChanged: (i) => setState(() => _tab = i),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar(this.s, {required this.radius});
  final Session s;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
        width: radius * 2,
        height: radius * 2,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(colors: [brand, bloodDeep], begin: Alignment.topLeft, end: Alignment.bottomRight),
        ),
        child: Text((s.name ?? s.email)[0].toUpperCase(), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: radius * 0.85)),
      );
}
