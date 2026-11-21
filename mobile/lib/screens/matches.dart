import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../ui.dart';

const maxKm = 50;
const _status = {
  'responded': ('✋ Raised hand', amber),
  'called': ('Called', Colors.blueGrey),
  'no_answer': ('No answer', Color(0xFFC0642A)),
  'coming': ('Coming', brand),
  'declined': ('Declined', Colors.grey),
  'donated': ('Donated', ok),
};

/// Coordinator: eligible donors around a verified request, contact reveal and outreach tracking.
class MatchesScreen extends StatefulWidget {
  const MatchesScreen({super.key, required this.r});
  final BloodRequest r;

  @override
  State<MatchesScreen> createState() => _MatchesScreenState();
}

class _MatchesScreenState extends State<MatchesScreen> {
  late BloodRequest _r = widget.r;
  double _radius = 10;
  List<Map<String, dynamic>>? _matches;
  List<Map<String, dynamic>> _outreach = [];
  final Map<int, Map<String, dynamic>> _revealed = {};
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    _search();
    _loadOutreach();
  }

  Future<void> _search() async {
    setState(() => _matches = null);
    final m = await attempt(context, () => Api.matches(_r.id, _radius.round()));
    if (mounted) setState(() => _matches = m ?? []);
  }

  Future<void> _loadOutreach() async {
    final o = await attempt(context, () => Api.outreach(_r.id));
    if (mounted && o != null) setState(() => _outreach = o);
  }

  // Contacts come from the API one donor at a time (logged server-side), not with the match list.
  Future<void> _reveal(Map d) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Contact ${d['displayName']}?'),
        content: const Text("Their phone and email will be shown to you. Each reveal is logged, so only reveal donors you're about to call."),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Not now')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Show contact'))],
      ),
    );
    if (yes != true || !mounted) return;
    final c = await attempt(context, () => Api.contact(_r.id, d['donorId']));
    if (c != null && mounted) setState(() => _revealed[d['donorId']] = c);
  }

  Future<void> _track(int donorId, String status) async {
    final r = await attempt(context, () => Api.setOutreach(_r.id, donorId, status));
    if (r != null && mounted) {
      setState(() => _r = r);
      await _loadOutreach();
    }
  }

  Future<void> _fulfil() async {
    setState(() => _closing = true);
    final r = await attempt(context, () => Api.fulfill(_r.id), '${_r.label} fulfilled');
    if (!mounted) return;
    setState(() => _closing = false);
    if (r != null) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final status = {for (final o in _outreach) o['donorId'] as int: o};
    // Donors already worked who fall outside the current radius still show, after the matches.
    final worked = _outreach.where((o) => !(_matches ?? []).any((m) => m['donorId'] == o['donorId'])).toList();
    final rows = [...?_matches, ...worked];

    return Scaffold(
      appBar: AppBar(title: Text(_r.label)),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: ok),
            onPressed: _closing ? null : _fulfil,
            icon: const Icon(Icons.check_circle),
            label: Text(_closing ? 'Closing…' : 'Mark as fulfilled'),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => await Future.wait([_search(), _loadOutreach()]),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            Row(children: [
              GroupBadge(_r.group, size: 56),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_r.hospital, style: t.textTheme.titleLarge),
                  Text('${_r.units} units · ${_r.area} · ${timeLeft(_r.expiresAt)}', style: TextStyle(color: t.colorScheme.onSurfaceVariant)),
                ]),
              ),
            ]).animate().fadeIn(),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              urgencyPill(_r.urgency),
              if (_r.responded > 0) Pill('✋ ${_r.responded} raised hand', color: amber),
              if (_r.coming > 0) Pill('${_r.coming} coming', color: brand),
              if (_r.donated > 0) Pill('${_r.donated} donated', color: ok),
            ]),
            const SizedBox(height: 20),
            SoftCard(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Column(children: [
                  Row(children: [
                    const Text('Search radius', style: TextStyle(fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Text('${_radius.round()} km', style: t.textTheme.titleLarge),
                  ]),
                  Slider(min: 1, max: maxKm.toDouble(), divisions: maxKm - 1, value: _radius, onChanged: (v) => setState(() => _radius = v), onChangeEnd: (_) => _search()),
                  if (_matches != null) _Radar(kms: [for (final m in _matches!) (m['distanceKm'] as num).toDouble()], radius: _radius),
                ]),
              ),
            ),
            const SizedBox(height: 16),
            Text(_matches == null ? 'Searching…' : '${_matches!.length} eligible donor${_matches!.length == 1 ? '' : 's'} within ${_radius.round()} km', style: t.textTheme.titleMedium),
            const SizedBox(height: 8),
            if (_matches == null) const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
            if (_matches != null && rows.isEmpty) EmptyState('No one eligible within ${_radius.round()} km yet. Try widening the radius.', icon: Icons.person_search),
            ...stagger([
              for (final d in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _DonorTile(
                    d: d,
                    status: status[d['donorId']]?['status'],
                    // Outreach rows already carry contact details.
                    contact: _revealed[d['donorId']] ?? (status[d['donorId']]?['phone'] == null ? null : status[d['donorId']]),
                    onReveal: () => _reveal(d),
                    onStatus: (s) => _track(d['donorId'], s),
                  ),
                ),
            ]),
          ],
        ),
      ),
    );
  }
}

