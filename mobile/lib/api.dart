// Thin client for the NestJS API, mirroring frontend/src/api.ts. Converts API enums (B_POSITIVE, CRITICAL…) to UI values (B+, critical…) here only.
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

// 10.0.2.2 is the host machine from the Android emulator; on a phone use adb reverse + localhost, or --dart-define=API_URL=http://<lan-ip>:3001/v1.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3001/v1');
const _storage = FlutterSecureStorage();

const groups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
const canReceive = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': groups,
};
String toGroup(String g) => g.replaceAll('_POSITIVE', '+').replaceAll('_NEGATIVE', '-');
String fromGroup(String g) => g.replaceAll('+', '_POSITIVE').replaceAll('-', '_NEGATIVE');
const _urg = {'ROUTINE': 'planned', 'URGENT': 'urgent', 'CRITICAL': 'critical'};
String fromUrgency(String u) => _urg.entries.firstWhere((e) => e.value == u).key;
const urgencyWindowHours = {'critical': 2, 'urgent': 6, 'planned': 24}; // auto-expiry, same as web

class ApiError implements Exception {
  ApiError(this.message, [this.status]);
  final String message;
  final int? status;
  @override
  String toString() => message;
}

class Session {
  Session(this.email, this.role, this.name);
  final String email, role; // role: donor | coordinator
  final String? name;
  bool get isDonor => role == 'donor';
  Map<String, dynamic> toJson() => {'email': email, 'role': role, 'name': name};
  static Session fromJson(Map<String, dynamic> j) => Session(j['email'], j['role'], j['name']);
}

/// Seconds-since-epoch expiry from a JWT's payload, or 0 if unreadable. Not verified: the server still checks every call.
int jwtExpiry(String token) {
  try {
    return jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(token.split('.')[1]))))['exp'] as int;
  } catch (_) {
    return 0;
  }
}

class BloodRequest {
  BloodRequest.fromJson(Map<String, dynamic> j, [String? forced])
      : id = j['id'],
        group = toGroup(j['bloodGroup']),
        units = j['units'],
        hospital = j['hospitalName'],
        area = j['area'],
        lat = (j['latitude'] as num).toDouble(),
        lng = (j['longitude'] as num).toDouble(),
        urgency = _urg[j['urgency']]!,
        verified = j['verified'] ?? false,
        expiresAt = DateTime.parse(j['expiresAt']).toLocal(),
        createdAt = DateTime.parse(j['createdAt']).toLocal(),
        status = forced ?? (j['status'] as String?)?.toLowerCase() ?? 'open',
        responded = j['responded'] ?? 0,
        coming = j['coming'] ?? 0,
        donated = j['donated'] ?? 0,
        unitsReceived = j['unitsReceived'] ?? 0,
        closedAt = j['closedAt'] == null ? null : DateTime.parse(j['closedAt']).toLocal();
  final int id, units, responded, coming, donated, unitsReceived;
  final String group, hospital, area, urgency, status;
  final double lat, lng;
  final bool verified;
  final DateTime expiresAt, createdAt;
  final DateTime? closedAt;

  String get label => 'RQ-${id.toString().padLeft(4, '0')}';
  String get liveStatus => status == 'open' && expiresAt.isBefore(DateTime.now()) ? 'expired' : status;
}

class Drive {
  Drive.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        title = j['title'],
        organizer = j['organizer'],
        venue = j['venue'],
        area = j['area'],
        lat = (j['latitude'] as num).toDouble(),
        lng = (j['longitude'] as num).toDouble(),
        startsAt = DateTime.parse(j['startsAt']).toLocal(),
        endsAt = DateTime.parse(j['endsAt']).toLocal(),
        capacity = j['capacity'],
        rsvpCount = j['rsvpCount'] ?? 0,
        distanceKm = (j['distanceKm'] as num?)?.toDouble();
  final int id, rsvpCount;
  final int? capacity;
  final String title, organizer, venue, area;
  final double lat, lng;
  final DateTime startsAt, endsAt;
  final double? distanceKm;
}

class Api {
  static String? _token;
  static void Function() onUnauthorized = () {};

