import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../api.dart';
import '../ui.dart';
import 'requests.dart';

class _Data {
  _Data(this.me, this.elig, this.history, this.requests, this.responses);
  Map<String, dynamic> me, elig;
  List<dynamic> history;
  List<BloodRequest> requests;
  Map<int, String> responses;
}

Future<_Data> _load() async {
  final r = await Future.wait([Api.me(), Api.eligibility(), Api.donations(), Api.requests(), Api.myResponses()]);
  return _Data(r[0] as Map<String, dynamic>, r[1] as Map<String, dynamic>, r[2] as List, r[3] as List<BloodRequest>, r[4] as Map<int, String>);
}

class DonorHome extends StatelessWidget {
  const DonorHome({super.key});

  @override
  Widget build(BuildContext context) => Loader<_Data>(load: _load, builder: (context, d, reload) => _Body(d, reload));
}

class _Body extends StatefulWidget {
  const _Body(this.d, this.reload);
  final _Data d;
  final Future<void> Function() reload;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  bool _saving = false;

  Future<void> _save(Future<Object?> Function() run, String success) async {
    setState(() => _saving = true);
    if (await attempt(context, run, success) != null) await widget.reload();
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _logDonation() async {
    final day = await showDatePicker(context: context, firstDate: DateTime(2000), lastDate: DateTime.now(), initialDate: DateTime.now(), helpText: 'When did you donate?');
    if (day != null) await _save(() => Api.addDonation(day), "Thank you! We'll stay quiet while you recover.");
  }

  Future<void> _remove(Map d) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Remove donation?'),
        content: Text('Your donation on ${fmtDate(DateTime.parse(d['donatedAt']))} will be removed and your eligibility recalculated.'),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep it')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Remove'))],
      ),
    );
    if (yes == true) await _save(() => Api.removeDonation(d['id']), 'Donation removed');
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.d;
    final t = Theme.of(context);
    final me = d.me, elig = d.elig;
    final first = (me['displayName'] as String).replaceAll(RegExp(r'\(.*?\)'), '').trim().split(' ').first;
    final eligible = elig['eligible'] == true;
    final last = me['lastDonationAt'] == null ? null : DateTime.parse(me['lastDonationAt']).toLocal();
    final next = elig['nextEligibleAt'] == null ? null : DateTime.parse(elig['nextEligibleAt']).toLocal();
    final now = DateTime.now();
    final daysLeft = next == null ? null : (next.difference(now).inHours / 24).ceil().clamp(0, 999);
    final progress = last != null && next != null ? (now.difference(last).inMinutes / next.difference(last).inMinutes).clamp(0.0, 1.0) : (eligible ? 1.0 : 0.0);

    // Open, verified requests this donor's blood can serve, nearest first.
    final nearby = d.requests
        .where((r) => r.liveStatus == 'open' && r.verified && canReceive[r.group]!.contains(me['group']))
        .map((r) => (r: r, km: distanceKm(me['latitude'], me['longitude'], r.lat, r.lng)))
        .toList()
      ..sort((a, b) => a.km.compareTo(b.km));

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, navClearance),
      children: [
        ...stagger([
          SectionHead(kicker: 'Hi $first', title: eligible ? "You're ready to give" : last != null ? 'Resting up, hero' : 'Welcome to the registry'),
          const SizedBox(height: 20),
          // Hero: group + eligibility ring
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [brand, bloodDeep], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(26),
            ),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(me['group'], style: t.textTheme.displaySmall?.copyWith(color: Colors.white)),
                  const SizedBox(height: 4),
                  Text(me['area'], style: const TextStyle(color: Colors.white70)),
                  const SizedBox(height: 12),
                  Text(
                    eligible ? 'Eligible to donate today' : next != null ? 'Eligible again on ${fmtDate(next)}' : elig['reason'] ?? '',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                  if (last != null) Text('Last gave ${fmtDate(last)}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                ]),
              ),
              _Ring(progress: progress, label: eligible ? 'Ready' : daysLeft != null ? '${daysLeft}d' : '—'),
            ]),
          ),
          const SizedBox(height: 16),
          SoftCard(
            child: SwitchListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
              title: const Text('Open to requests', style: TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(me['available'] == true ? "Coordinators can match you" : "Paused, we won't match you"),
              value: me['available'] == true,
              onChanged: _saving ? null : (v) => _save(() => Api.updateMe({'available': v}), v ? "You're back on the list" : "Paused, we won't match you"),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.tonalIcon(onPressed: _saving ? null : _logDonation, icon: const Icon(Icons.add), label: const Text('Log a donation')),
          const SizedBox(height: 28),
          Text('Open requests you can help with', style: t.textTheme.titleLarge),
          const SizedBox(height: 12),
        ]),
        if (nearby.isEmpty) const EmptyState('No open requests for your group right now. We will let coordinators find you.'),
        for (final n in nearby.take(3))
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: RequestCard(r: n.r, km: n.km, donor: true, response: d.responses[n.r.id], onChanged: widget.reload),
          ),
        const SizedBox(height: 16),
        Text('Your donations', style: t.textTheme.titleLarge),
        const SizedBox(height: 8),
        if (d.history.isEmpty) const EmptyState('No donations logged yet.', icon: Icons.favorite_border),
        for (final h in d.history)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const CircleAvatar(backgroundColor: Color(0x1FD93A3A), child: Icon(Icons.favorite, color: brand, size: 20)),
            title: Text(fmtDate(DateTime.parse(h['donatedAt']).toLocal())),
            trailing: IconButton(tooltip: 'Remove', icon: const Icon(Icons.delete_outline), onPressed: _saving ? null : () => _remove(h)),
          ).animate().fadeIn(),
      ],
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.progress, required this.label});
  final double progress;
  final String label;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: 92,
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: progress),
          duration: const Duration(milliseconds: 1200),
          curve: Curves.easeOutCubic,
          builder: (_, v, _) => Stack(fit: StackFit.expand, children: [
            CircularProgressIndicator(value: v, strokeWidth: 8, color: Colors.white, backgroundColor: Colors.white24, strokeCap: StrokeCap.round),
            Center(child: Text(label, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Colors.white))),
          ]),
        ),
      );
}
