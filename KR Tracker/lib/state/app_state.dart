import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';

class AppState extends ChangeNotifier {
  static final AppState instance = AppState._internal();
  factory AppState() => instance;
  AppState._internal();

  static const String _keySessionActive = 'kr_session_active_v2';
  static const String _keySessionToken = 'kr_session_token_v2';
  static const String _keySessionUser = 'kr_session_user_v2';
  static const String _keySessionPrimaryRole = 'kr_session_primary_role_v2';
  static const String _keySessionRoleTitle = 'kr_session_role_title_v2';
  static const String _keySessionBackendRoles = 'kr_session_backend_roles_v2';

  // Default mode is strictly Light Mode as requested
  ThemeMode _themeMode = ThemeMode.light;
  ThemeMode get themeMode => _themeMode;
  bool get isDarkMode => _themeMode == ThemeMode.dark;

  // Authentication & Session
  bool _isAuthenticated = false;
  bool get isAuthenticated => _isAuthenticated;


  // Active Role ('Student' or 'Staff')
  String _role = 'Student';
  String get role => _role;

  int _activeNavIndex = 0;
  int get activeNavIndex => _activeNavIndex;
  void setActiveNavIndex(int index) {
    _activeNavIndex = index;
    notifyListeners();
  }

  // Formatted human-readable role title (e.g. 'Discipline Committee', 'HOD', 'Student')
  String _roleTitle = 'Student';
  String get roleTitle => _roleTitle;

  // Real backend roles returned from db.krgi.co.in
  List<String> _backendRoles = [];
  List<String> get backendRoles => _backendRoles;

  // User Profile
  String _userName = 'Student User';
  String get userName => _userName;

  String _studentId = '';
  String get studentId => _studentId;

  String _email = '';
  String get email => _email;

  String _department = 'Campus Department';
  String get department => _department;

  String _college = 'KRCT (K. Ramakrishnan College of Tech)';
  String get college => _college;

  String? _profileImageUrl;
  String? get profileImageUrl => _profileImageUrl;

  Map<String, dynamic>? _userProfile;
  Map<String, dynamic>? get userProfile => _userProfile;

  // GatePass Live Status: 'APPROVED', 'IN-CAMPUS', 'OUT-PASS', 'PENDING'
  String _gateStatus = 'APPROVED';
  String get gateStatus => _gateStatus;

  // Discipline & Decorum Metrics
  final double _meritScore = 98.5; // percentage
  double get meritScore => _meritScore;

  final int _violationsCount = 0;
  int get violationsCount => _violationsCount;

  int _gatePassCount = 14;
  int get gatePassCount => _gatePassCount;

  // Recent Gate Pass records
  final List<Map<String, dynamic>> _recentPasses = [
    {
      'title': 'Academic Library Outpass',
      'time': 'Today, 04:30 PM',
      'gate': 'Gate 02 (North)',
      'status': 'APPROVED',
      'type': 'Day Pass',
    },
    {
      'title': 'Tech Symposium Visit',
      'time': 'Yesterday, 09:15 AM',
      'gate': 'Main Gate (East)',
      'status': 'COMPLETED',
      'type': 'Official',
    },
    {
      'title': 'Medical Dispensary Leave',
      'time': '08 Oct, 02:00 PM',
      'gate': 'Gate 01',
      'status': 'VERIFIED',
      'type': 'Emergency',
    },
  ];
  List<Map<String, dynamic>> get recentPasses => _recentPasses;

  // Recent Discipline Logs
  final List<Map<String, dynamic>> _disciplineLogs = [
    {
      'title': 'Decorum Check - Smart ID',
      'status': 'Compliant',
      'date': 'Today, 08:45 AM',
      'verifiedBy': 'Prof. Raghavan (Dean Student Affairs)',
      'points': '+5 Merit',
    },
    {
      'title': 'Gate Biometric Punching',
      'status': 'On Time',
      'date': 'Yesterday, 08:22 AM',
      'verifiedBy': 'Security Gate 1',
      'points': 'Normal',
    },
  ];
  List<Map<String, dynamic>> get disciplineLogs => _disciplineLogs;

  void toggleTheme() {
    _themeMode = _themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();
  }

  void setTheme(ThemeMode mode) {
    _themeMode = mode;
    notifyListeners();
  }

