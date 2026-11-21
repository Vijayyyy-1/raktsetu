import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../api.dart';
import '../ui.dart';
import 'shell.dart';

void enterApp(BuildContext context, Session s) =>
    Navigator.of(context).pushAndRemoveUntil(fade(Shell(session: s)), (_) => false);

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _busy = true; _error = null; });
    try {
      final s = await Api.login(_email.text.trim(), _password.text);
      if (mounted) enterApp(context, s);
    } catch (e) {
      setState(() => _error = e is ApiError && e.status == 401 ? 'Wrong email or password' : '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: AutofillGroup(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 64, 24, 24),
            children: stagger([
              const Drop(),
              const SizedBox(height: 16),
              Text('Rakt Sethu', style: t.textTheme.displaySmall, textAlign: TextAlign.center),
              Text('A bridge of blood, donor to patient', style: t.textTheme.bodyLarge, textAlign: TextAlign.center),
              const SizedBox(height: 40),
              TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], textInputAction: TextInputAction.next),
              const SizedBox(height: 16),
              TextField(controller: _password, decoration: const InputDecoration(labelText: 'Password'), obscureText: true, autofillHints: const [AutofillHints.password], onSubmitted: (_) => _login()),
              const SizedBox(height: 24),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(_error!, style: TextStyle(color: t.colorScheme.error)).animate().shakeX(hz: 5, amount: 4),
                ),
              FilledButton(
                onPressed: _busy ? null : _login,
                child: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in'),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen())),
                child: const Text('New donor? Join the registry'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController();
  final _area = TextEditingController();
  String? _group;
  ({double lat, double lng})? _loc;
  DateTime? _lastDonation;
  bool _busy = false, _locating = false;

  Future<void> _locate() async {
    setState(() => _locating = true);
    final loc = await attempt(context, currentLocation);
    if (mounted) setState(() { _loc = loc ?? _loc; _locating = false; });
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (_group == null) return toast(context, 'Pick your blood group', error: true);
    if (_loc == null) return toast(context, 'Share your location so we can match you to nearby requests', error: true);
    setState(() => _busy = true);
    final s = await attempt(context, () => Api.register(
          email: _email.text.trim(), password: _password.text, name: _name.text.trim(), group: _group!,
          phone: _phone.text.trim(), area: _area.text.trim(), lat: _loc!.lat, lng: _loc!.lng, lastDonationAt: _lastDonation,
        ));
    if (!mounted) return;
    setState(() => _busy = false);
    if (s != null) enterApp(context, s);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    const gap = SizedBox(height: 14);
    return Scaffold(
      appBar: AppBar(),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
          children: stagger([
            const SectionHead(kicker: 'Join the registry', title: 'Become a donor', sub: 'Coordinators only see your details when a patient near you needs your group.'),
            const SizedBox(height: 24),
            TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Full name'), textCapitalization: TextCapitalization.words,
                validator: (v) => (v ?? '').trim().length < 2 ? 'Enter your name' : null),
            gap,
            TextFormField(controller: _email, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress,
                validator: (v) => RegExp(r'^\S+@\S+\.\S+$').hasMatch(v ?? '') ? null : 'Enter a valid email'),
            gap,
            TextFormField(controller: _password, decoration: const InputDecoration(labelText: 'Password', helperText: 'At least 10 characters'), obscureText: true,
                validator: (v) => (v ?? '').length < 10 ? 'At least 10 characters' : null),
            gap,
            TextFormField(controller: _phone, decoration: const InputDecoration(labelText: 'Phone'), keyboardType: TextInputType.phone,
                validator: (v) => RegExp(r'^\+?[0-9 ()-]{7,20}$').hasMatch(v ?? '') ? null : 'Enter a valid phone number'),
            const SizedBox(height: 20),
            Text('Blood group', style: t.textTheme.titleSmall),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.6,
              children: [
                for (final g in groups)
                  ChoiceChip(
                    label: SizedBox(width: double.infinity, child: Text(g, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700))),
                    selected: _group == g,
                    onSelected: (_) => setState(() => _group = g),
                    showCheckmark: false,
                  ),
              ],
            ),
            const SizedBox(height: 20),
            TextFormField(controller: _area, decoration: const InputDecoration(labelText: 'Area / locality', hintText: 'e.g. Kothrud, Pune'),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Enter your area' : null),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _locating ? null : _locate,
              icon: Icon(_loc == null ? Icons.my_location : Icons.check_circle, color: _loc == null ? null : ok),
              label: Text(_locating ? 'Locating…' : _loc == null ? 'Use my current location' : 'Location saved (approx.)'),
            ),
            gap,
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event),
              title: const Text('Last donation (optional)'),
              subtitle: Text(_lastDonation == null ? 'Never / not sure' : fmtDate(_lastDonation!)),
              trailing: _lastDonation == null ? null : IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _lastDonation = null)),
              onTap: () async {
                final d = await showDatePicker(context: context, firstDate: DateTime(2000), lastDate: DateTime.now(), initialDate: DateTime.now());
                if (d != null) setState(() => _lastDonation = d);
              },
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Creating account…' : 'Join as a donor')),
          ]),
        ),
      ),
    );
  }
}
