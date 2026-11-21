import 'dart:math';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

// Tokens copied from frontend/src/index.css (HSL converted to hex) so the app matches the web.
const brand = Color(0xFFD93A3A); // --blood / --primary
const bloodDeep = Color(0xFF772230);
const bloodSoft = Color(0xFFFDEAE7);
const ok = Color(0xFF418B70);
const peach = Color(0xFFFCDBC5);
const amber = Color(0xFFD08A0E);
const _bg = Color(0xFFFFF9F7);
const _fg = Color(0xFF2C1C21);
const _muted = Color(0xFFF9F2F0);
const _mutedFg = Color(0xFF816E75);
const _secondary = Color(0xFFFBEBE9);
const _secondaryFg = Color(0xFF682732);
const _border = Color(0xFFF1E1DF);
const _input = Color(0xFFEDD7D4);

// Always light: the web app has no dark mode and this is its look.
ThemeData appTheme() {
  final cs = ColorScheme.light(
    primary: brand, onPrimary: Colors.white,
    primaryContainer: bloodSoft, onPrimaryContainer: bloodDeep,
    secondary: bloodDeep, onSecondary: Colors.white,
    secondaryContainer: _secondary, onSecondaryContainer: _secondaryFg,
    tertiary: ok, onTertiary: Colors.white,
    error: brand, onError: Colors.white,
    surface: _bg, onSurface: _fg, onSurfaceVariant: _mutedFg,
    surfaceContainerLowest: Colors.white, surfaceContainerLow: Colors.white,
    surfaceContainer: _muted, surfaceContainerHigh: _muted, surfaceContainerHighest: _secondary,
    outline: _input, outlineVariant: _border,
  );
  final base = ThemeData(colorScheme: cs, scaffoldBackgroundColor: _bg);
  final text = GoogleFonts.figtreeTextTheme(base.textTheme).apply(bodyColor: _fg, displayColor: _fg);
  TextStyle? display(TextStyle? s) => GoogleFonts.fraunces(textStyle: s, fontWeight: FontWeight.w500, letterSpacing: -0.5);
  final round = RoundedRectangleBorder(borderRadius: BorderRadius.circular(99));
  return base.copyWith(
    textTheme: text.copyWith(
      displaySmall: display(text.displaySmall),
      headlineMedium: display(text.headlineMedium),
      headlineSmall: display(text.headlineSmall),
      titleLarge: display(text.titleLarge),
    ),
    appBarTheme: AppBarTheme(backgroundColor: _bg, surfaceTintColor: Colors.transparent, scrolledUnderElevation: 0, foregroundColor: _fg),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: _input)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: _input)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: brand, width: 2)),
    ),
    // Pill-shaped buttons like the web Btn.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(64, 50), shape: round, textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600, fontSize: 15)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(64, 50), shape: round, side: BorderSide(color: _input), backgroundColor: Colors.white, foregroundColor: _fg),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: _muted, selectedBackgroundColor: brand, selectedForegroundColor: Colors.white,
        side: BorderSide.none, shape: round, textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: _muted, selectedColor: brand, side: BorderSide.none, shape: round,
      labelStyle: GoogleFonts.figtree(color: _fg, fontWeight: FontWeight.w600),
      secondaryLabelStyle: GoogleFonts.figtree(color: Colors.white, fontWeight: FontWeight.w700),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: bloodSoft,
      surfaceTintColor: Colors.transparent,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? brand : _mutedFg)),
      labelTextStyle: WidgetStateProperty.resolveWith((s) =>
          GoogleFonts.figtree(fontSize: 12, fontWeight: FontWeight.w600, color: s.contains(WidgetState.selected) ? brand : _mutedFg)),
    ),
    switchTheme: SwitchThemeData(trackOutlineColor: WidgetStateProperty.all(Colors.transparent)),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: Colors.white, surfaceTintColor: Colors.transparent),
    dialogTheme: const DialogThemeData(backgroundColor: Colors.white, surfaceTintColor: Colors.transparent),
    popupMenuTheme: PopupMenuThemeData(color: Colors.white, surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
    floatingActionButtonTheme: FloatingActionButtonThemeData(backgroundColor: brand, foregroundColor: Colors.white, shape: round),
    dividerTheme: DividerThemeData(color: _border),
    snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: _fg, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
  );
}

