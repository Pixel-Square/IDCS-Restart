import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
import '../state/app_state.dart';

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final FlutterLocalNotificationsPlugin _notificationsPlugin =
      FlutterLocalNotificationsPlugin();

  bool _isInitialized = false;
  Timer? _pollingTimer;
  final Set<String> _notifiedApprovalIds = <String>{};

  static const String _channelId = 'kr_track_approvals';
  static const String _channelName = 'Approval Notifications';
  static const String _channelDesc =
      'Notifications when student applications require staff approval';

  /// Initialize notifications on app start
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      // Android setup: use ic_launcher from mipmap
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const darwinInit = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );

      const initSettings = InitializationSettings(
        android: androidInit,
        iOS: darwinInit,
        macOS: darwinInit,
      );

      await _notificationsPlugin.initialize(
        settings: initSettings,
        onDidReceiveNotificationResponse: (NotificationResponse details) {
          debugPrint('Notification clicked: ${details.payload}');
          // If staff approval notification clicked, switch to approvals tab (index 1)
          AppState.instance.setActiveNavIndex(1);
        },
      );

      // Create Android Notification Channel
      final androidPlatform = _notificationsPlugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>();

      if (androidPlatform != null) {
        await androidPlatform.createNotificationChannel(
          const AndroidNotificationChannel(
            _channelId,
            _channelName,
            description: _channelDesc,
            importance: Importance.max,
            playSound: true,
            enableVibration: true,
          ),
        );
      }

      // Request Android 13+ Notification Permission
      await requestNotificationPermission();

      // Load previously notified IDs from SharedPreferences
      final prefs = await SharedPreferences.getInstance();
      final savedIds = prefs.getStringList('kr_track_notified_approvals') ?? [];
      _notifiedApprovalIds.addAll(savedIds);

      _isInitialized = true;
      debugPrint('NotificationService initialized successfully.');
    } catch (e) {
      debugPrint('NotificationService initialize error: $e');
    }
  }

  /// Request runtime POST_NOTIFICATIONS permission
  Future<bool> requestNotificationPermission() async {
    try {
      if (!kIsWeb) {
        final status = await Permission.notification.request();
        return status.isGranted;
      }
    } catch (e) {
      debugPrint('Request notification permission error: $e');
    }
    return false;
  }

  /// Display a local status-bar notification
  Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    try {
      if (!_isInitialized) {
        await initialize();
      }

      const androidDetails = AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: _channelDesc,
        importance: Importance.max,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
        icon: '@mipmap/ic_launcher',
      );

      const darwinDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );

      const details = NotificationDetails(
        android: androidDetails,
        iOS: darwinDetails,
      );

      await _notificationsPlugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: details,
        payload: payload,
      );
    } catch (e) {
      debugPrint('showNotification error: $e');
    }
  }

  /// Start polling for approval applications for the logged-in user
  void startApprovalPolling({Duration interval = const Duration(seconds: 25)}) {
    _pollingTimer?.cancel();
    // Run an immediate check
    checkPendingApprovals();
    // Then schedule recurring checks
    _pollingTimer = Timer.periodic(interval, (_) {
      checkPendingApprovals();
    });
  }

  /// Stop polling (e.g. on logout)
  void stopApprovalPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }

  /// Query backend for pending approvals and notify if new applications exist
  Future<void> checkPendingApprovals() async {
    final appState = AppState.instance;
    if (!appState.isAuthenticated) return;

    // Approvals queue is relevant for staff / approver roles
    final isStudent = appState.role == 'Student' ||
        appState.backendRoles.contains('STUDENT') ||
        appState.studentId.length >= 10;
    if (isStudent) return;

    try {
      final approvals = await ApiService.fetchStaffApprovals();
      if (approvals.isEmpty) return;

      int newCount = 0;
      Map<String, dynamic>? latestNewItem;

      for (final item in approvals) {
        final idStr = (item['id'] ?? item['log_id'] ?? item['uuid'] ?? '')
            .toString();
        if (idStr.isEmpty) continue;

        if (!_notifiedApprovalIds.contains(idStr)) {
          _notifiedApprovalIds.add(idStr);
          latestNewItem = item;
          newCount++;
        }
      }

      if (newCount > 0 && latestNewItem != null) {
        // Persist notified IDs so we don't re-notify across restarts
        final prefs = await SharedPreferences.getInstance();
        await prefs.setStringList(
          'kr_track_notified_approvals',
          _notifiedApprovalIds.toList(),
        );

        final studentName = latestNewItem['student_name'] ??
            latestNewItem['student']?['name'] ??
            latestNewItem['student']?['username'] ??
            'A student';
        final category = latestNewItem['category_name'] ??
            latestNewItem['category']?['name'] ??
            latestNewItem['title'] ??
            latestNewItem['type'] ??
            'Application';

        final notifTitle = newCount == 1
            ? '🔔 New Approval Request'
            : '🔔 $newCount New Approval Requests';

        final notifBody = newCount == 1
            ? '$studentName - $category requires your approval.'
            : 'You have $newCount pending student applications awaiting approval.';

        final notifId = DateTime.now().millisecondsSinceEpoch ~/ 1000;

        await showNotification(
          id: notifId,
          title: notifTitle,
          body: notifBody,
          payload: 'approvals_tab',
        );
      }
    } catch (e) {
      debugPrint('checkPendingApprovals error: $e');
    }
  }

  /// Manually trigger a test notification for verification
  Future<void> sendTestApprovalNotification() async {
    await showNotification(
      id: 999,
      title: '🔔 New Approval Request',
      body: 'John Doe - Outpass Application requires your approval.',
      payload: 'approvals_tab',
    );
  }
}
