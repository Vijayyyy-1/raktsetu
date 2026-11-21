import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../maps.dart';
import '../ui.dart';
import 'matches.dart';

class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key, required this.session});
  final Session session;

  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen> {
  final _loader = GlobalKey<LoaderState>();
  int _tab = 0;
  bool _mapView = false; // coordinator: open requests as cards or on a map

  bool get _donor => widget.session.isDonor;

  Future<Map<String, dynamic>> _load() async {
    if (_donor) {
      final r = await Future.wait([Api.requests(), Api.me(), Api.myResponses()]);
      return {'requests': r[0], 'me': r[1], 'responses': r[2]};
    }
    final r = await Future.wait([Api.requests(), Api.closedRequests(), Api.supply().catchError((_) => <int, Map<String, dynamic>>{})]);
    return {'requests': r[0], 'closed': r[1], 'supply': r[2]};
  }

  Future<void> _reload() async => _loader.currentState?.reload();

  Future<void> _newRequest() async {
    final created = await showModalBottomSheet<BloodRequest>(context: context, isScrollControlled: true, useSafeArea: true, showDragHandle: true, builder: (_) => const NewRequestSheet());
    if (created != null) {
      setState(() => _tab = 0);
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) => FabStack(
        fab: _donor ? null : FloatingActionButton.extended(onPressed: _newRequest, icon: const Icon(Icons.add), label: const Text('New request'))
            .animate().scale(delay: 300.ms, curve: Curves.easeOutBack),
        body: Loader<Map<String, dynamic>>(key: _loader, load: _load, builder: (context, d, reload) => _donor ? _donorList(d) : _coordinatorList(d)),
      );

  Widget _tabs(List<String> labels) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: PillTabs(labels: labels, index: _tab, onChanged: (i) => setState(() => _tab = i)),
      );

  // Donors see verified needs only, nearest first. "For you": their blood can serve it and it's within alert range.
  // "Help spread the word": anything within sharing range, to forward to family and friends.
  Widget _donorList(Map<String, dynamic> d) {
    final me = d['me'] as Map<String, dynamic>;
    final responses = d['responses'] as Map<int, String>;
    final feed = (d['requests'] as List<BloodRequest>)
        .where((r) => r.verified && r.liveStatus == 'open')
        .map((r) => (r: r, km: distanceKm(me['latitude'], me['longitude'], r.lat, r.lng), canGive: canReceive[r.group]!.contains(me['group'])))
        .where((f) => f.km <= shareKm)
        .toList()
      ..sort((a, b) => a.km.compareTo(b.km));
    final mine = feed.where((f) => f.canGive && f.km <= nearKm).toList();
    final shown = _tab == 0 ? mine : feed;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, navClearance),
      children: [
        SectionHead(
          kicker: 'Near you',
          title: 'Who needs help today',
          sub: _tab == 0
              ? 'Verified needs within $nearKm km that your ${me['group']} blood can serve. No patient names or diagnoses, ever.'
              : "Every verified need within $shareKm km. Can't give to one? Share it with family or friends who can.",
        ),
        const SizedBox(height: 16),
        _tabs(['For you · ${mine.length}', 'Help spread the word · ${feed.length}']),
        if (shown.isEmpty)
          EmptyState(_tab == 0 && feed.isNotEmpty
              ? 'Nothing within $nearKm km for your blood group right now. Check “Help spread the word” to share others.'
              : 'No open requests near you right now.'),
        ...stagger([
          for (final f in shown)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: RequestCard(r: f.r, km: f.km, donor: true, canGive: f.canGive, response: responses[f.r.id], onChanged: _reload),
            ),
        ]),
      ],
    );
  }

  // Coordinator triage: unverified first (they block matching), then soonest to close.
  Widget _coordinatorList(Map<String, dynamic> d) {
    final all = d['requests'] as List<BloodRequest>;
    final open = all.where((r) => r.liveStatus == 'open').toList()
      ..sort((a, b) => a.verified == b.verified ? a.expiresAt.compareTo(b.expiresAt) : (a.verified ? 1 : -1));
    final closed = [...all.where((r) => r.liveStatus != 'open'), ...d['closed'] as List<BloodRequest>];
    final supply = d['supply'] as Map<int, Map<String, dynamic>>;
    final shown = _tab == 0 ? open : closed;
    final critical = open.where((r) => r.urgency == 'critical').length;
    final unverified = open.where((r) => !r.verified).length;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, navClearance + 64),
      children: [
        const SectionHead(kicker: 'Coordinator', title: 'Blood requests'),
        const SizedBox(height: 16),
        Row(children: [
          _Stat('Open', open.length, Icons.bloodtype),
          const SizedBox(width: 10),
          _Stat('Critical', critical, Icons.bolt, color: brand),
          const SizedBox(width: 10),
          _Stat('To verify', unverified, Icons.verified_outlined, color: amber),
        ]).animate().fadeIn().slideY(begin: 0.1),
        const SizedBox(height: 16),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: _tabs(['Open · ${open.length}', 'Closed · ${closed.length}'])),
          if (_tab == 0) ...[
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: _mapView ? 'Show as cards' : 'Show on map',
              onPressed: () => setState(() => _mapView = !_mapView),
              icon: Icon(_mapView ? Icons.view_agenda_outlined : Icons.map_outlined),
              style: IconButton.styleFrom(minimumSize: const Size(50, 50)),
            ),
          ],
        ]),
        if (shown.isEmpty) EmptyState(_tab == 0 ? 'No open requests. Tap “New request” to raise one.' : 'Nothing closed in the last 30 days.'),
        if (_tab == 0 && _mapView && open.isNotEmpty)
          RequestsMap(
            requests: open,
            supply: supply,
            onMatch: (r) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => MatchesScreen(r: r))).then((_) => _reload()),
          ).animate().fadeIn()
        else
          ...stagger([
            for (final r in shown)
              Padding(padding: const EdgeInsets.only(bottom: 12), child: RequestCard(r: r, supply: supply[r.id], onChanged: _reload)),
          ]),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.icon, {this.color});
  final String label;
  final int value;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) => Expanded(
        child: SoftCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, size: 20, color: color ?? Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(height: 6),
              Text('$value', style: Theme.of(context).textTheme.headlineSmall),
              Text(label, style: Theme.of(context).textTheme.labelMedium),
            ]),
          ),
        ),
      );
}

