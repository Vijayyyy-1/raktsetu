// Google Maps views ported from the web (components/RequestsMap.tsx, DonorsMap.tsx). Key: MAPS_API_KEY in android/local.properties.
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'api.dart';
import 'ui.dart';

const pune = LatLng(18.5204, 73.8567);

// Same "blush" style as the web maps (frontend/src/maps.ts BLUSH_STYLE).
const blushStyle = '''[
  {"elementType":"geometry","stylers":[{"color":"#fbf1ee"}]},
  {"elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#9a8487"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#fff8f6"}]},
  {"featureType":"poi","stylers":[{"visibility":"off"}]},
  {"featureType":"transit","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.land_parcel","stylers":[{"visibility":"off"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#ffffff"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#f7d6cf"}]},
  {"featureType":"road","elementType":"labels","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#f1d2cc"}]},
  {"featureType":"landscape.natural","elementType":"geometry","stylers":[{"color":"#f8ebe7"}]}
]''';

// Maps inside scrolling lists must win drag gestures, or panning scrolls the page instead.
final _mapGestures = {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())};

final _icons = <String, Future<BitmapDescriptor>>{};

/// Round pin like the web's SymbolPath.CIRCLE markers: coloured fill, white ring, optional label. Cached per look.
Future<BitmapDescriptor> dotIcon(Color fill, {String? label, double size = 34, Color ring = Colors.white, double ringWidth = 3}) =>
    _icons.putIfAbsent('${fill.toARGB32()}|$label|$size|${ring.toARGB32()}|$ringWidth', () async {
      const ratio = 3.0;
      final px = size * ratio, c = Offset(px / 2, px / 2);
      final rec = ui.PictureRecorder();
      final canvas = Canvas(rec)
        ..drawCircle(c, px / 2, Paint()..color = ring)
        ..drawCircle(c, px / 2 - ringWidth * ratio, Paint()..color = fill);
      if (label != null) {
        final tp = TextPainter(
          text: TextSpan(text: label, style: TextStyle(color: Colors.white, fontSize: size * 0.36 * ratio, fontWeight: FontWeight.w800)),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas, c - Offset(tp.width / 2, tp.height / 2));
      }
      final img = await rec.endRecording().toImage(px.ceil(), px.ceil());
      final png = await img.toByteData(format: ui.ImageByteFormat.png);
      return BitmapDescriptor.bytes(png!.buffer.asUint8List(), imagePixelRatio: ratio);
    });

LatLngBounds _around(LatLng at, double km) {
  final dLat = km / 111.32, dLng = km / (111.32 * cos(at.latitude * pi / 180));
  return LatLngBounds(southwest: LatLng(at.latitude - dLat, at.longitude - dLng), northeast: LatLng(at.latitude + dLat, at.longitude + dLng));
}

class _MapFrame extends StatelessWidget {
  const _MapFrame({required this.height, required this.child});
  final double height;
  final Widget child;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: ClipRRect(borderRadius: BorderRadius.circular(24), child: ColoredBox(color: const Color(0xFFFBF1EE), child: child)),
      );
}

class _Legend extends StatelessWidget {
  const _Legend(this.items);
  final List<(Color, String)> items;

  @override
  Widget build(BuildContext context) => Wrap(spacing: 6, runSpacing: 6, children: [
        for (final (c, l) in items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.92), borderRadius: BorderRadius.circular(99), boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 4)]),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 9, height: 9, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(l, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
            ]),
          ),
      ]);
}

const _pin = {'critical': Color(0xFFC9303F), 'urgent': Color(0xFFE04848), 'planned': Color(0xFFE7A8A0)};
const _covGood = Color(0xFF3F8F6F), _covThin = Color(0xFFD97706), _covNone = Color(0xFFC9303F), _covUnknown = Color(0xFFB9A3A1);

// Ring tint mirrors the card's coverage line: red = nobody within 25 km, amber = thin within 10 km.
Color _coverage(Map<String, dynamic>? s) =>
    s == null ? _covUnknown : s['within25'] == 0 ? _covNone : (s['within10'] as int) < 2 ? _covThin : _covGood;