/// The web `.soft-card`: white, 28px radius, faint white border and a soft red-tinted shadow.
class SoftCard extends StatelessWidget {
  const SoftCard({super.key, required this.child, this.color});
  final Widget child;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: color ?? Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: Colors.white.withValues(alpha: 0.7)),
          boxShadow: [
            BoxShadow(color: const Color(0xFF6B2E38).withValues(alpha: 0.04), blurRadius: 2, offset: const Offset(0, 1)),
            BoxShadow(color: const Color(0xFFB82E2E).withValues(alpha: 0.18), blurRadius: 40, spreadRadius: -18, offset: const Offset(0, 18)),
          ],
        ),
        child: Material(type: MaterialType.transparency, borderRadius: BorderRadius.circular(28), clipBehavior: Clip.antiAlias, child: child),
      );
}

PageRouteBuilder<T> fade<T>(Widget page) => PageRouteBuilder<T>(
      transitionDuration: const Duration(milliseconds: 350),
      pageBuilder: (_, _, _) => page,
      transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
    );

/// Floating toast with an icon; errors are red and buzz harder.
void toast(BuildContext context, Object msg, {bool error = false}) {
  error ? HapticFeedback.heavyImpact() : HapticFeedback.lightImpact();
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      backgroundColor: error ? brand : _fg,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      content: Row(children: [
        Icon(error ? Icons.error_outline_rounded : Icons.check_circle_rounded, color: Colors.white, size: 22),
        const SizedBox(width: 12),
        Expanded(child: Text('$msg', style: GoogleFonts.figtree(color: Colors.white, fontWeight: FontWeight.w600))),
      ]),
    ));
}

/// Runs an action, shows success/error toasts; returns the result or null on failure.
Future<T?> attempt<T>(BuildContext context, Future<T> Function() run, [String? success]) async {
  try {
    final r = await run();
    if (success != null && context.mounted) toast(context, success);
    return r;
  } catch (e) {
    if (context.mounted) toast(context, e, error: true);
    return null;
  }
}

/// Pulsing blood-drop mark, mirrors the web Drop component.
class Drop extends StatelessWidget {
  const Drop({super.key, this.size = 56});
  final double size;

  @override
  Widget build(BuildContext context) => Icon(Icons.water_drop_rounded, size: size, color: brand)
      .animate(onPlay: (c) => c.repeat(reverse: true))
      .scaleXY(begin: 0.92, end: 1.05, duration: 900.ms, curve: Curves.easeInOut);
}

class GroupBadge extends StatelessWidget {
  const GroupBadge(this.group, {super.key, this.size = 48});
  final String group;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: brand, borderRadius: BorderRadius.circular(size / 3)),
        child: Text(group, style: GoogleFonts.fraunces(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.36)),
      );
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, required this.color, this.icon, this.filled = false});
  final String text;
  final Color color;
  final IconData? icon;
  final bool filled;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: filled ? color : color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: filled ? Colors.white : color), const SizedBox(width: 4)],
          Text(text, style: TextStyle(color: filled ? Colors.white : color, fontWeight: FontWeight.w700, fontSize: 12)),
        ]),
      );
}

Pill urgencyPill(String u) => switch (u) {
      'critical' => const Pill('Critical', color: brand, icon: Icons.bolt, filled: true),
      'urgent' => const Pill('Urgent', color: amber, icon: Icons.schedule),
      _ => const Pill('Planned', color: Colors.blueGrey),
    };

Pill statusPill(String s) => switch (s) {
      'fulfilled' => const Pill('Fulfilled', color: ok, icon: Icons.check),
      'cancelled' => const Pill('Cancelled', color: Colors.grey),
      'expired' => const Pill('Expired', color: Colors.grey, icon: Icons.timer_off_outlined),
      _ => const Pill('Open', color: brand),
    };