const _responseLabel = {
  'responded': "You raised your hand",
  'called': 'The coordinator called you',
  'no_answer': 'Missed call from coordinator',
  'coming': "You're coming",
  'declined': 'You declined',
  'donated': 'You donated. Thank you!',
};

class RequestCard extends StatefulWidget {
  const RequestCard({super.key, required this.r, required this.onChanged, this.donor = false, this.km, this.canGive = true, this.response, this.supply});
  final BloodRequest r;
  final Future<void> Function() onChanged;
  final bool donor, canGive;
  final double? km;
  final String? response;
  final Map<String, dynamic>? supply;

  @override
  State<RequestCard> createState() => _RequestCardState();
}

class _RequestCardState extends State<RequestCard> {
  bool _busy = false;

  Future<void> _act(Future<Object?> Function() run, String success) async {
    setState(() => _busy = true);
    if (await attempt(context, run, success) != null) await widget.onChanged();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _edit() async {
    final updated = await showModalBottomSheet<BloodRequest>(context: context, isScrollControlled: true, useSafeArea: true, showDragHandle: true, builder: (_) => EditRequestSheet(r: widget.r));
    if (updated != null) await widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    final t = Theme.of(context);
    final status = r.liveStatus;
    final isOpen = status == 'open';
    final got = r.donated + r.unitsReceived;
    final soon = isOpen && r.expiresAt.difference(DateTime.now()).inMinutes < 60;
    final muted = t.colorScheme.onSurfaceVariant;

    return SoftCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            GroupBadge(r.group),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r.hospital, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700), maxLines: 2, overflow: TextOverflow.ellipsis),
                Text([r.area, if (widget.km != null) '${widget.km} km away'].join(' · '), style: TextStyle(color: muted, fontSize: 13)),
              ]),
            ),
            isOpen ? urgencyPill(r.urgency) : statusPill(status),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            Text('${r.units} unit${r.units == 1 ? '' : 's'}', style: const TextStyle(fontWeight: FontWeight.w700)),
            if (got > 0) Text('  ·  $got received', style: TextStyle(color: muted)),
            const Spacer(),
            if (isOpen) ...[
              Icon(Icons.schedule, size: 14, color: soon ? brand : muted),
              const SizedBox(width: 4),
              Text(timeLeft(r.expiresAt), style: TextStyle(color: soon ? brand : muted, fontWeight: soon ? FontWeight.w700 : null)),
            ] else
              Text(ago(r.closedAt ?? r.expiresAt), style: TextStyle(color: muted)),
          ]),
          if (got > 0) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(9),
              child: LinearProgressIndicator(value: (got / r.units).clamp(0, 1), minHeight: 6, color: ok, backgroundColor: ok.withValues(alpha: 0.15)),
            ),
          ],
          if (!widget.donor) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 6, children: [
              Pill(r.label, color: muted),
              if (r.verified) const Pill('Verified', color: ok, icon: Icons.verified) else const Pill('Unverified', color: amber, icon: Icons.warning_amber),
              if (r.responded > 0) Pill('✋ ${r.responded} raised hand', color: amber),
              if (r.coming > 0) Pill('${r.coming} coming', color: brand),
              if (widget.supply != null) Pill('${widget.supply!['within10']} donors ≤10 km', color: muted, icon: Icons.people_outline),
            ]),
          ],
          if (isOpen) ...[const SizedBox(height: 14), widget.donor ? _donorActions() : _coordinatorActions()],
        ]),
      ),
    );
  }

  Widget _donorActions() {
    final r = widget.r;
    final shareBtn = widget.canGive
        ? FilledButton.tonalIcon(onPressed: _share, icon: const Icon(Icons.share_outlined), label: const Text('Share with family'))
        : FilledButton.icon(onPressed: _share, icon: const Icon(Icons.share_outlined), label: const Text('Share with someone who can give'));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (widget.response != null)
        Row(children: [
          Expanded(child: Text(_responseLabel[widget.response] ?? widget.response!, style: const TextStyle(fontWeight: FontWeight.w600, color: ok))),
          if (widget.response == 'responded')
            TextButton(onPressed: _busy ? null : () => _act(() => Api.withdraw(r.id), 'Withdrawn'), child: const Text('Withdraw')),
        ])
      else if (widget.canGive)
        FilledButton.icon(
          onPressed: _busy ? null : () => _act(() => Api.respond(r.id), 'Thanks! The coordinator can see you raised your hand.'),
          icon: const Icon(Icons.pan_tool_alt_outlined),
          label: const Text('I can donate'),
        )
      else
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: bloodSoft, borderRadius: BorderRadius.circular(16)),
          child: Text.rich(TextSpan(children: [
            const TextSpan(text: "Not your blood group. Know someone who's "),
            TextSpan(text: canReceive[r.group]!.length == groups.length ? 'any blood group' : canReceive[r.group]!.join(', '), style: const TextStyle(fontWeight: FontWeight.w700)),
            const TextSpan(text: '? Send this to them.'),
          ])),
        ),
      const SizedBox(height: 8),
      shareBtn,
    ]);
  }

  // Same message as the web. The link opens a live status page, so a forward read days later says "closed" instead of "urgent".
  Future<void> _share() async {
    final r = widget.r;
    final hrs = r.expiresAt.difference(DateTime.now()).inMinutes / 60;
    final text = '${r.group} blood needed: ${r.units} unit${r.units > 1 ? 's' : ''} at ${r.hospital}, ${r.area} (verified, ${r.label}). '
        "Needed within ~${hrs.round().clamp(1, 999)}h. Check it's still needed before forwarding: $webUrl/r/${r.id}";
    try {
      await SharePlus.instance.share(ShareParams(text: text, subject: '${r.group} blood needed'));
    } catch (_) {
      if (mounted) toast(context, "Couldn't share this request", error: true);
    }
  }

  Widget _coordinatorActions() {
    final r = widget.r;
    return Row(children: [
      Expanded(
        child: r.verified
            ? FilledButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => MatchesScreen(r: r))).then((_) => widget.onChanged()),
                icon: const Icon(Icons.radar),
                label: const Text('Find donors'),
              )
            : FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: ok),
                onPressed: _busy ? null : () => _act(() => Api.verify(r.id), '${r.label} verified'),
                icon: const Icon(Icons.verified),
                label: const Text('Verify'),
              ),
      ),
      const SizedBox(width: 8),
      PopupMenuButton<String>(
        enabled: !_busy,
        icon: const Icon(Icons.more_horiz),
        onSelected: (v) => switch (v) {
          'edit' => _edit(),
          'fulfil' => _act(() => Api.fulfill(r.id), '${r.label} fulfilled'),
          _ => _confirmCancel(),
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'edit', child: ListTile(leading: Icon(Icons.edit_outlined), title: Text('Edit / record units'))),
          PopupMenuItem(value: 'fulfil', child: ListTile(leading: Icon(Icons.check_circle_outline), title: Text('Mark as fulfilled'))),
          PopupMenuItem(value: 'cancel', child: ListTile(leading: Icon(Icons.cancel_outlined), title: Text('Cancel request'))),
        ],
      ),
    ]);
  }

  Future<void> _confirmCancel() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Cancel ${widget.r.label}?'),
        content: const Text('Donors will no longer see this request.'),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Cancel request'))],
      ),
    );
    if (yes == true) await _act(() => Api.cancel(widget.r.id), '${widget.r.label} cancelled');
  }
}