/// Coordinator: open requests as urgency-coloured pins with a 10 km coverage ring. Donor locations are deliberately not plotted.
class RequestsMap extends StatefulWidget {
  const RequestsMap({super.key, required this.requests, required this.supply, required this.onMatch});
  final List<BloodRequest> requests;
  final Map<int, Map<String, dynamic>> supply;
  final void Function(BloodRequest r) onMatch;

  @override
  State<RequestsMap> createState() => _RequestsMapState();
}

class _RequestsMapState extends State<RequestsMap> {
  GoogleMapController? _map;
  Set<Marker> _markers = {};
  BloodRequest? _picked;

  @override
  void initState() {
    super.initState();
    _draw();
  }

  @override
  void didUpdateWidget(RequestsMap old) {
    super.didUpdateWidget(old);
    _draw();
    if (old.requests.map((r) => r.id).join() != widget.requests.map((r) => r.id).join()) _fit();
  }

  Future<void> _draw() async {
    final markers = {
      for (final r in widget.requests)
        Marker(
          markerId: MarkerId('${r.id}'),
          position: LatLng(r.lat, r.lng),
          icon: await dotIcon(_pin[r.urgency]!, label: r.group),
          anchor: const Offset(0.5, 0.5),
          zIndexInt: r.urgency == 'critical' ? 3 : 2,
          onTap: () => setState(() => _picked = r),
        ),
    };
    if (mounted) setState(() => _markers = markers);
  }

