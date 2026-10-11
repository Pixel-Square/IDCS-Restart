import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

class OfflineStorageService extends ChangeNotifier {
  static final OfflineStorageService instance = OfflineStorageService._internal();
  factory OfflineStorageService() => instance;
  OfflineStorageService._internal();

  static const String _keyStudents = 'kr_offline_students_v1';
  static const String _keyCategories = 'kr_offline_categories_v1';
  static const String _keyIncidents = 'kr_offline_incidents_v1';
  static const String _keyLastSync = 'kr_offline_last_sync_v1';

  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  // In-memory caches for zero-latency lookups
  final Map<String, Map<String, dynamic>> _studentCache = {};
  final List<Map<String, dynamic>> _categoryCache = [];
  final List<Map<String, dynamic>> _offlineIncidentsCache = [];
  DateTime? _lastSyncTime;
  DateTime? get lastSyncTime => _lastSyncTime;

  bool _isSyncing = false;
  bool get isSyncing => _isSyncing;
  Timer? _autoSyncTimer;

  Future<SharedPreferences?> _getPrefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (e) {
      debugPrint('SharedPreferences not available (using in-memory): $e');
      return null;
    }
  }

  /// Initialize persistent storage and seed data
  Future<void> init() async {
    if (_isInitialized) return;

    try {
      final prefs = await _getPrefs();

      if (prefs != null) {
        // 1. Load cached students
        final studentsJson = prefs.getString(_keyStudents);
        if (studentsJson != null && studentsJson.isNotEmpty) {
          final List decoded = jsonDecode(studentsJson);
          for (final item in decoded) {
            if (item is Map) {
              final map = Map<String, dynamic>.from(item);
              final reg = (map['reg_no'] ?? '').toString().trim();
              if (reg.isNotEmpty) {
                _studentCache[reg.toUpperCase()] = map;
              }
            }
          }
        }

        // 2. Load cached categories
        final categoriesJson = prefs.getString(_keyCategories);
        if (categoriesJson != null && categoriesJson.isNotEmpty) {
          final List decoded = jsonDecode(categoriesJson);
          _categoryCache.clear();
          for (final item in decoded) {
            if (item is Map) {
              _categoryCache.add(Map<String, dynamic>.from(item));
            }
          }
        }

        // 3. Load queued offline incident submissions
        final incidentsJson = prefs.getString(_keyIncidents);
        if (incidentsJson != null && incidentsJson.isNotEmpty) {
          final List decoded = jsonDecode(incidentsJson);
          _offlineIncidentsCache.clear();
          for (final item in decoded) {
            if (item is Map) {
              _offlineIncidentsCache.add(Map<String, dynamic>.from(item));
            }
          }
        }

        // 4. Load last sync timestamp
        final syncStr = prefs.getString(_keyLastSync);
        if (syncStr != null) {
          _lastSyncTime = DateTime.tryParse(syncStr);
        }
      }

      // 5. If students directory has fewer than 100 students (e.g. initial launch or previous small seed),
      // immediately populate from the bundled offline_data.json
      if (_studentCache.length < 100 || _categoryCache.length < 5) {
        await _seedFromBundle();
      }

      _isInitialized = true;
      _startPeriodicAutoSync();
      notifyListeners();
    } catch (e) {
      debugPrint('OfflineStorageService init error: $e');
      await _seedFromBundle();
      _isInitialized = true;
      _startPeriodicAutoSync();
      notifyListeners();
    }
  }

  /// WhatsApp-like periodic auto-synchronization when network is available
  void _startPeriodicAutoSync() {
    _autoSyncTimer?.cancel();
    _autoSyncTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (_offlineIncidentsCache.isNotEmpty && !_isSyncing) {
        syncOfflineIncidentsToDatabase();
      }
    });
  }

  /// Load bundled offline data file containing all 2,950 active students and DC categories
  Future<void> _seedFromBundle() async {
    try {
      String? bundleStr;
      for (final p in ['assets/offline_data.json', 'offline_data.json']) {
        try {
          bundleStr = await rootBundle.loadString(p);
          if (bundleStr.isNotEmpty) break;
        } catch (_) {}
      }

      if (bundleStr != null && bundleStr.isNotEmpty) {
        final data = jsonDecode(bundleStr);

        if (data is Map) {
          final students = data['students'] as List?;
          if (students != null && students.isNotEmpty) {
            for (final s in students) {
              if (s is Map) {
                final map = Map<String, dynamic>.from(s);
                final reg = (map['reg_no'] ?? '').toString().trim();
                if (reg.isNotEmpty) {
                  _studentCache[reg.toUpperCase()] = map;
                }
              }
            }
            await _persistStudents();
          }

          final categories = data['categories'] as List?;
          if (categories != null && categories.isNotEmpty) {
            _categoryCache.clear();
            for (final c in categories) {
              if (c is Map) {
                _categoryCache.add(Map<String, dynamic>.from(c));
              }
            }
            await _persistCategories();
          }
        }
      }
    } catch (e) {
      debugPrint('Could not load offline_data.json: $e');
    }

      // Hardcoded fallback seed to ensure offline zero-failure guaranteed
      if (_studentCache.isEmpty) {
        _studentCache['2403811714821042'] = {
          'id': 1,
          'reg_no': '2403811714821042',
          'name': 'Rohit SK',
          'username': '@ROHIT S K',
          'department': 'AI&ML',
          'batch': '2024 (Sec A)',
          'section': 'Sec A',
          'profile_image_url': 'https://db.krgi.co.in/media/profile_images/2403811714821042.jpg',
          'status': 'ACTIVE',
        };
        _studentCache['24KRCTCS102'] = {
          'id': 2,
          'reg_no': '24KRCTCS102',
          'name': 'Arun Kumar V',
          'username': '@ARUN K',
          'department': 'Computer Science & Engg.',
          'batch': '2023 (Sec B)',
          'section': 'Sec B',
          'profile_image_url': 'https://db.krgi.co.in/media/profile_images/24KRCTCS102.jpg',
          'status': 'ACTIVE',
        };
      }
      if (_categoryCache.isEmpty) {
        _categoryCache.addAll([
          {
            'id': 1,
            'title': 'Uniform & ID Card Decorum',
            'code': 'DEC-UNI',
            'severity': 'LOW',
            'penalty_points': 5,
            'fine_amount': 0,
            'require_comment': false,
            'is_active': true,
          },
          {
            'id': 2,
            'title': 'Mobile Phone Usage in Academic Area',
            'code': 'DEC-MOB',
            'severity': 'MEDIUM',
            'penalty_points': 10,
            'fine_amount': 100,
            'require_comment': true,
            'is_active': true,
          },
          {
            'id': 3,
            'title': 'Unauthorized Campus Exit / Late Entry',
            'code': 'DEC-GATE',
            'severity': 'HIGH',
            'penalty_points': 15,
            'fine_amount': 200,
            'require_comment': true,
            'is_active': true,
          },
        ]);
      }
    }

  // ──────────────────────────── STUDENTS ────────────────────────────

  /// Lookup student by primary key Register Number (or barcode)
  Map<String, dynamic>? getStudent(String barcode) {
    final clean = barcode.trim().toUpperCase();
    if (clean.isEmpty) return null;

    // 1. Direct match on Register Number
    if (_studentCache.containsKey(clean)) {
      return Map<String, dynamic>.from(_studentCache[clean]!);
    }

    // 2. Match by clean digits
    final digits = clean.replaceAll(RegExp(r'\D'), '');
    if (digits.isNotEmpty) {
      for (final entry in _studentCache.entries) {
        final regDigits = entry.key.replaceAll(RegExp(r'\D'), '');
        if (regDigits == digits || (regDigits.isNotEmpty && digits.contains(regDigits))) {
          return Map<String, dynamic>.from(entry.value);
        }
      }
    }

    // 3. Substring match
    for (final entry in _studentCache.entries) {
      if (entry.key.contains(clean) || clean.contains(entry.key)) {
        return Map<String, dynamic>.from(entry.value);
      }
    }

    return null;
  }

  List<Map<String, dynamic>> getAllStudents() {
    return _studentCache.values.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// Save downloaded students into persistent storage
  Future<void> saveStudents(List<Map<String, dynamic>> students) async {
    for (final s in students) {
      final reg = (s['reg_no'] ?? '').toString().trim();
      if (reg.isNotEmpty) {
        _studentCache[reg.toUpperCase()] = Map<String, dynamic>.from(s);
      }
    }
    await _persistStudents();
    notifyListeners();
  }

  Future<void> _persistStudents() async {
    try {
      final prefs = await _getPrefs();
      if (prefs != null) {
        final list = _studentCache.values.toList();
        await prefs.setString(_keyStudents, jsonEncode(list));
      }
    } catch (e) {
      debugPrint('Error saving offline students: $e');
    }
  }

  // ──────────────────────────── CATEGORIES ────────────────────────────

  List<Map<String, dynamic>> getCategories() {
    return _categoryCache.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// Save downloaded categories into persistent storage
  Future<void> saveCategories(List<Map<String, dynamic>> categories) async {
    _categoryCache.clear();
    for (final c in categories) {
      _categoryCache.add(Map<String, dynamic>.from(c));
    }
    await _persistCategories();
    notifyListeners();
  }

  Future<void> _persistCategories() async {
    try {
      final prefs = await _getPrefs();
      if (prefs != null) {
        await prefs.setString(_keyCategories, jsonEncode(_categoryCache));
      }
    } catch (e) {
      debugPrint('Error saving offline categories: $e');
    }
  }

  // ────────────────────── OFFLINE INCIDENTS QUEUE ──────────────────────

  List<Map<String, dynamic>> getOfflineIncidents() {
    return _offlineIncidentsCache.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  int get pendingSyncCount => _offlineIncidentsCache.length;

  /// Add new offline recorded incident to local device storage
  Future<void> addOfflineIncident(Map<String, dynamic> incident) async {
    final offlineId = incident['offline_id'] ??
        'offline_${DateTime.now().millisecondsSinceEpoch}_${incident['reg_no'] ?? ''}';

    final entry = Map<String, dynamic>.from(incident);
    entry['offline_id'] = offlineId;
    entry['created_at'] ??= DateTime.now().toIso8601String();
    entry['status'] = 'OFFLINE_PENDING';
    entry['is_offline'] = true;

    // Place newest items at top
    _offlineIncidentsCache.insert(0, entry);
    await _persistIncidents();
    notifyListeners();
  }

  /// Remove synced or discarded incident
  Future<void> removeOfflineIncident(String offlineId) async {
    _offlineIncidentsCache.removeWhere((item) => item['offline_id'] == offlineId);
    await _persistIncidents();
    notifyListeners();
  }

  Future<void> _persistIncidents() async {
    try {
      final prefs = await _getPrefs();
      if (prefs != null) {
        await prefs.setString(_keyIncidents, jsonEncode(_offlineIncidentsCache));
      }
    } catch (e) {
      debugPrint('Error saving offline incidents: $e');
    }
  }

  /// Pull student directory and discipline categories from backend
  Future<Map<String, dynamic>> pullLatestDataFromBackend() async {
    _isSyncing = true;
    notifyListeners();

    int studentCount = 0;
    int categoryCount = 0;
    String? errorMessage;

    try {
      // 1. Pull Students Directory (All registered students, no photo needed)
      final students = await ApiService.fetchStudentDirectory();
      if (students.isNotEmpty) {
        await saveStudents(students);
        studentCount = students.length;
      } else if (_studentCache.length < 100) {
        // Fallback to bundled seed with all 2,950 students
        await _seedFromBundle();
        studentCount = _studentCache.length;
      } else {
        studentCount = _studentCache.length;
      }

      // 2. Pull Discipline Categories defined by DC Admin
      final categories = await ApiService.fetchDisciplineCategories();
      if (categories.isNotEmpty) {
        await saveCategories(categories);
        categoryCount = categories.length;
      } else if (_categoryCache.isEmpty) {
        await _seedFromBundle();
        categoryCount = _categoryCache.length;
      } else {
        categoryCount = _categoryCache.length;
      }

      _lastSyncTime = DateTime.now();
      final prefs = await _getPrefs();
      if (prefs != null) {
        await prefs.setString(_keyLastSync, _lastSyncTime!.toIso8601String());
      }
    } catch (e) {
      errorMessage = e.toString();
      debugPrint('Data pull failed: $e');
      if (_studentCache.length < 100 || _categoryCache.isEmpty) {
        await _seedFromBundle();
      }
    } finally {
      _isSyncing = false;
      notifyListeners();
    }

    return {
      'success': errorMessage == null,
      'students_count': studentCount > 0 ? studentCount : _studentCache.length,
      'categories_count': categoryCount > 0 ? categoryCount : _categoryCache.length,
      'error': errorMessage,
      'last_sync': _lastSyncTime?.toIso8601String(),
    };
  }

  /// In each logins check whether new data is added or not
  Future<Map<String, dynamic>> checkForUpdates() async {
    return await pullLatestDataFromBackend();
  }


  /// Sync all pending offline incidents to the real backend database
  Future<Map<String, dynamic>> syncOfflineIncidentsToDatabase() async {
    if (_offlineIncidentsCache.isEmpty) {
      return {'synced_count': 0, 'remaining_count': 0, 'success': true};
    }

    _isSyncing = true;
    notifyListeners();

    int syncedCount = 0;
    final List<String> successfullySyncedIds = [];

    try {
      final listCopy = List<Map<String, dynamic>>.from(_offlineIncidentsCache);

      for (final incident in listCopy) {
        final offlineId = incident['offline_id']?.toString() ?? '';

        final success = await ApiService.recordDisciplineIncident(
          regNo: incident['reg_no'] ?? '',
          studentName: incident['student_name'] ?? '',
          username: incident['username'] ?? '',
          departmentName: incident['department_name'] ?? '',
          batchName: incident['batch_name'] ?? '',
          sectionName: incident['section_name'] ?? '',
          category: incident['category'],
          categoryIds: incident['category_ids'] != null
              ? List<int>.from(incident['category_ids'])
              : null,
          categoryTitle: incident['category_title'] ?? '',
          remarks: incident['remarks'] ?? '',
          incidentDocument: incident['incident_document'] ?? incident['photo_base64'],
          reportedByName: incident['reported_by_name'],
          reportedByUsername: incident['reported_by_username'],
        );

        if (success) {
          successfullySyncedIds.add(offlineId);
          syncedCount++;
        }
      }

      // Remove successfully synced items
      if (successfullySyncedIds.isNotEmpty) {
        _offlineIncidentsCache.removeWhere(
          (item) => successfullySyncedIds.contains(item['offline_id']),
        );
        await _persistIncidents();
      }
    } catch (e) {
      debugPrint('Error syncing offline incidents: $e');
    } finally {
      _isSyncing = false;
      notifyListeners();
    }

    return {
      'success': syncedCount > 0 || _offlineIncidentsCache.isEmpty,
      'synced_count': syncedCount,
      'remaining_count': _offlineIncidentsCache.length,
    };
  }
}