  /// Populate user state from real backend database authentication
  void setUserFromBackend({
    required Map<String, dynamic> userProfile,
    required String primaryRole,
    required String roleTitle,
    required List<String> backendRoles,
  }) {
    _isAuthenticated = true;
    _userProfile = userProfile;
    _role = primaryRole;
    _roleTitle = roleTitle;
    _backendRoles = List<String>.from(backendRoles);

    // Extract real full name
    final first = (userProfile['first_name'] ?? '').toString().trim();
    final last = (userProfile['last_name'] ?? '').toString().trim();
    final nameField = (userProfile['name'] ?? '').toString().trim();
    final username = (userProfile['username'] ?? '').toString().trim();

    if (nameField.isNotEmpty) {
      _userName = nameField;
    } else if (first.isNotEmpty || last.isNotEmpty) {
      _userName = '$first $last'.trim();
    } else if (username.isNotEmpty) {
      _userName = username;
    } else {
      _userName = primaryRole == 'Staff' ? 'Faculty / Staff' : 'Student';
    }

    _email = (userProfile['email'] ?? '').toString().trim();

    // Extract student reg_no or staff ID
    final profile = userProfile['profile'] as Map<String, dynamic>?;
    final regNo = (profile?['reg_no'] ?? profile?['student_id'] ?? '').toString().trim();
    final staffId = (profile?['staff_id'] ?? '').toString().trim();

    if (primaryRole == 'Staff') {
      _studentId = staffId.isNotEmpty ? staffId : (regNo.isNotEmpty ? regNo : username);
    } else {
      _studentId = regNo.isNotEmpty ? regNo : (staffId.isNotEmpty ? staffId : username);
    }

    // Extract Department
    final deptObj = profile?['department'];
    if (userProfile['department'] != null && userProfile['department'].toString().trim().isNotEmpty) {
      _department = userProfile['department'].toString().trim();
    } else if (deptObj is Map) {
      _department = (deptObj['name'] ?? deptObj['short_name'] ?? '').toString().trim();
    } else if (profile?['department_name'] != null) {
      _department = profile!['department_name'].toString().trim();
    } else {
      _department = primaryRole == 'Staff'
          ? 'Academic Faculty'
          : 'Artificial Intelligence & Machine Learning';
    }

    // Extract College
    final collegeObj = userProfile['college'];
    if (collegeObj is Map) {
      final cName = (collegeObj['name'] ?? collegeObj['short_name'] ?? '').toString().trim();
      if (cName.isNotEmpty) {
        _college = cName;
      }
    }

    // Extract Profile Image using Profile.tsx media path resolution
    final rawImg = profile?['profile_image'] ?? userProfile['profile_image'];
    _profileImageUrl = ApiService.formatProfileImageUrl(rawImg);

    _persistSession();
    notifyListeners();
  }