/// Big serif heading with a small kicker above it, like the web SectionHead.
class SectionHead extends StatelessWidget {
  const SectionHead({super.key, this.kicker, required this.title, this.sub});
  final String? kicker, sub;
  final String title;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (kicker != null) Text(kicker!.toUpperCase(), style: t.labelMedium?.copyWith(color: brand, letterSpacing: 1.2, fontWeight: FontWeight.w700)),
      Text(title, style: t.headlineMedium),
      if (sub != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(sub!, style: t.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant))),
    ]);
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key, this.icon = Icons.water_drop_outlined});
  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 56, horizontal: 24),
        child: Column(children: [
          Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(color: bloodSoft, shape: BoxShape.circle),
            child: Icon(icon, size: 32, color: brand),
          ).animate().scale(curve: Curves.easeOutBack, duration: 500.ms),
          const SizedBox(height: 14),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: _mutedFg, fontSize: 15)),
        ]),
      ).animate().fadeIn();
}

/// Loads data with a spinner, error+retry, and pull-to-refresh.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;

  @override
  State<Loader<T>> createState() => LoaderState<T>();
}

class LoaderState<T> extends State<Loader<T>> {
  T? _data;
  Object? _error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final d = await widget.load();
      if (mounted) setState(() { _data = d; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_data != null) return RefreshIndicator(onRefresh: reload, child: widget.builder(context, _data as T, reload));
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          EmptyState('$_error', icon: Icons.cloud_off),
          OutlinedButton(onPressed: () { setState(() => _error = null); reload(); }, child: const Text('Try again')),
        ]),
      );
    }
    return const Skeleton();
  }
}

/// Fades+slides list children in one after another.
List<Widget> stagger(List<Widget> children) =>
    children.animate(interval: 50.ms).fadeIn(duration: 350.ms).slideY(begin: 0.12, curve: Curves.easeOutCubic);

double distanceKm(double aLat, double aLng, double bLat, double bLng) {
  const r = 6371.0;
  double rad(double d) => d * pi / 180;
  final dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  final h = pow(sin(dLat / 2), 2) + cos(rad(aLat)) * cos(rad(bLat)) * pow(sin(dLng / 2), 2);
  return (2 * r * asin(sqrt(h)) * 10).round() / 10;
}

/// Device location rounded to ~100 m (we never store a donor's exact spot).
Future<({double lat, double lng})> currentLocation() async {
  if (!await Geolocator.isLocationServiceEnabled()) throw 'Turn on location services';
  var p = await Geolocator.checkPermission();
  if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
  if (p == LocationPermission.denied || p == LocationPermission.deniedForever) throw 'Location permission denied';
  final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium));
  double round(double v) => (v * 1000).round() / 1000;
  return (lat: round(pos.latitude), lng: round(pos.longitude));
}

String fmtDate(DateTime d) => DateFormat('d MMM yyyy').format(d);
String fmtDateTime(DateTime d) => DateFormat('EEE d MMM · h:mm a').format(d);

String timeLeft(DateTime at) {
  final d = at.difference(DateTime.now());
  if (d.isNegative) return 'closed';
  if (d.inHours >= 24) return '${d.inDays}d ${d.inHours % 24}h left';
  if (d.inMinutes >= 60) return '${d.inHours}h ${d.inMinutes % 60}m left';
  return '${d.inMinutes}m left';
}

String ago(DateTime at) {
  final d = DateTime.now().difference(at);
  if (d.inDays > 0) return '${d.inDays}d ago';
  if (d.inHours > 0) return '${d.inHours}h ago';
  return '${max(1, d.inMinutes)}m ago';
}

/// Shimmering placeholder cards shown while a tab loads.
class Skeleton extends StatelessWidget {
  const Skeleton({super.key});