class _DonorTile extends StatelessWidget {
  const _DonorTile({required this.d, required this.status, required this.contact, required this.onReveal, required this.onStatus});
  final Map<String, dynamic> d;
  final String? status;
  final Map<String, dynamic>? contact;
  final VoidCallback onReveal;
  final ValueChanged<String> onStatus;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final s = _status[status];
    return SoftCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(children: [
          Row(children: [
            GroupBadge(d['group'], size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(d['displayName'], style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${d['area']} · ${d['distanceKm']} km away', style: TextStyle(color: muted, fontSize: 13)),
                if ((d['eligibility'] ?? '').toString().isNotEmpty) Text(d['eligibility'], style: TextStyle(color: muted, fontSize: 12)),
              ]),
            ),
            PopupMenuButton<String>(
              tooltip: 'Outreach status',
              onSelected: onStatus,
              itemBuilder: (_) => [
                for (final e in _status.entries.where((e) => e.key != 'responded'))
                  CheckedPopupMenuItem(value: e.key, checked: status == e.key, child: Text(e.value.$1)),
              ],
              child: s == null ? const Pill('Mark ▾', color: Colors.blueGrey) : Pill('${s.$1} ▾', color: s.$2, filled: status == 'coming' || status == 'donated'),
            ),
          ]),
          const SizedBox(height: 10),
          if (contact == null)
            SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: onReveal, icon: const Icon(Icons.contact_phone_outlined), label: const Text('Show contact')))
          else
            Row(children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => launchUrl(Uri(scheme: 'tel', path: contact!['phone'])),
                  icon: const Icon(Icons.call),
                  label: Text(contact!['phone']),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: contact!['email'],
                onPressed: () => launchUrl(Uri(scheme: 'mailto', path: contact!['email'])),
                icon: const Icon(Icons.email_outlined),
              ),
            ]).animate().fadeIn().scaleXY(begin: 0.95),
        ]),
      ),
    );
  }
}

/// Donors plotted by distance on concentric rings, like the web radar.
class _Radar extends StatelessWidget {
  const _Radar({required this.kms, required this.radius});
  final List<double> kms;
  final double radius;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 200,
        child: Stack(alignment: Alignment.center, children: [
          for (final f in [1.0, 0.66, 0.33])
            Container(
              width: 190 * f,
              height: 190 * f,
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: brand.withValues(alpha: 0.2)), color: brand.withValues(alpha: 0.03)),
            ),
          const Icon(Icons.local_hospital, color: brand, size: 22),
          for (var i = 0; i < kms.length; i++)
            Transform.translate(
              offset: Offset.fromDirection(i * 2.39996, 95 * min(kms[i], radius) / max(radius, 1)), // golden angle spreads dots evenly
              child: Container(width: 12, height: 12, decoration: const BoxDecoration(color: brand, shape: BoxShape.circle))
                  .animate(delay: (i * 50).ms)
                  .scale(begin: Offset.zero, curve: Curves.easeOutBack),
            ),
        ]),
      );
}