  /// Persist session into device local storage so closing and opening the app stays logged in
  Future<void> _persistSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_keySessionActive, true);
      if (ApiService.authToken != null && ApiService.authToken!.isNotEmpty) {
        await prefs.setString(_keySessionToken, ApiService.authToken!);
      }
      if (_userProfile != null) {
        await prefs.setString(_keySessionUser, jsonEncode(_userProfile));
      }
      await prefs.setString(_keySessionPrimaryRole, _role);
      await prefs.setString(_keySessionRoleTitle, _roleTitle);
      await prefs.setStringList(_keySessionBackendRoles, _backendRoles);
    } catch (e) {
      debugPrint('Error saving session: $e');
    }
  }

  /// Restore user session when app starts after closing
  Future<bool> restoreSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final isActive = prefs.getBool(_keySessionActive) ?? false;
      if (!isActive) return false;

      final savedUserJson = prefs.getString(_keySessionUser);
      final savedToken = prefs.getString(_keySessionToken);
      final savedPrimaryRole = prefs.getString(_keySessionPrimaryRole) ?? 'Student';
      final savedRoleTitle = prefs.getString(_keySessionRoleTitle) ?? 'Student';
      final savedBackendRoles = prefs.getStringList(_keySessionBackendRoles) ?? [];

      if (savedUserJson != null && savedUserJson.isNotEmpty) {
        final Map<String, dynamic> userMap = jsonDecode(savedUserJson);
        if (savedToken != null && savedToken.isNotEmpty) {
          ApiService.authToken = savedToken;
        }

        // Populate session without overriding disk
        _isAuthenticated = true;
        _userProfile = userMap;
        _role = savedPrimaryRole;
        _roleTitle = savedRoleTitle;
        _backendRoles = List<String>.from(savedBackendRoles);

        final first = (userMap['first_name'] ?? '').toString().trim();
        final last = (userMap['last_name'] ?? '').toString().trim();
        final nameField = (userMap['name'] ?? '').toString().trim();
        final username = (userMap['username'] ?? '').toString().trim();

        if (nameField.isNotEmpty) {
          _userName = nameField;
        } else if (first.isNotEmpty || last.isNotEmpty) {
          _userName = '$first $last'.trim();
        } else if (username.isNotEmpty) {
          _userName = username;
        } else {
          _userName = savedPrimaryRole == 'Staff' ? 'Faculty / Staff' : 'Student';
        }

        _email = (userMap['email'] ?? '').toString().trim();

        final profile = userMap['profile'] as Map<String, dynamic>?;
        final regNo = (profile?['reg_no'] ?? profile?['student_id'] ?? '').toString().trim();
        final staffId = (profile?['staff_id'] ?? '').toString().trim();

        if (savedPrimaryRole == 'Staff') {
          _studentId = staffId.isNotEmpty ? staffId : (regNo.isNotEmpty ? regNo : username);
        } else {
          _studentId = regNo.isNotEmpty ? regNo : (staffId.isNotEmpty ? staffId : username);
        }

        final deptObj = profile?['department'];
        if (userMap['department'] != null && userMap['department'].toString().trim().isNotEmpty) {
          _department = userMap['department'].toString().trim();
        } else if (deptObj is Map) {
          _department = (deptObj['name'] ?? deptObj['short_name'] ?? '').toString().trim();
        } else if (profile?['department_name'] != null) {
          _department = profile!['department_name'].toString().trim();
        } else {
          _department = savedPrimaryRole == 'Staff'
              ? 'Academic Faculty'
              : 'Artificial Intelligence & Machine Learning';
        }

        final collegeObj = userMap['college'];
        if (collegeObj is Map) {
          final cName = (collegeObj['name'] ?? collegeObj['short_name'] ?? '').toString().trim();
          if (cName.isNotEmpty) {
            _college = cName;
          }
        }

        final rawImg = profile?['profile_image'] ?? userMap['profile_image'];
        _profileImageUrl = ApiService.formatProfileImageUrl(rawImg);

        notifyListeners();
        return true;
      }
    } catch (e) {
      debugPrint('Error restoring session: $e');
    }
    return false;
  }

  /// Switch mode manually if authorized
  void setRole(String newRole) {
    _role = newRole;
    if (!_isAuthenticated) {
      if (newRole == 'Staff') {
        _userName = 'Faculty / Staff User';
        _studentId = 'STAFF-AUTH';
        _department = 'Discipline & Campus Affairs';
      } else {
        _userName = 'Registered Student';
        _studentId = 'STUDENT-AUTH';
        _department = 'Computer Science & Engg.';
      }
    }
    notifyListeners();
  }

  /// Sign out and clear cached profile and session
  Future<void> signOut() async {
    _isAuthenticated = false;
    _userProfile = null;
    _backendRoles = [];
    _userName = 'Student User';
    _studentId = '';
    _email = '';
    _roleTitle = 'Student';
    _profileImageUrl = null;
    _activeNavIndex = 0;
    ApiService.logout();
    NotificationService.instance.stopApprovalPolling();

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_keySessionActive);
      await prefs.remove(_keySessionToken);
      await prefs.remove(_keySessionUser);
      await prefs.remove(_keySessionPrimaryRole);
      await prefs.remove(_keySessionRoleTitle);
      await prefs.remove(_keySessionBackendRoles);
    } catch (e) {
      debugPrint('Error clearing session: $e');
    }

    notifyListeners();
  }


  void addGatePass(String title, String gate, String type) {
    _recentPasses.insert(0, {
      'title': title,
      'time': 'Just now',
      'gate': gate,
      'status': 'APPROVED',
      'type': type,
    });
    _gatePassCount++;
    notifyListeners();
  }

  void updateGateStatus(String status) {
    _gateStatus = status;
    notifyListeners();
  }
}