  // Re-fit only when the set of requests changes, so the coordinator's own pan/zoom isn't undone by refreshes.
  void _fit() {
    final m = _map, rs = widget.requests;
    if (m == null || rs.isEmpty) return;
    if (rs.length == 1) {
      m.animateCamera(CameraUpdate.newLatLngZoom(LatLng(rs.first.lat, rs.first.lng), 12));
      return;
    }
    final lats = rs.map((r) => r.lat), lngs = rs.map((r) => r.lng);
    m.animateCamera(CameraUpdate.newLatLngBounds(
      LatLngBounds(southwest: LatLng(lats.reduce(min), lngs.reduce(min)), northeast: LatLng(lats.reduce(max), lngs.reduce(max))),
      60,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final sel = _picked == null ? null : widget.requests.where((r) => r.id == _picked!.id).firstOrNull;
    final s = sel == null ? null : widget.supply[sel.id];
    return _MapFrame(
      height: 520,
      child: Stack(children: [
        GoogleMap(
          initialCameraPosition: const CameraPosition(target: pune, zoom: 11),
          style: blushStyle,
          markers: _markers,
          circles: {
            for (final r in widget.requests)
              Circle(
                circleId: CircleId('${r.id}'),
                center: LatLng(r.lat, r.lng),
                radius: 10000,
                fillColor: _coverage(widget.supply[r.id]).withValues(alpha: 0.08),
                strokeColor: _coverage(widget.supply[r.id]).withValues(alpha: 0.5),
                strokeWidth: 1,
              ),
          },
          onMapCreated: (c) {
            _map = c;
            _fit();
          },
          onTap: (_) => setState(() => _picked = null),
          gestureRecognizers: _mapGestures,
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
        ),
        const Positioned(
          left: 12,
          top: 12,
          right: 12,
          child: _Legend([(_covGood, '2+ donors in 10 km'), (_covThin, 'thin coverage'), (_covNone, 'none in 25 km')]),
        ),
        if (sel != null)
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Material(
              color: Colors.white,
              elevation: 6,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  GroupBadge(sel.group, size: 44),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(sel.hospital, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text('${sel.label} · ${sel.units} units${s == null ? '' : ' · ${s['within10']} donors ≤10 km'}', style: const TextStyle(fontSize: 12)),
                      const SizedBox(height: 4),
                      Wrap(spacing: 6, children: [
                        urgencyPill(sel.urgency),
                        if (sel.verified) const Pill('Verified', color: ok, icon: Icons.verified) else const Pill('Unverified', color: amber),
                      ]),
                    ]),
                  ),
                  if (sel.verified) FilledButton(onPressed: () => widget.onMatch(sel), child: const Text('Find donors')),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

const dotColors = {
  'none': (Color(0xFFE04848), 'Not contacted'),
  'responded': (Color(0xFFD97706), 'Raised hand'),
  'called': (Color(0xFF9A8487), 'Called'),
  'no_answer': (Color(0xFFE7A8A0), 'No answer'),
  'coming': (Color(0xFF2563EB), 'Coming'),
  'donated': (Color(0xFF3F8F6F), 'Donated'),
  'declined': (Color(0xFFC9BDBB), 'Declined'),
  'unavailable': (Color(0xFFC9BDBB), 'Committed elsewhere'),
};
const _hospital = Color(0xFF2A1B1F);

/// Coordinator matching: hospital, search radius and donors coloured by outreach status.
/// Donor positions arrive rounded to ~1 km; tapping a dot shows name, group and distance.
class DonorsMap extends StatefulWidget {
  const DonorsMap({super.key, required this.at, required this.radiusKm, required this.donors, required this.status});
  final LatLng at;
  final double radiusKm;
  final List<Map<String, dynamic>> donors; // matches/outreach rows: donorId, displayName, group, latitude, longitude, distanceKm
  final Map<int, String> status;

  @override
  State<DonorsMap> createState() => _DonorsMapState();
}

class _DonorsMapState extends State<DonorsMap> {
  GoogleMapController? _map;
  Set<Marker> _markers = {};

  @override
  void initState() {
    super.initState();
    _draw();
  }

  @override
  void didUpdateWidget(DonorsMap old) {
    super.didUpdateWidget(old);
    _draw();
    if (old.radiusKm != widget.radiusKm) _fit();
  }

  void _fit() => _map?.animateCamera(CameraUpdate.newLatLngBounds(_around(widget.at, widget.radiusKm), 16));

  Future<void> _draw() async {
    // Rounded positions often coincide; fan co-located donors onto a small ring sized to the radius so all stay visible.
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final d in widget.donors) {
      groups.putIfAbsent('${d['latitude']},${d['longitude']}', () => []).add(d);
    }
    final spreadM = widget.radiusKm * 70;
    final markers = <Marker>{
      Marker(markerId: const MarkerId('hospital'), position: widget.at, icon: await dotIcon(_hospital, size: 22), anchor: const Offset(0.5, 0.5), zIndexInt: 10, infoWindow: const InfoWindow(title: 'Hospital')),
    };
    for (final g in groups.values) {
      for (var i = 0; i < g.length; i++) {
        final d = g[i];
        final a = 2 * pi * i / g.length - pi / 2, r = g.length > 1 ? spreadM : 0.0;
        final lat = (d['latitude'] as num).toDouble(), lng = (d['longitude'] as num).toDouble();
        markers.add(Marker(
          markerId: MarkerId('${d['donorId']}'),
          position: LatLng(lat + r * sin(a) / 111320, lng + r * cos(a) / (111320 * cos(lat * pi / 180))),
          icon: await dotIcon(dotColors[widget.status[d['donorId']] ?? 'none']!.$1, size: 18, ringWidth: 2),
          anchor: const Offset(0.5, 0.5),
          zIndexInt: 5,
          infoWindow: InfoWindow(title: d['displayName'], snippet: '${d['group']} · ${d['distanceKm']} km'),
        ));
      }
    }
    if (mounted) setState(() => _markers = markers);
  }

  @override
  Widget build(BuildContext context) {
    final used = {for (final d in widget.donors) widget.status[d['donorId']] ?? 'none'};
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _MapFrame(
        height: 300,
        child: GoogleMap(
          initialCameraPosition: CameraPosition(target: widget.at, zoom: 12),
          style: blushStyle,
          markers: _markers,
          circles: {
            Circle(
              circleId: const CircleId('radius'),
              center: widget.at,
              radius: widget.radiusKm * 1000,
              fillColor: const Color(0xFFE04848).withValues(alpha: 0.06),
              strokeColor: const Color(0xFFE04848).withValues(alpha: 0.45),
              strokeWidth: 2,
            ),
          },
          onMapCreated: (c) {
            _map = c;
            _fit();
          },
          gestureRecognizers: _mapGestures,
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
        ),
      ),
      const SizedBox(height: 8),
      _Legend([(_hospital, 'Hospital'), for (final k in dotColors.keys.where(used.contains)) (dotColors[k]!.$1, dotColors[k]!.$2)]),
    ]);
  }
}