Widget _stepper(String label, int value, int min, int max, ValueChanged<int> onChanged) => Row(children: [
      Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
      IconButton.filledTonal(onPressed: value > min ? () => onChanged(value - 1) : null, icon: const Icon(Icons.remove)),
      SizedBox(width: 44, child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
      IconButton.filledTonal(onPressed: value < max ? () => onChanged(value + 1) : null, icon: const Icon(Icons.add)),
    ]);

Widget _urgencyPicker(String value, ValueChanged<String> onChanged) => SegmentedButton<String>(
      showSelectedIcon: false,
      segments: const [
        ButtonSegment(value: 'critical', label: Text('Critical'), icon: Icon(Icons.bolt)),
        ButtonSegment(value: 'urgent', label: Text('Urgent')),
        ButtonSegment(value: 'planned', label: Text('Planned')),
      ],
      selected: {value},
      onSelectionChanged: (s) => onChanged(s.first),
    );

class NewRequestSheet extends StatefulWidget {
  const NewRequestSheet({super.key});

  @override
  State<NewRequestSheet> createState() => _NewRequestSheetState();
}

class _NewRequestSheetState extends State<NewRequestSheet> {
  final _hospital = TextEditingController();
  final _area = TextEditingController();
  String _group = 'O+', _urgency = 'critical';
  int _units = 1;
  ({double lat, double lng})? _loc;
  bool _busy = false, _locating = false;

  Future<void> _locate() async {
    setState(() => _locating = true);
    final loc = await attempt(context, currentLocation);
    if (mounted) setState(() { _loc = loc ?? _loc; _locating = false; });
  }

  Future<void> _create() async {
    if (_hospital.text.trim().length < 2 || _area.text.trim().isEmpty) return toast(context, 'Enter the hospital and area', error: true);
    if (_loc == null) return toast(context, "Set the hospital's location", error: true);
    setState(() => _busy = true);
    final r = await attempt(context, () => Api.createRequest(
          group: _group, units: _units, hospital: _hospital.text.trim(), area: _area.text.trim(), lat: _loc!.lat, lng: _loc!.lng, urgency: _urgency,
        ), 'Request created');
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) Navigator.pop(context, r);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('New request', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 16),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final g in groups) ChoiceChip(label: Text(g, style: const TextStyle(fontWeight: FontWeight.w700)), selected: _group == g, showCheckmark: false, onSelected: (_) => setState(() => _group = g)),
            ]),
            const SizedBox(height: 16),
            _stepper('Units needed', _units, 1, 20, (v) => setState(() => _units = v)),
            const SizedBox(height: 16),
            TextField(controller: _hospital, decoration: const InputDecoration(labelText: 'Hospital'), textCapitalization: TextCapitalization.words),
            const SizedBox(height: 12),
            TextField(controller: _area, decoration: const InputDecoration(labelText: 'Area', hintText: 'e.g. Shivajinagar, Pune'), textCapitalization: TextCapitalization.words),
            const SizedBox(height: 8),
            // shortcut: uses the coordinator's current position as the hospital location; add a places search (as on web) if coordinators raise requests remotely.
            OutlinedButton.icon(
              onPressed: _locating ? null : _locate,
              icon: Icon(_loc == null ? Icons.my_location : Icons.check_circle, color: _loc == null ? null : ok),
              label: Text(_locating ? 'Locating…' : _loc == null ? "I'm at the hospital, use my location" : 'Location set'),
            ),
            const SizedBox(height: 16),
            _urgencyPicker(_urgency, (u) => setState(() => _urgency = u)),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Closes automatically in ${urgencyWindowHours[_urgency]} hours', style: Theme.of(context).textTheme.bodySmall),
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _busy ? null : _create, child: Text(_busy ? 'Creating…' : 'Create request')),
          ]),
        ),
      );
}