  static Future<dynamic> call(String method, String path, [Object? body]) async {
    final req = http.Request(method, Uri.parse('$apiUrl$path'))
      ..headers['Content-Type'] = 'application/json'
      ..headers.addAll(_token == null ? {} : {'Authorization': 'Bearer $_token'});
    if (body != null) req.body = jsonEncode(body);
    final http.Response res;
    try {
      res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 15)));
    } catch (_) {
      throw ApiError("Can't reach the server. Check your connection.");
    }
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode == 401 && _token != null) {
      await signOut();
      onUnauthorized();
    }
    if (res.statusCode >= 400) {
      final msg = data is Map ? data['message'] : null;
      throw ApiError(msg is List ? msg.join(', ') : msg?.toString() ?? 'Request failed (${res.statusCode})', res.statusCode);
    }
    return data;
  }

  /* ---------- session ---------- */
  static Future<Session> _start(Map<String, dynamic> r) async {
    _token = r['accessToken'];
    final s = await whoAmI();
    // Token and who it belongs to in one key, so launch needs a single storage read and no network.
    await _storage.write(key: 'session', value: jsonEncode({'token': _token, ...s.toJson()}));
    return s;
  }

  /// Offline restore: the saved session if its token is still valid for a minute or more, else null (go to login).
  static Future<Session?> restore() async {
    final raw = await _storage.read(key: 'session');
    if (raw == null) return null;
    final j = jsonDecode(raw) as Map<String, dynamic>;
    if (jwtExpiry(j['token']) * 1000 < DateTime.now().add(const Duration(minutes: 1)).millisecondsSinceEpoch) {
      await signOut();
      return null;
    }
    _token = j['token'];
    return Session.fromJson(j);
  }

  static Future<void> signOut() async {
    _token = null;
    await _storage.delete(key: 'session');
  }

  static Future<Session> login(String email, String password) async =>
      _start(await call('POST', '/auth/login', {'email': email, 'password': password}));

  static Future<Session> register({
    required String email, required String password, required String name, required String group,
    required String phone, required String area, required double lat, required double lng, DateTime? lastDonationAt,
  }) async =>
      _start(await call('POST', '/auth/register', {
        'email': email, 'password': password, 'displayName': name, 'bloodGroup': fromGroup(group), 'phone': phone,
        'area': area, 'latitude': lat, 'longitude': lng,
        if (lastDonationAt != null) 'lastDonationAt': lastDonationAt.toUtc().toIso8601String(),
      }));

  static Future<Session> whoAmI() async {
    final m = await call('GET', '/auth/me');
    return Session(m['email'], (m['role'] as String).toLowerCase(), m['donor']?['displayName']);
  }

  /* ---------- requests ---------- */
  static Future<List<BloodRequest>> requests() async => [for (final r in await call('GET', '/blood-requests')) BloodRequest.fromJson(r)];
  static Future<List<BloodRequest>> closedRequests() async => [for (final r in await call('GET', '/blood-requests/closed')) BloodRequest.fromJson(r)];
  static Future<BloodRequest> createRequest({
    required String group, required int units, required String hospital, required String area,
    required double lat, required double lng, required String urgency,
  }) async =>
      BloodRequest.fromJson(await call('POST', '/blood-requests', {
        'bloodGroup': fromGroup(group), 'units': units, 'hospitalName': hospital, 'area': area, 'latitude': lat, 'longitude': lng,
        'urgency': fromUrgency(urgency),
        'expiresAt': DateTime.now().add(Duration(hours: urgencyWindowHours[urgency]!)).toUtc().toIso8601String(),
      }));
  static Future<BloodRequest> updateRequest(int id, {int? units, int? unitsReceived, String? urgency, DateTime? expiresAt}) async =>
      BloodRequest.fromJson(await call('PATCH', '/blood-requests/$id', {
        'units': ?units,
        'unitsReceived': ?unitsReceived,
        if (urgency != null) 'urgency': fromUrgency(urgency),
        if (expiresAt != null) 'expiresAt': expiresAt.toUtc().toIso8601String(),
      }));
  static Future<BloodRequest> verify(int id) async => BloodRequest.fromJson(await call('POST', '/blood-requests/$id/verify'));
  static Future<BloodRequest> fulfill(int id) async => BloodRequest.fromJson(await call('POST', '/blood-requests/$id/fulfill'), 'fulfilled');
  static Future<BloodRequest> cancel(int id) async => BloodRequest.fromJson(await call('POST', '/blood-requests/$id/cancel'), 'cancelled');
  static Future<BloodRequest> respond(int id) async => BloodRequest.fromJson(await call('POST', '/blood-requests/$id/respond'));
  static Future<BloodRequest> withdraw(int id) async => BloodRequest.fromJson(await call('DELETE', '/blood-requests/$id/respond'));
  static Future<Map<int, String>> myResponses() async =>
      {for (final r in await call('GET', '/blood-requests/responses/me')) r['requestId'] as int: (r['status'] as String).toLowerCase()};
  static Future<Map<int, Map<String, dynamic>>> supply() async =>
      {for (final r in await call('GET', '/blood-requests/supply')) r['id'] as int: r};

  // Coordinator matching & outreach
  static Future<List<Map<String, dynamic>>> matches(int id, int maxKm) async => [
        for (final m in await call('POST', '/blood-requests/$id/matches?maxDistanceKm=$maxKm'))
          {...m, 'group': toGroup(m['bloodGroup'])},
      ];
  // Released one donor at a time and logged by the API.
  static Future<Map<String, dynamic>> contact(int id, int donorId) async =>
      Map<String, dynamic>.from(await call('POST', '/blood-requests/$id/matches/$donorId/contact'));
  static Future<List<Map<String, dynamic>>> outreach(int id) async => [
        for (final o in await call('GET', '/blood-requests/$id/outreach'))
          {...o, 'group': toGroup(o['bloodGroup']), 'status': (o['status'] as String).toLowerCase()},
      ];
  static Future<BloodRequest> setOutreach(int id, int donorId, String status) async =>
      BloodRequest.fromJson(await call('PUT', '/blood-requests/$id/outreach/$donorId', {'status': status.toUpperCase()}));

  /* ---------- donor ---------- */
  static Future<Map<String, dynamic>> me() async => _donor(await call('GET', '/donors/me'));
  static Map<String, dynamic> _donor(dynamic d) =>
      {...d, 'group': toGroup(d['bloodGroup']), 'latitude': (d['latitude'] as num).toDouble(), 'longitude': (d['longitude'] as num).toDouble()};
  static Future<Map<String, dynamic>> updateMe(Map<String, dynamic> patch) async => _donor(await call('PATCH', '/donors/me', patch));
  static Future<void> setPushToken(String token) async => call('PUT', '/donors/me/push-token', {'token': token});
  static Future<void> clearPushToken() async => call('DELETE', '/donors/me/push-token');
  static Future<Map<String, dynamic>> eligibility() async => Map<String, dynamic>.from(await call('GET', '/donors/me/eligibility'));
  static Future<List<dynamic>> donations() async => await call('GET', '/donors/me/donations');
  static Future<Map<String, dynamic>> addDonation(DateTime at) async =>
      _donor(await call('POST', '/donors/me/donations', {'donatedAt': at.toUtc().toIso8601String()}));
  static Future<Map<String, dynamic>> removeDonation(int id) async => _donor(await call('DELETE', '/donors/me/donations/$id'));

  /* ---------- drives ---------- */
  static Future<List<Drive>> drives({double? lat, double? lng}) async =>
      [for (final d in await call('GET', '/drives${lat == null ? '' : '?lat=$lat&lng=$lng'}')) Drive.fromJson(d)];
  static Future<Drive> createDrive(Map<String, dynamic> d) async => Drive.fromJson(await call('POST', '/drives', d));
  static Future<Set<int>> myRsvps() async => {for (final id in await call('GET', '/drives/rsvps/me')) id as int};
  static Future<Drive> rsvp(int id) async => Drive.fromJson(await call('POST', '/drives/$id/rsvp'));
  static Future<Drive> cancelRsvp(int id) async => Drive.fromJson(await call('DELETE', '/drives/$id/rsvp'));
}
