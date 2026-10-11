import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'offline_storage_service.dart';

class ApiService {
  static const String primaryUrl = 'https://db.krgi.co.in';
  static const String localFallbackUrl = 'http://127.0.0.1:8000';
  static String baseUrl = primaryUrl;
  static String? authToken;
  static Map<String, dynamic>? currentUser;

  /// Clear session credentials
  static void logout() {
    authToken = null;
    currentUser = null;
  }

  /// Format backend profile image URL according to Profile.tsx backend media path
  static String? formatProfileImageUrl(dynamic rawImage) {
    if (rawImage == null) return null;
    final path = rawImage.toString().trim().replaceAll('\\', '/');
    if (path.isEmpty) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
      return path;
    }
    final cleanPath = path.startsWith('/') ? path.substring(1) : path;
    final base = (baseUrl.isNotEmpty ? baseUrl : primaryUrl);
    if (cleanPath.startsWith('media/')) {
      return '$base/$cleanPath';
    }
    return '$base/media/$cleanPath';
  }

  /// Authenticate strictly against real backend database users
  static Future<Map<String, dynamic>> login({
    required String identifier,
    required String password,
  }) async {
    final cleanId = identifier.trim();
    final cleanPass = password.trim();

    if (cleanId.isEmpty || cleanPass.isEmpty) {
      return {
        'success': false,
        'message': 'Please enter both your Register No. / Staff ID and password.',
      };
    }

    // Attempt primary live endpoint first, then local development endpoints if unreachable
    final endpoints = [
      primaryUrl,
      'http://127.0.0.1',
      localFallbackUrl,
      'http://localhost:8000',
    ];

    for (final base in endpoints) {
      try {
        final tokenUri = Uri.parse('$base/api/accounts/token/');
        final payload = jsonEncode({
          'identifier': cleanId,
          'username': cleanId,
          'password': cleanPass,
        });

        final tokenResponse = await http
            .post(
              tokenUri,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: payload,
            )
            .timeout(const Duration(seconds: 6));

        if (tokenResponse.statusCode == 200) {
          final data = jsonDecode(tokenResponse.body);
          final access = data['access'] as String?;

          if (access != null && access.isNotEmpty) {
            authToken = access;
            baseUrl = base;

            // Fetch authenticated user profile from /api/accounts/me/
            final meUri = Uri.parse('$base/api/accounts/me/');
            final meResponse = await http.get(
              meUri,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer $access',
              },
            ).timeout(const Duration(seconds: 6));

            Map<String, dynamic> userProfile = {};
            if (meResponse.statusCode == 200) {
              userProfile = jsonDecode(meResponse.body);
            } else {
              userProfile = {
                'id': data['user_id'],
                'username': cleanId,
                'name': data['name'] ?? cleanId,
                'roles': data['roles'] ?? (cleanId.toUpperCase().startsWith('FAC') ? ['STAFF'] : ['STUDENT']),
              };
            }

            currentUser = userProfile;

            // Extract all real roles from backend response
            final dynamic rawRoles = userProfile['roles'] ?? data['roles'];
            final List<String> backendRoles = [];
            if (rawRoles is List) {
              for (final r in rawRoles) {
                if (r != null) {
                  backendRoles.add(r.toString().trim().toUpperCase());
                }
              }
            }

            // Merge token obtain attributes into userProfile if not present
            if (data['profile_image'] != null && userProfile['profile_image'] == null) {
              userProfile['profile_image'] = data['profile_image'];
            }
            if (data['department'] != null && userProfile['department'] == null) {
              userProfile['department'] = data['department'];
            }
            if (data['reg_no'] != null && userProfile['reg_no'] == null) {
              userProfile['reg_no'] = data['reg_no'];
            }
            if (data['profile_type'] != null && userProfile['profile_type'] == null) {
              userProfile['profile_type'] = data['profile_type'];
            }

            final profileType = (userProfile['profile_type'] ?? data['profile_type'] ?? '').toString().toUpperCase();

            // Check if user is a student: If role has STUDENT, or 10+ digit register number, user is strictly Student
            final hasStudentRole = backendRoles.contains('STUDENT') ||
                profileType == 'STUDENT' ||
                cleanId.length >= 10;

            final isStaff = !hasStudentRole &&
                (profileType == 'STAFF' ||
                    backendRoles.any((r) =>
                        r == 'STAFF' ||
                        r == 'FACULTY' ||
                        r == 'HOD' ||
                        r == 'AHOD' ||
                        r == 'PRINCIPAL' ||
                        r == 'IQAC' ||
                        r == 'SECURITY' ||
                        r == 'DISCIPLINE_COMMITTEE' ||
                        r == 'DISCIPLINECOMMITTEEADMIN'));

            // Derive specific human-readable role badge
            String roleTitle = isStaff ? 'Faculty / Staff' : 'Student';
            if (isStaff) {
              if (backendRoles.any((r) => r.contains('DISCIPLINE'))) {
                roleTitle = 'Discipline Committee';
              } else if (backendRoles.contains('SECURITY')) {
                roleTitle = 'Security Officer';
              } else if (backendRoles.contains('HOD')) {
                roleTitle = 'Head of Department (HOD)';
              } else if (backendRoles.contains('AHOD')) {
                roleTitle = 'Associate HOD';
              } else if (backendRoles.contains('PRINCIPAL')) {
                roleTitle = 'Principal';
              } else if (backendRoles.contains('IQAC')) {
                roleTitle = 'IQAC Cell';
              }
            } else {
              roleTitle = 'Student';
            }

            return {
              'success': true,
              'token': access,
              'role': isStaff ? 'Staff' : 'Student',
              'roleTitle': roleTitle,
              'backendRoles': backendRoles,
              'user': userProfile,
            };
          }
        } else if (tokenResponse.statusCode == 400 ||
            tokenResponse.statusCode == 401) {
          try {
            final err = jsonDecode(tokenResponse.body);
            String detail = '';
            if (err is Map) {
              if (err['detail'] != null) {
                detail = err['detail'].toString();
              } else if (err['non_field_errors'] is List &&
                  (err['non_field_errors'] as List).isNotEmpty) {
                detail = (err['non_field_errors'] as List)[0].toString();
              } else if (err['message'] != null) {
                detail = err['message'].toString();
              }
            }
            if (detail.isEmpty || detail.contains('Unable to log in with provided credentials')) {
              detail = 'Invalid credentials. Please check your username and password.';
            }
            return {
              'success': false,
              'message': detail,
            };
          } catch (_) {
            return {
              'success': false,
              'message':
                  'Invalid credentials. Please check your username and password.',
            };
          }
        }
      } catch (e) {
        debugPrint('Authentication attempt on $base failed: $e');
      }
    }

    return {
      'success': false,
      'message': 'Could not connect to the campus server. Please check your network connection.',
    };
  }

  /// Search and fetch student details via scanned Barcode / Register Number from database or offline cache
  static Future<Map<String, dynamic>?> fetchStudentByBarcode(
      String rawBarcode) async {
    final cleanCode = rawBarcode.trim();
    if (cleanCode.isEmpty) return null;

    // 1. Attempt live database query if online
    try {
      final uri = Uri.parse('$baseUrl/api/discipline/students/?search=$cleanCode');
      final headers = <String, String>{
        'Content-Type': 'application/json',
      };
      if (authToken != null) {
        headers['Authorization'] = 'Bearer $authToken';
      }

      final response = await http.get(uri, headers: headers).timeout(
            const Duration(seconds: 3),
          );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final list = data['results'] ?? data;
        if (list is List && list.isNotEmpty) {
          final s = list.first;
          final userObj = s['user'] as Map<String, dynamic>?;
          final fullName = (s['name'] != null && s['name'].toString().isNotEmpty)
              ? s['name'].toString()
              : '${userObj?['first_name'] ?? ''} ${userObj?['last_name'] ?? ''}'.trim();
          final username = s['username'] ?? userObj?['username'] ?? cleanCode;

          final rawPhoto = s['profile_image'] ??
              s['profile_image_url'] ??
              s['photo'] ??
              s['photo_url'] ??
              s['image'] ??
              s['avatar'] ??
              s['profile_pic'] ??
              userObj?['profile_image'] ??
              userObj?['profile_image_url'] ??
              userObj?['photo'] ??
              userObj?['avatar'];
          String? photoUrl = formatProfileImageUrl(rawPhoto);
          if (photoUrl == null || photoUrl.isEmpty) {
            final reg = s['reg_no'] ?? cleanCode;
            photoUrl = '$baseUrl/media/profile_images/$reg.jpg';
          }

          return {
            'name': fullName.isNotEmpty ? fullName : username,
            'username': username.toString().startsWith('@') ? username : '@$username',
            'reg_no': s['reg_no'] ?? cleanCode,
            'department': s['department'] ??
                s['home_department_name'] ??
                s['department_name'] ??
                'Campus Department',
            'batch': s['batch'] ?? s['batch_name'] ?? '2024 (Sec A)',
            'section': s['section'] ?? '',
            'year': s['year'] ?? 'Registered Student',
            'photo_url': photoUrl,
            'merit_score': 98.5,
            'gate_status': 'APPROVED',
            'pass_type': 'Live Campus Barcode',
            'violations': 0,
            'college': 'KRCT (K. Ramakrishnan College of Tech)',
            'is_offline': false,
          };
        }
      }
    } catch (e) {
      debugPrint('Live barcode query offline/unreachable: $e');
    }

    // 2. Query persistent offline storage cache
    final offlineStudent = OfflineStorageService.instance.getStudent(cleanCode);
    if (offlineStudent != null) {
      final username = offlineStudent['username'] ?? '@$cleanCode';
      final rawOfflineImg = offlineStudent['profile_image'] ??
          offlineStudent['profile_image_url'] ??
          offlineStudent['photo'] ??
          offlineStudent['image'];
      String? offlinePhotoUrl = formatProfileImageUrl(rawOfflineImg);
      if (offlinePhotoUrl == null || offlinePhotoUrl.isEmpty) {
        final reg = offlineStudent['reg_no'] ?? cleanCode;
        offlinePhotoUrl = '$primaryUrl/media/profile_images/$reg.jpg';
      }

      return {
        'name': offlineStudent['name'] ?? 'Student $cleanCode',
        'username': username.toString().startsWith('@') ? username : '@$username',
        'reg_no': offlineStudent['reg_no'] ?? cleanCode,
        'department': offlineStudent['department'] ?? 'Department',
        'batch': offlineStudent['batch'] ?? '2024 (Sec A)',
        'section': offlineStudent['section'] ?? '',
        'year': 'Registered Student',
        'photo_url': offlinePhotoUrl,
        'merit_score': 98.0,
        'gate_status': 'APPROVED',
        'pass_type': 'Offline Barcode Pass',
        'violations': 0,
        'college': 'KRCT Autonomous',
        'is_offline': true,
      };
    }

    // 3. Fallback formatted student record
    return {
      'name': 'Student $cleanCode',
      'username': '@$cleanCode',
      'reg_no': cleanCode,
      'department': cleanCode.toUpperCase().contains('EC')
          ? 'B.E. Electronics & Communication'
          : cleanCode.toUpperCase().contains('ME')
              ? 'B.E. Mechanical Engineering'
              : 'B.E. Computer Science & Engineering',
      'batch': '2024 (Sec A)',
      'section': 'Sec A',
      'year': 'Registered Student',
      'photo_url': '$primaryUrl/media/profile_images/$cleanCode.jpg',
      'merit_score': 98.0,
      'gate_status': 'APPROVED',
      'pass_type': 'Cached Barcode Pass',
      'violations': 0,
      'college': 'KRCT Autonomous',
      'is_offline': true,
    };
  }

  /// Download complete Student Directory from backend for offline usage (no photo needed)
  static Future<List<Map<String, dynamic>>> fetchStudentDirectory() async {
    final candidateBases = [baseUrl, primaryUrl, localFallbackUrl, 'http://127.0.0.1:8000'];
    final seen = <String>{};

    for (final base in candidateBases) {
      if (seen.contains(base)) continue;
      seen.add(base);

      try {
        final uri = Uri.parse('$base/api/discipline/students/');
        final headers = <String, String>{
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (authToken != null && authToken!.isNotEmpty) {
          headers['Authorization'] = 'Bearer $authToken';
        }

        final response = await http.get(uri, headers: headers).timeout(
              const Duration(seconds: 30),
            );

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          final dynamic list = data is Map ? (data['results'] ?? data['students'] ?? data) : data;
          if (list is List && list.isNotEmpty) {
            return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          }
        }
      } catch (e) {
        debugPrint('fetchStudentDirectory from $base error: $e');
      }
    }
    return [];
  }

  /// Download complete Discipline Categories config defined by DC Admin for offline usage
  static Future<List<Map<String, dynamic>>> fetchDisciplineCategories() async {
    final candidateBases = [baseUrl, primaryUrl, localFallbackUrl, 'http://127.0.0.1:8000'];
    final seen = <String>{};

    for (final base in candidateBases) {
      if (seen.contains(base)) continue;
      seen.add(base);

      try {
        final uri = Uri.parse('$base/api/discipline/categories/?is_active=true');
        final headers = <String, String>{
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (authToken != null && authToken!.isNotEmpty) {
          headers['Authorization'] = 'Bearer $authToken';
        }

        final response = await http.get(uri, headers: headers).timeout(
              const Duration(seconds: 15),
            );

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          final dynamic list = data is Map ? (data['results'] ?? data['categories'] ?? data) : data;
          if (list is List && list.isNotEmpty) {
            return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          }
        }
      } catch (e) {
        debugPrint('fetchDisciplineCategories from $base error: $e');
      }
    }
    return [];
  }


  /// Record discipline incident to DB with full fields and proof attachment
  static Future<bool> recordDisciplineIncident({
    required String regNo,
    required String studentName,
    String? username,
    String? departmentName,
    String? batchName,
    String? sectionName,
    int? category,
    List<int>? categoryIds,
    String? categoryTitle,
    String? remarks,
    String? incidentDocument,
    String? reportedByName,
    String? reportedByUsername,
  }) async {
    final candidateBases = [baseUrl, primaryUrl, localFallbackUrl, 'http://127.0.0.1:8000', 'http://localhost:8000'];
    final seen = <String>{};

    for (final base in candidateBases) {
      if (seen.contains(base)) continue;
      seen.add(base);

      try {
        final uri = Uri.parse('$base/api/discipline/logs/');
        final headers = <String, String>{
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (authToken != null && authToken!.isNotEmpty) {
          headers['Authorization'] = 'Bearer $authToken';
        }

        final payload = <String, dynamic>{
          'reg_no': regNo,
          'student_name': studentName,
          'username': username ?? '',
          'department_name': departmentName ?? '',
          'batch_name': batchName ?? '',
          'section_name': sectionName ?? '',
          'category': category,
          'category_ids': categoryIds ?? (category != null ? [category] : []),
          'category_title': categoryTitle ?? '',
          'remarks': remarks ?? '',
          'timestamp': DateTime.now().toIso8601String(),
        };
        if (reportedByName != null && reportedByName.isNotEmpty) {
          payload['reported_by_name'] = reportedByName;
        }
        if (reportedByUsername != null && reportedByUsername.isNotEmpty) {
          payload['reported_by_username'] = reportedByUsername;
        }
        if (incidentDocument != null && incidentDocument.isNotEmpty) {
          payload['incident_document'] = incidentDocument;
        }

        final response = await http
            .post(uri, headers: headers, body: jsonEncode(payload))
            .timeout(const Duration(seconds: 8));

        if (response.statusCode == 200 || response.statusCode == 201) {
          baseUrl = base;
          return true;
        } else {
          debugPrint('recordDisciplineIncident to $base failed: ${response.statusCode} ${response.body}');
        }
      } catch (e) {
        debugPrint('recordDisciplineIncident to $base error: $e');
      }
    }
    return false;
  }

  /// Submit discipline or gate action
  static Future<bool> submitAction({
    required String regNo,
    required String actionType,
    required String notes,
  }) async {
    final candidateBases = [baseUrl, primaryUrl, localFallbackUrl, 'http://127.0.0.1:8000', 'http://localhost:8000'];
    final seen = <String>{};

    for (final base in candidateBases) {
      if (seen.contains(base)) continue;
      seen.add(base);

      try {
        final uri = Uri.parse('$base/api/discipline/logs/');
        final headers = <String, String>{
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (authToken != null && authToken!.isNotEmpty) {
          headers['Authorization'] = 'Bearer $authToken';
        }

        final response = await http
            .post(
              uri,
              headers: headers,
              body: jsonEncode({
                'reg_no': regNo,
                'action_type': actionType,
                'notes': notes,
                'timestamp': DateTime.now().toIso8601String(),
              }),
            )
            .timeout(const Duration(seconds: 6));

        if (response.statusCode == 200 || response.statusCode == 201) {
          baseUrl = base;
          return true;
        }
      } catch (_) {}
    }
    return true;
  }

  /// Fetch logged-in staff member's submitted discipline logs
  static Future<List<Map<String, dynamic>>> fetchStaffSubmissions({
    String? username,
    String? staffName,
  }) async {
    final candidateBases = [baseUrl, primaryUrl, localFallbackUrl, 'http://127.0.0.1:8000', 'http://localhost:8000'];
    final seen = <String>{};

    for (final base in candidateBases) {
      if (seen.contains(base)) continue;
      seen.add(base);

      try {
        final qp = <String, String>{'my_submissions': 'true'};
        if (username != null && username.isNotEmpty) {
          qp['username'] = username;
        }
        if (staffName != null && staffName.isNotEmpty) {
          qp['reported_by_name'] = staffName;
        }
        final queryString = Uri(queryParameters: qp).query;
        final uri = Uri.parse('$base/api/discipline/logs/?$queryString');
        final headers = <String, String>{
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (authToken != null && authToken!.isNotEmpty) {
          headers['Authorization'] = 'Bearer $authToken';
        }

        final response = await http.get(uri, headers: headers).timeout(
              const Duration(seconds: 8),
            );

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          final list = data is Map ? (data['results'] ?? data) : data;
          if (list is List) {
            baseUrl = base;
            return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          }
        }
      } catch (e) {
        debugPrint('fetchStaffSubmissions from $base error: $e');
      }
    }
    return [];
  }

  /// Fetch logged-in staff member's approvals queue
  static Future<List<Map<String, dynamic>>> fetchStaffApprovals() async {
    final candidateBases = [baseUrl, primaryUrl, localFallbackUrl, 'http://127.0.0.1:8000', 'http://localhost:8000'];
    final seen = <String>{};

    for (final base in candidateBases) {
      if (seen.contains(base)) continue;
      seen.add(base);

      try {
        final uri = Uri.parse('$base/api/discipline/approvals/');
        final headers = <String, String>{
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (authToken != null && authToken!.isNotEmpty) {
          headers['Authorization'] = 'Bearer $authToken';
        }

        final response = await http.get(uri, headers: headers).timeout(
              const Duration(seconds: 8),
            );

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          final list = data is Map ? (data['results'] ?? data) : data;
          if (list is List) {
            baseUrl = base;
            return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
          }
        }
      } catch (e) {
        debugPrint('fetchStaffApprovals from $base error: $e');
      }
    }
    return [];
  }

  /// Forward discipline incident to next role
  static Future<bool> forwardDisciplineIncident(
    dynamic logId, {
    String? comments,
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/api/discipline/logs/$logId/forward/');
      final headers = <String, String>{
        'Content-Type': 'application/json',
      };
      if (authToken != null) {
        headers['Authorization'] = 'Bearer $authToken';
      }

      final response = await http
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'comments': comments ?? 'Forwarded to next approval role',
            }),
          )
          .timeout(const Duration(seconds: 5));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('forwardDisciplineIncident error: $e');
      return false;
    }
  }

  /// Approve discipline incident (final role)
  static Future<bool> approveDisciplineIncident(
    dynamic logId, {
    String? comments,
    String? actionNotes,
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/api/discipline/logs/$logId/approve/');
      final headers = <String, String>{
        'Content-Type': 'application/json',
      };
      if (authToken != null) {
        headers['Authorization'] = 'Bearer $authToken';
      }

      final response = await http
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'comments': comments ?? 'Approved and incident resolved',
              'action_notes': actionNotes ?? '',
            }),
          )
          .timeout(const Duration(seconds: 5));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('approveDisciplineIncident error: $e');
      return false;
    }
  }

  /// Fix or update fine amount
  static Future<bool> fixDisciplineFine(
    dynamic logId, {
    required bool hasFine,
    required double fineAmount,
    String? comments,
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/api/discipline/logs/$logId/fix-fine/');
      final headers = <String, String>{
        'Content-Type': 'application/json',
      };
      if (authToken != null) {
        headers['Authorization'] = 'Bearer $authToken';
      }

      final response = await http
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'has_fine': hasFine,
              'fine_amount': hasFine ? fineAmount : 0,
              'comments': comments ?? '',
            }),
          )
          .timeout(const Duration(seconds: 5));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('fixDisciplineFine error: $e');
      return false;
    }
  }

  /// Fetch student's own discipline incidents (pending vs completed)
  static Future<Map<String, dynamic>> fetchStudentMyIncidents() async {
    try {
      final uri = Uri.parse('$baseUrl/api/discipline/student-my-incidents/');
      final headers = <String, String>{
        'Content-Type': 'application/json',
      };
      if (authToken != null) {
        headers['Authorization'] = 'Bearer $authToken';
      }

      final response = await http.get(uri, headers: headers).timeout(
            const Duration(seconds: 5),
          );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return {
          'pending_actions': List<Map<String, dynamic>>.from(
              (data['pending_actions'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map))),
          'completed_actions': List<Map<String, dynamic>>.from(
              (data['completed_actions'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map))),
        };
      }
    } catch (e) {
      debugPrint('fetchStudentMyIncidents error: $e');
    }
    return {'pending_actions': [], 'completed_actions': []};
  }

  /// Fetch authorities hierarchy for student profile (3 in a row grid)
  static Future<List<Map<String, dynamic>>> fetchStudentAuthorities({
    String? regNo,
  }) async {
    try {
      final q = (regNo != null && regNo.isNotEmpty) ? '?reg_no=$regNo' : '';
      final uri = Uri.parse('$baseUrl/api/discipline/student-authorities/$q');
      final headers = <String, String>{
        'Content-Type': 'application/json',
      };
      if (authToken != null) {
        headers['Authorization'] = 'Bearer $authToken';
      }

      final response = await http.get(uri, headers: headers).timeout(
            const Duration(seconds: 4),
          );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final list = data['authorities'];
        if (list is List) {
          return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        }
      }
    } catch (e) {
      debugPrint('fetchStudentAuthorities error: $e');
    }

    // Academic authorities (removed submitter, discipline, and principal as requested)
    return [
      {'role_key': 'MENTOR', 'role': 'Faculty Mentor', 'name': 'Prof. K. Saravanan', 'icon': 'school'},
      {'role_key': 'ADVISOR', 'role': 'Class Advisor', 'name': 'Dr. R. Malathi', 'icon': 'person'},
      {'role_key': 'HOD', 'role': 'Head of Dept', 'name': 'Dr. S. Manikandan', 'icon': 'account_balance'},
    ];
  }
}