class EditRequestSheet extends StatefulWidget {
  const EditRequestSheet({super.key, required this.r});
  final BloodRequest r;

  @override
  State<EditRequestSheet> createState() => _EditRequestSheetState();
}

class _EditRequestSheetState extends State<EditRequestSheet> {
  late int _units = widget.r.units, _received = widget.r.unitsReceived;
  late String _urgency = widget.r.urgency;
  int _extendH = 0;
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    final r = widget.r;
    final next = await attempt(context, () => Api.updateRequest(
          r.id,
          units: _units,
          unitsReceived: _received,
          urgency: _urgency,
          expiresAt: _extendH == 0 ? null : r.expiresAt.add(Duration(hours: _extendH)),
        ));
    if (!mounted) return;
    setState(() => _busy = false);
    if (next != null) {
      toast(context, next.status == 'fulfilled' ? '${r.label} is fully covered and closed' : '${r.label} updated');
      Navigator.pop(context, next);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Edit ${widget.r.label}', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 16),
          _stepper('Units needed', _units, 1, 20, (v) => setState(() { _units = v; _received = _received.clamp(0, v); })),
          const SizedBox(height: 8),
          _stepper('Received outside app', _received, 0, _units, (v) => setState(() => _received = v)),
          Text('Blood bank or walk-in units. Reaching the total closes the request.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          _urgencyPicker(_urgency, (u) => setState(() => _urgency = u)),
          const SizedBox(height: 16),
          Text('Extend closing time · closes in ${timeLeft(widget.r.expiresAt.add(Duration(hours: _extendH))).replaceAll(' left', '')}',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            for (final h in [0, 2, 6, 24]) ChoiceChip(label: Text(h == 0 ? 'No change' : '+${h}h'), selected: _extendH == h, onSelected: (_) => setState(() => _extendH = h)),
          ]),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save changes')),
        ]),
      );
}
