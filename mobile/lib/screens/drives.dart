import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../ui.dart';

class DrivesScreen extends StatefulWidget {
  const DrivesScreen({super.key, required this.session});
  final Session session;

  @override
  State<DrivesScreen> createState() => _DrivesScreenState();
}

class _DrivesScreenState extends State<DrivesScreen> {
  final _loader = GlobalKey<LoaderState>();
  bool get _donor => widget.session.isDonor;

  Future<Map<String, dynamic>> _load() async {
    if (!_donor) return {'drives': await Api.drives(), 'mine': <int>{}};
    final me = await Api.me();
    final r = await Future.wait([Api.drives(lat: me['latitude'], lng: me['longitude']), Api.myRsvps(), Api.eligibility()]);
    return {'drives': r[0], 'mine': r[1], 'elig': r[2]};
  }

  Future<void> _newDrive() async {
    final d = await showModalBottomSheet<Drive>(context: context, isScrollControlled: true, useSafeArea: true, showDragHandle: true, builder: (_) => const NewDriveSheet());
    if (d != null) await _loader.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) => FabStack(
        fab: _donor ? null : FloatingActionButton.extended(onPressed: _newDrive, icon: const Icon(Icons.add), label: const Text('New drive'))
            .animate().scale(delay: 300.ms, curve: Curves.easeOutBack),
        body: Loader<Map<String, dynamic>>(
          key: _loader,
          load: _load,
          builder: (context, d, reload) {
            final drives = d['drives'] as List<Drive>;
            final elig = d['elig'] as Map<String, dynamic>?;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, navClearance + 64),
              children: [
                SectionHead(
                  kicker: 'Drives & camps',
                  title: _donor ? 'Give blood near you' : 'Upcoming drives',
                  sub: _donor ? 'Community blood drives, nearest first.' : 'Organise a camp and donors nearby can RSVP.',
                ),
                if (elig != null && elig['eligible'] != true && elig['nextEligibleAt'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: SoftCard(
                      color: amber.withValues(alpha: 0.12),
                      child: ListTile(
                        leading: const Icon(Icons.hourglass_bottom, color: amber),
                        title: Text("You're eligible again on ${fmtDate(DateTime.parse(elig['nextEligibleAt']).toLocal())}"),
                        subtitle: const Text('Pick a drive after that date.'),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                if (drives.isEmpty) const EmptyState('No upcoming drives yet.', icon: Icons.event_busy),
                ...stagger([
                  for (final dr in drives)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _DriveCard(drive: dr, donor: _donor, going: (d['mine'] as Set<int>).contains(dr.id), onChanged: reload),
                    ),
                ]),
              ],
            );
          },
        ),
      );
}

class _DriveCard extends StatefulWidget {
  const _DriveCard({required this.drive, required this.donor, required this.going, required this.onChanged});
  final Drive drive;
  final bool donor, going;
  final Future<void> Function() onChanged;

  @override
  State<_DriveCard> createState() => _DriveCardState();
}

class _DriveCardState extends State<_DriveCard> {
  bool _busy = false;

  Future<void> _toggle() async {
    setState(() => _busy = true);
    final d = widget.drive;
    final r = await attempt(context, () => widget.going ? Api.cancelRsvp(d.id) : Api.rsvp(d.id), widget.going ? 'RSVP cancelled' : "You're on the list. See you there!");
    if (r != null) await widget.onChanged();
    if (mounted) setState(() => _busy = false);
  }

  void _calendar() {
    final d = widget.drive;
    String utc(DateTime t) => DateFormat("yyyyMMdd'T'HHmmss'Z'").format(t.toUtc());
    launchUrl(
      Uri.https('calendar.google.com', '/calendar/render', {
        'action': 'TEMPLATE', 'text': d.title, 'dates': '${utc(d.startsAt)}/${utc(d.endsAt)}',
        'location': '${d.venue}, ${d.area}', 'details': 'Blood donation drive by ${d.organizer}',
      }),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.drive;
    final t = Theme.of(context);
    final muted = t.colorScheme.onSurfaceVariant;
    final full = d.capacity != null && d.rsvpCount >= d.capacity!;
    return SoftCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 56,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(color: brand.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(16)),
              child: Column(children: [
                Text(DateFormat('MMM').format(d.startsAt).toUpperCase(), style: const TextStyle(color: brand, fontWeight: FontWeight.w700, fontSize: 12)),
                Text('${d.startsAt.day}', style: t.textTheme.headlineSmall?.copyWith(color: brand)),
              ]),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(d.title, style: t.textTheme.titleLarge),
                Text('by ${d.organizer}', style: TextStyle(color: muted, fontSize: 13)),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          _line(Icons.schedule, '${DateFormat('EEE, h:mm a').format(d.startsAt)} – ${DateFormat('h:mm a').format(d.endsAt)}', muted),
          _line(Icons.place_outlined, [d.venue, d.area, if (d.distanceKm != null) '${d.distanceKm!.toStringAsFixed(1)} km'].join(' · '), muted),
          _line(Icons.people_outline, d.capacity == null ? '${d.rsvpCount} going' : '${d.rsvpCount} / ${d.capacity} spots taken', muted),
          if (d.capacity != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: LinearProgressIndicator(value: (d.rsvpCount / d.capacity!).clamp(0, 1), minHeight: 6, backgroundColor: brand.withValues(alpha: 0.12)),
              ),
            ),
          const SizedBox(height: 14),
          Row(children: [
            if (widget.donor)
              Expanded(
                child: widget.going
                    ? OutlinedButton.icon(onPressed: _busy ? null : _toggle, icon: const Icon(Icons.check, color: ok), label: const Text("Going · cancel"))
                    : FilledButton.icon(onPressed: _busy || full ? null : _toggle, icon: const Icon(Icons.event_available), label: Text(full ? 'Full' : "I'll be there")),
              )
            else
              const Spacer(),
            const SizedBox(width: 8),
            IconButton.filledTonal(tooltip: 'Add to calendar', onPressed: _calendar, icon: const Icon(Icons.calendar_month_outlined)),
            IconButton.filledTonal(
              tooltip: 'Directions',
              onPressed: () => launchUrl(Uri.https('www.google.com', '/maps/dir/', {'api': '1', 'destination': '${d.lat},${d.lng}'}), mode: LaunchMode.externalApplication),
              icon: const Icon(Icons.directions_outlined),
            ),
          ]),
        ]),
      ),
    );
  }

  Widget _line(IconData icon, String text, Color c) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(children: [Icon(icon, size: 16, color: c), const SizedBox(width: 6), Expanded(child: Text(text, style: TextStyle(color: c)))]),
      );
}