  @override
  Widget build(BuildContext context) {
    Widget bar(double w, double h) => Container(width: w, height: h, decoration: BoxDecoration(color: _muted, borderRadius: BorderRadius.circular(h / 2)));
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      children: [
        Align(alignment: Alignment.centerLeft, child: bar(90, 12)),
        const SizedBox(height: 10),
        Align(alignment: Alignment.centerLeft, child: bar(240, 30)),
        const SizedBox(height: 24),
        for (var i = 0; i < 3; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: SoftCard(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(width: 48, height: 48, decoration: BoxDecoration(color: _muted, borderRadius: BorderRadius.circular(16))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      bar(160, 14),
                      const SizedBox(height: 8),
                      bar(110, 10),
                      const SizedBox(height: 18),
                      bar(double.infinity, 40),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
      ],
    ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 1200.ms, color: Colors.white.withValues(alpha: 0.7));
  }
}

/// Segmented switch with a red pill that slides to the selected tab.
class PillTabs extends StatelessWidget {
  const PillTabs({super.key, required this.labels, required this.index, required this.onChanged});
  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Container(
        height: 50,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: _muted, borderRadius: BorderRadius.circular(99), border: Border.all(color: _border)),
        child: LayoutBuilder(builder: (context, box) {
          final w = box.maxWidth / labels.length;
          return Stack(children: [
            AnimatedPositioned(
              duration: const Duration(milliseconds: 320),
              curve: Curves.easeOutCubic,
              left: index * w,
              top: 0,
              bottom: 0,
              width: w,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: brand,
                  borderRadius: BorderRadius.circular(99),
                  boxShadow: [BoxShadow(color: brand.withValues(alpha: 0.35), blurRadius: 12, offset: const Offset(0, 4))],
                ),
              ),
            ),
            Row(children: [
              for (var i = 0; i < labels.length; i++)
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: i == index,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        onChanged(i);
                      },
                      child: Center(
                        child: AnimatedDefaultTextStyle(
                          duration: const Duration(milliseconds: 200),
                          style: GoogleFonts.figtree(fontWeight: FontWeight.w700, fontSize: 14, color: i == index ? Colors.white : _mutedFg),
                          child: Text(labels[i], maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    ),
                  ),
                ),
            ]),
          ]);
        }),
      );
}

typedef NavItem = ({IconData icon, IconData active, String label});

/// Floating frosted-glass bottom bar; the active tab expands into a red pill with its label.
class FloatingNav extends StatelessWidget {
  const FloatingNav({super.key, required this.items, required this.index, required this.onChanged});
  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onChanged;

  static const height = 68.0;

  @override
  Widget build(BuildContext context) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(99),
              boxShadow: [
                BoxShadow(color: const Color(0xFFB82E2E).withValues(alpha: 0.16), blurRadius: 32, offset: const Offset(0, 12)),
                BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 4, offset: const Offset(0, 1)),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                child: Container(
                  height: height,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.82),
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: Colors.white),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [for (var i = 0; i < items.length; i++) _item(items[i], i == index, () => onChanged(i))],
                  ),
                ),
              ),
            ),
          ),
        ),
      );

  Widget _item(NavItem it, bool selected, VoidCallback onTap) => Semantics(
        button: true,
        selected: selected,
        label: it.label,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 350),
            curve: Curves.easeOutCubic,
            padding: EdgeInsets.symmetric(horizontal: selected ? 20 : 16, vertical: 12),
            decoration: BoxDecoration(color: selected ? brand : Colors.transparent, borderRadius: BorderRadius.circular(99)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              AnimatedScale(
                scale: selected ? 1.08 : 1,
                duration: const Duration(milliseconds: 300),
                child: Icon(selected ? it.active : it.icon, size: 24, color: selected ? Colors.white : _mutedFg),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 350),
                curve: Curves.easeOutCubic,
                child: selected
                    ? Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Text(it.label, style: GoogleFonts.figtree(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                      )
                    : const SizedBox.shrink(),
              ),
            ]),
          ),
        ),
      );
}

/// Bottom padding for scrolling lists so the last item clears the floating nav.
const navClearance = FloatingNav.height + 48;

/// Tab body with an optional floating action button kept above the floating nav.
class FabStack extends StatelessWidget {
  const FabStack({super.key, required this.body, this.fab});
  final Widget body;
  final Widget? fab;

  @override
  Widget build(BuildContext context) => Stack(children: [
        Positioned.fill(child: body),
        if (fab != null) Positioned(right: 20, bottom: MediaQuery.paddingOf(context).bottom + 16, child: fab!),
      ]);
}