class NewDriveSheet extends StatefulWidget {
  const NewDriveSheet({super.key});

  @override
  State<NewDriveSheet> createState() => _NewDriveSheetState();
}

class _NewDriveSheetState extends State<NewDriveSheet> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _organizer = TextEditingController();
  final _venue = TextEditingController();
  final _area = TextEditingController();
  final _capacity = TextEditingController();
  DateTime? _date;
  TimeOfDay _from = const TimeOfDay(hour: 10, minute: 0), _to = const TimeOfDay(hour: 16, minute: 0);
  ({double lat, double lng})? _loc;
  bool _busy = false, _locating = false;

  Future<void> _locate() async {
    setState(() => _locating = true);
    final loc = await attempt(context, currentLocation);
    if (mounted) setState(() { _loc = loc ?? _loc; _locating = false; });
  }

  DateTime _at(TimeOfDay t) => DateTime(_date!.year, _date!.month, _date!.day, t.hour, t.minute);

  Future<void> _create() async {
    if (!_form.currentState!.validate()) return;
    if (_date == null) return toast(context, 'Pick a date', error: true);
    if (_loc == null) return toast(context, "Set the venue's location", error: true);
    if (!_at(_to).isAfter(_at(_from))) return toast(context, 'End time must be after start time', error: true);
    setState(() => _busy = true);
    final d = await attempt(context, () => Api.createDrive({
          'title': _title.text.trim(), 'organizer': _organizer.text.trim(), 'venue': _venue.text.trim(), 'area': _area.text.trim(),
          'latitude': _loc!.lat, 'longitude': _loc!.lng,
          'startsAt': _at(_from).toUtc().toIso8601String(), 'endsAt': _at(_to).toUtc().toIso8601String(),
          if (_capacity.text.isNotEmpty) 'capacity': int.parse(_capacity.text),
        }), 'Drive published');
    if (!mounted) return;
    setState(() => _busy = false);
    if (d != null) Navigator.pop(context, d);
  }

  @override
  Widget build(BuildContext context) {
    String? min(String? v, int n) => (v ?? '').trim().length < n ? 'Required' : null;
    const gap = SizedBox(height: 12);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('New drive', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 16),
            TextFormField(controller: _title, decoration: const InputDecoration(labelText: 'Title', hintText: 'COEP Rotaract Blood Drive'), validator: (v) => min(v, 3)),
            gap,
            TextFormField(controller: _organizer, decoration: const InputDecoration(labelText: 'Organiser'), validator: (v) => min(v, 2)),
            gap,
            TextFormField(controller: _venue, decoration: const InputDecoration(labelText: 'Venue'), validator: (v) => min(v, 2)),
            gap,
            TextFormField(controller: _area, decoration: const InputDecoration(labelText: 'Area'), validator: (v) => min(v, 1)),
            const SizedBox(height: 8),
            // shortcut: venue location = coordinator's current position; add a places search (as on web) for drives planned off-site.
            OutlinedButton.icon(
              onPressed: _locating ? null : _locate,
              icon: Icon(_loc == null ? Icons.my_location : Icons.check_circle, color: _loc == null ? null : ok),
              label: Text(_locating ? 'Locating…' : _loc == null ? "I'm at the venue, use my location" : 'Location set'),
            ),
            gap,
            OutlinedButton.icon(
              icon: const Icon(Icons.event),
              label: Text(_date == null ? 'Pick date' : fmtDate(_date!)),
              onPressed: () async {
                final now = DateTime.now();
                final d = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 365)), initialDate: _date ?? now);
                if (d != null) setState(() => _date = d);
              },
            ),
            gap,
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () async { final t = await showTimePicker(context: context, initialTime: _from); if (t != null) setState(() => _from = t); }, child: Text('From ${_from.format(context)}'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton(onPressed: () async { final t = await showTimePicker(context: context, initialTime: _to); if (t != null) setState(() => _to = t); }, child: Text('To ${_to.format(context)}'))),
            ]),
            gap,
            TextFormField(
              controller: _capacity,
              decoration: const InputDecoration(labelText: 'Capacity (optional)', hintText: 'e.g. 120'),
              keyboardType: TextInputType.number,
              validator: (v) {
                if ((v ?? '').isEmpty) return null;
                final n = int.tryParse(v!);
                return n == null || n < 1 || n > 5000 ? '1 to 5000' : null;
              },
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _busy ? null : _create, child: Text(_busy ? 'Publishing…' : 'Publish drive')),
          ]),
        ),
      ),
    );
  }
}
