import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/offline_storage_service.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import 'offline_sync_screen.dart';

class DisciplineScreen extends StatefulWidget {
  const DisciplineScreen({super.key});

  @override
  State<DisciplineScreen> createState() => _DisciplineScreenState();
}

class _DisciplineScreenState extends State<DisciplineScreen> {
  int _selectedTab = 0; // 0: My Submissions, 1: Approvals
  bool _isLoading = false;

  List<Map<String, dynamic>> _submissions = [];
  List<Map<String, dynamic>> _approvals = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final appState = AppState.instance;

    // WhatsApp-like auto-sync: Automatically sync pending offline items when internet/screen is active
    if (OfflineStorageService.instance.pendingSyncCount > 0) {
      try {
        await OfflineStorageService.instance.syncOfflineIncidentsToDatabase();
      } catch (_) {}
    }

    final staffIdentifier = appState.studentId.isNotEmpty ? appState.studentId : appState.userName;
    final offlineItems = OfflineStorageService.instance.getOfflineIncidents().where((item) {
      final reporter = item['reported_by_name']?.toString() ?? '';
      return reporter.isEmpty ||
          reporter.toLowerCase() == appState.userName.toLowerCase() ||
          reporter.toLowerCase() == staffIdentifier.toLowerCase();
    }).toList();
    final subs = await ApiService.fetchStaffSubmissions(
      username: staffIdentifier,
      staffName: appState.userName,
    );
    final apps = await ApiService.fetchStaffApprovals();
    if (mounted) {
      setState(() {
        _submissions = [...offlineItems, ...subs];
        _approvals = apps;
        _isLoading = false;
      });
    }
  }

  String _formatStatus(Map<String, dynamic> log) {
    if (log['is_offline'] == true || log['status'] == 'OFFLINE_PENDING') {
      return 'Pending Sync';
    }
    final status = (log['status'] ?? '').toString();
    if (status == 'RESOLVED') return 'Resolved • Cleared';
    if (status == 'DISMISSED') return 'Dismissed';
    if (status == 'PENDING_FINE_PAYMENT') return 'Pending at Student (Fine)';
    final role = (log['current_role'] ?? 'Approver').toString().replaceAll('_', ' ');
    return 'Pending at $role';
  }

  Color _getStatusColor(Map<String, dynamic> log) {
    if (log['is_offline'] == true || log['status'] == 'OFFLINE_PENDING') {
      return const Color(0xFFF59E0B);
    }
    final status = (log['status'] ?? '').toString();
    if (status == 'RESOLVED') return const Color(0xFF10B981);
    if (status == 'DISMISSED') return const Color(0xFF64748B);
    if (status == 'PENDING_FINE_PAYMENT') return const Color(0xFFEF4444);
    return const Color(0xFF6366F1);
  }

  Widget _buildFlowNode({
    required String title,
    required String name,
    required String role,
    required String statusText,
    required String state,
    bool isFinal = false,
  }) {
    Color ringColor;
    Color iconBg;
    Widget icon;
    if (state == 'DONE') {
      ringColor = const Color(0xFF10B981);
      iconBg = const Color(0xFF10B981);
      icon = isFinal
          ? const Icon(Icons.star_rounded, size: 14, color: Colors.white)
          : const Icon(Icons.check, size: 14, color: Colors.white);
    } else if (state == 'CURRENT') {
      ringColor = const Color(0xFFF59E0B);
      iconBg = const Color(0xFFF59E0B);
      icon = const Icon(Icons.access_time_rounded, size: 13, color: Colors.white);
    } else {
      ringColor = Colors.white24;
      iconBg = const Color(0xFF1E2433);
      icon = isFinal
          ? const Icon(Icons.star_outline_rounded, size: 13, color: Colors.white38)
          : Text(
              statusText.replaceAll('Step ', ''),
              style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold),
            );
    }

    return SizedBox(
      width: 82,
      child: Column(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: iconBg,
              shape: BoxShape.circle,
              border: Border.all(color: ringColor, width: 2),
            ),
            child: Center(child: icon),
          ),
          const SizedBox(height: 6),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: state == 'DONE'
                  ? const Color(0xFF34D399)
                  : state == 'CURRENT'
                      ? const Color(0xFFFBBF24)
                      : Colors.white38,
              fontSize: 9,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: BoxDecoration(
              color: const Color(0xFF6366F1).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              role,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF818CF8),
                fontSize: 8,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFlowConnector({required bool isDone}) {
    return Container(
      width: 20,
      margin: const EdgeInsets.only(top: 13),
      height: 2,
      color: isDone ? const Color(0xFF10B981) : Colors.white24,
    );
  }

  void _openActionModal(Map<String, dynamic> log) {
    final logId = log['id'];
    final studentName = log['student_name'] ?? 'Student';
    final regNo = log['reg_no'] ?? '';
    final category = log['category_title'] ?? 'Discipline Violation';
    final flowRoles = (log['flow_roles'] as List?)?.map((e) => e.toString()).toList() ?? [];
    final currentIndex = log['current_step_index'] is int ? log['current_step_index'] as int : 0;
    final isIntermediate = flowRoles.isNotEmpty && currentIndex < flowRoles.length - 1;
    final nextRole = isIntermediate && currentIndex + 1 < flowRoles.length
        ? flowRoles[currentIndex + 1].replaceAll('_', ' ')
        : 'Final Approver';
    final remarks = log['remarks'] ?? '';
    final fineAmount = log['fine_amount'] ?? 0;
    final hasReceipt = (log['receipt_document'] != null || log['receipt_document_url'] != null);
    final commentsCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        bool processing = false;

        return StatefulBuilder(
          builder: (context, setModalState) {
            return Container(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFF1E2433),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                border: Border.all(color: Colors.white12),
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 44,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white24,
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'INCIDENT ACTION',
                          style: TextStyle(
                            color: AppColors.accentCyan,
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                        GestureDetector(
                          onTap: () => Navigator.of(context).pop(),
                          child: const Icon(Icons.close_rounded, color: Colors.white54, size: 20),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '$studentName ($regNo)',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      category,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (remarks.toString().isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '"$remarks"',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFF6366F1).withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'Fine: ₹$fineAmount',
                            style: const TextStyle(
                              color: Color(0xFF818CF8),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: hasReceipt
                                ? const Color(0xFF10B981).withValues(alpha: 0.2)
                                : const Color(0xFFF59E0B).withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            hasReceipt ? 'Receipt Uploaded' : 'Receipt Pending',
                            style: TextStyle(
                              color: hasReceipt ? const Color(0xFF34D399) : const Color(0xFFFBBF24),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: commentsCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'Add remarks / notes (optional)...',
                        hintStyle: const TextStyle(color: Colors.white38, fontSize: 12),
                        filled: true,
                        fillColor: const Color(0xFF131824),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                      maxLines: 2,
                    ),
                    const SizedBox(height: 16),

                    // Approval Flow Line Pipeline
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF131824),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'APPROVAL FLOW PIPELINE',
                                style: TextStyle(
                                  color: AppColors.accentCyan,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                ),
                              ),
                              Text(
                                'Step ${currentIndex + 1} of ${(flowRoles.length + 1)}',
                                style: const TextStyle(
                                  color: Colors.white54,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            physics: const BouncingScrollPhysics(),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if ((log['flow_stages'] as List?)?.isNotEmpty ?? false) ...[
                                  ...((log['flow_stages'] as List).asMap().entries.map((entry) {
                                    final idx = entry.key;
                                    final stage = Map<String, dynamic>.from(entry.value as Map);
                                    final isDone = stage['is_done'] == true;
                                    final isCur = stage['is_current'] == true;
                                    final isLast = idx == (log['flow_stages'] as List).length - 1;
                                    final isFirst = idx == 0;

                                    final title = isDone
                                        ? (isFirst ? 'Submitted' : 'Forwarded')
                                        : (isCur ? 'Pending' : (isLast ? 'Finalizer' : 'Upcoming'));

                                    final nodeWidget = _buildFlowNode(
                                      title: title,
                                      name: (stage['assigned_name'] ?? 'Authority').toString(),
                                      role: (stage['role_title'] ?? '').toString(),
                                      statusText: isDone ? 'Done' : (isCur ? 'Pending' : 'Step ${idx + 1}'),
                                      state: isDone ? 'DONE' : (isCur ? 'CURRENT' : 'UPCOMING'),
                                      isFinal: isLast,
                                    );

                                    return Row(
                                      mainAxisSize: MainAxisSize.min,
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        nodeWidget,
                                        if (!isLast) _buildFlowConnector(isDone: isDone),
                                      ],
                                    );
                                  })),
                                ] else ...[
                                  // Submitter Node
                                  _buildFlowNode(
                                    title: 'Submitted',
                                    name: (log['reported_by_name'] ?? 'Staff').toString(),
                                    role: 'Submitter',
                                    statusText: 'Origin',
                                    state: 'DONE',
                                  ),
                                  _buildFlowConnector(isDone: true),

                                  // Intermediate Roles
                                  for (int i = 0; i < flowRoles.length; i++) ...[
                                    () {
                                      final roleStr = flowRoles[i];
                                      final isDone = i < currentIndex || log['status'] == 'RESOLVED';
                                      final isCur = i == currentIndex && log['status'] != 'RESOLVED';
                                      final actions = (log['actions'] as List?) ?? [];
                                      final matchAct = actions.firstWhere(
                                        (a) => a is Map && (a['role_performed']?.toString().toUpperCase() == roleStr.toUpperCase()),
                                        orElse: () => null,
                                      );
                                      final authorities = (log['flow_authorities'] as Map?) ?? {};
                                      final authName = authorities[roleStr.toUpperCase()]?.toString();
                                      final perfName = matchAct != null
                                          ? matchAct['user_name']?.toString() ?? roleStr
                                          : (authName != null && authName.isNotEmpty
                                              ? authName
                                              : (isCur && (log['assigned_approver_name'] != null)
                                                  ? log['assigned_approver_name'].toString()
                                                  : roleStr.replaceAll('_', ' ')));

                                      return _buildFlowNode(
                                        title: isDone ? 'Forwarded' : (isCur ? 'Pending' : 'Upcoming'),
                                        name: perfName,
                                        role: roleStr.replaceAll('_', ' '),
                                        statusText: isDone ? 'Done' : (isCur ? 'Pending' : 'Step ${i + 2}'),
                                        state: isDone ? 'DONE' : (isCur ? 'CURRENT' : 'UPCOMING'),
                                      );
                                    }(),
                                    _buildFlowConnector(isDone: i < currentIndex || log['status'] == 'RESOLVED'),
                                  ],

                                  // Final Approver
                                  () {
                                    final authorities = (log['flow_authorities'] as Map?) ?? {};
                                    final finalRole = flowRoles.isNotEmpty ? flowRoles.last.toUpperCase() : 'FINAL_APPROVER';
                                    final finalAuthName = authorities[finalRole]?.toString() ?? 'Clearance';
                                    return _buildFlowNode(
                                      title: log['status'] == 'RESOLVED' ? 'Finalized' : 'Final Approver',
                                      name: finalAuthName,
                                      role: 'Final Approver',
                                      statusText: log['status'] == 'RESOLVED' ? 'Cleared' : 'Final',
                                      state: log['status'] == 'RESOLVED' ? 'DONE' : (currentIndex >= flowRoles.length ? 'CURRENT' : 'UPCOMING'),
                                      isFinal: true,
                                    );
                                  }(),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),

                    // Intermediate vs Final Buttons
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: isIntermediate
                                  ? const Color(0xFF6366F1)
                                  : const Color(0xFF10B981),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            onPressed: processing
                                ? null
                                : () async {
                                    setModalState(() => processing = true);
                                    if (isIntermediate) {
                                      await ApiService.forwardDisciplineIncident(
                                        logId,
                                        comments: commentsCtrl.text.trim(),
                                      );
                                    } else {
                                      await ApiService.approveDisciplineIncident(
                                        logId,
                                        comments: commentsCtrl.text.trim(),
                                      );
                                    }
                                    if (ctx.mounted) {
                                      Navigator.of(ctx).pop();
                                      _loadData();
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            isIntermediate
                                                ? 'Forwarded to $nextRole successfully!'
                                                : 'Incident approved and resolved!',
                                          ),
                                          backgroundColor: isIntermediate
                                              ? const Color(0xFF6366F1)
                                              : const Color(0xFF10B981),
                                        ),
                                      );
                                    }
                                  },
                            child: processing
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        isIntermediate ? Icons.send_rounded : Icons.check_circle_rounded,
                                        size: 16,
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        isIntermediate
                                            ? 'Forward to $nextRole'
                                            : 'Approve & Resolve',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final isDark = state.isDarkMode;

    final bgColor = isDark ? AppColors.darkBg : AppColors.lightBg;
    final cardBg = isDark ? AppColors.darkCard : Colors.white;
    final textColor = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final subtextColor = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    final staffName = state.userName.trim().toLowerCase();
    final staffId = (state.studentId.isNotEmpty ? state.studentId : state.userName).trim().toLowerCase();
    final isGlobalAdmin = state.backendRoles.any((r) =>
        ['IQAC', 'ADMIN', 'DISCIPLINE_COMMITTEE_ADMIN', 'DISCIPLINECOMMITTEEADMIN'].contains(r.toUpperCase())) ||
        state.roleTitle.toLowerCase().contains('admin') ||
        state.roleTitle.toLowerCase().contains('iqac');

    // Filter approvals for pending on top vs history below
    final pendingApprovals = _approvals.where((a) {
      final s = a['status']?.toString().toUpperCase();
      if (s == 'RESOLVED' || s == 'DISMISSED') return false;

      // Server explicitly marked whether actionable for authenticated user
      if (a['is_actionable'] == true) return true;
      if (a['is_actionable'] == false && !isGlobalAdmin) return false;

      // Assigned authority matches current staff user
      final approverName = (a['assigned_approver_name'] ?? '').toString().toLowerCase();
      final approverUser = (a['assigned_approver_username'] ?? '').toString().toLowerCase();
      if (approverName.isNotEmpty && (approverName == staffName || staffName.contains(approverName))) return true;
      if (approverUser.isNotEmpty && (approverUser == staffId || approverUser == staffName)) return true;

      return isGlobalAdmin;
    }).toList();

    final historyApprovals = _approvals.where((a) {
      if (pendingApprovals.contains(a)) return false;

      if (isGlobalAdmin) return true;

      // Only show in history if current staff has acted on it or is designated approver
      final actions = a['actions'] as List? ?? [];
      final hasActed = actions.any((act) {
        if (act is! Map) return false;
        final actUserName = (act['user_name'] ?? '').toString().toLowerCase();
        return actUserName.isNotEmpty && (actUserName == staffName || staffName.contains(actUserName));
      });
      if (hasActed) return true;

      final s = a['status']?.toString().toUpperCase();
      if (s == 'RESOLVED' || s == 'DISMISSED') {
        final approverName = (a['assigned_approver_name'] ?? '').toString().toLowerCase();
        final approverUser = (a['assigned_approver_username'] ?? '').toString().toLowerCase();
        if (approverName.isNotEmpty && (approverName == staffName || staffName.contains(approverName))) return true;
        if (approverUser.isNotEmpty && (approverUser == staffId || approverUser == staffName)) return true;
      }

      return false;
    }).toList();

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
              // Top Screen Header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'ACTIONS LEDGER',
                          style: TextStyle(
                            color: textColor,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.5,
                          ),
                        ),
                        Text(
                          'Staff Discipline & Approvals Tracking',
                          style: TextStyle(
                            color: subtextColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        IconButton(
                          tooltip: 'Pull Offline Database',
                          icon: const Icon(Icons.cloud_download_rounded, color: AppColors.accentCyan),
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (context) => const OfflineSyncScreen(autoProceed: false),
                              ),
                            ).then((_) => _loadData());
                          },
                        ),
                        IconButton(
                          tooltip: 'Refresh',
                          icon: Icon(Icons.refresh_rounded, color: textColor),
                          onPressed: _loadData,
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Two Top Side Bars / Segmented Tabs (My Submissions & Approvals)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Container(
                  height: 48,
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E283D) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: borderColor),
                  ),
                  child: Row(
                    children: [
                      // Tab 0: My Submissions
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _selectedTab = 0),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            decoration: BoxDecoration(
                              color: _selectedTab == 0
                                  ? AppColors.primary
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: _selectedTab == 0
                                  ? [
                                      BoxShadow(
                                        color: AppColors.primary.withValues(alpha: 0.35),
                                        blurRadius: 10,
                                        offset: const Offset(0, 3),
                                      ),
                                    ]
                                  : null,
                            ),
                            child: Center(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.send_rounded,
                                    size: 15,
                                    color: _selectedTab == 0 ? Colors.white : subtextColor,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'My Submissions',
                                    style: TextStyle(
                                      color: _selectedTab == 0 ? Colors.white : subtextColor,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  if (_submissions.isNotEmpty) ...[
                                    const SizedBox(width: 5),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: _selectedTab == 0
                                            ? Colors.white.withValues(alpha: 0.25)
                                            : AppColors.primary.withValues(alpha: 0.15),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        '${_submissions.length}',
                                        style: TextStyle(
                                          color: _selectedTab == 0 ? Colors.white : AppColors.primary,
                                          fontSize: 10,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),

                      // Tab 1: Approvals
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _selectedTab = 1),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            decoration: BoxDecoration(
                              color: _selectedTab == 1
                                  ? AppColors.primary
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: _selectedTab == 1
                                  ? [
                                      BoxShadow(
                                        color: AppColors.primary.withValues(alpha: 0.35),
                                        blurRadius: 10,
                                        offset: const Offset(0, 3),
                                      ),
                                    ]
                                  : null,
                            ),
                            child: Center(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.verified_user_rounded,
                                    size: 15,
                                    color: _selectedTab == 1 ? Colors.white : subtextColor,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Approvals',
                                    style: TextStyle(
                                      color: _selectedTab == 1 ? Colors.white : subtextColor,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  if (pendingApprovals.isNotEmpty) ...[
                                    const SizedBox(width: 5),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF59E0B),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        '${pendingApprovals.length}',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 10,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 6),

              // Tab Content Area
              Expanded(
                child: _isLoading
                    ? const Center(
                        child: CircularProgressIndicator(color: AppColors.primary),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadData,
                        color: AppColors.primary,
                        child: _selectedTab == 0
                            ? _buildSubmissionsView(
                                submissions: _submissions,
                                cardBg: cardBg,
                                borderColor: borderColor,
                                textColor: textColor,
                                subtextColor: subtextColor,
                              )
                            : _buildApprovalsView(
                                pendingApprovals: pendingApprovals,
                                historyApprovals: historyApprovals,
                                cardBg: cardBg,
                                borderColor: borderColor,
                                textColor: textColor,
                                subtextColor: subtextColor,
                              ),
                      ),
              ),
            ],
          ),
        ),
      );
  }

  /// 1. MY SUBMISSIONS VIEW
  Widget _buildSubmissionsView({
    required List<Map<String, dynamic>> submissions,
    required Color cardBg,
    required Color borderColor,
    required Color textColor,
    required Color subtextColor,
  }) {
    if (submissions.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.history_edu_rounded, color: AppColors.primary, size: 36),
              ),
              const SizedBox(height: 14),
              Text(
                'No Submissions Yet',
                style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                'When you report a student discipline incident via the scanner, your submitted actions and live status will appear here.',
                textAlign: TextAlign.center,
                style: TextStyle(color: subtextColor, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 95),
      itemCount: submissions.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final item = submissions[index];
        final studentName = item['student_name'] ?? 'Student';
        final regNo = item['reg_no'] ?? '';
        final dept = item['department_name'] ?? '';
        final category = item['category_title'] ?? 'Incident';
        final statusDisplay = _formatStatus(item);
        final statusColor = _getStatusColor(item);
        final remarks = item['remarks'] ?? '';
        final date = item['incident_date'] ?? '';

        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: borderColor),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Student Name & Live Status Badge
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          studentName,
                          style: TextStyle(
                            color: textColor,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$regNo ${dept.isNotEmpty ? '• $dept' : ''}',
                          style: TextStyle(
                            color: subtextColor,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (item['is_offline'] == true)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.4)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.access_time_rounded, // WhatsApp-like clock icon
                            size: 13,
                            color: Color(0xFFF59E0B),
                          ),
                          SizedBox(width: 4),
                          Text(
                            'Pending Sync',
                            style: TextStyle(
                              color: Color(0xFFF59E0B),
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                      ),
                      child: Text(
                        statusDisplay,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.report_problem_rounded, size: 14, color: AppColors.primary),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        category,
                        style: TextStyle(
                          color: textColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (remarks.toString().isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  '"$remarks"',
                  style: TextStyle(
                    color: subtextColor,
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    date.toString().split('T').first,
                    style: TextStyle(color: subtextColor.withValues(alpha: 0.6), fontSize: 10),
                  ),
                  if (item['is_offline'] == true)
                    GestureDetector(
                      onTap: () async {
                        final res = await OfflineStorageService.instance.syncOfflineIncidentsToDatabase();
                        _loadData();
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Sync completed. ${res['synced_count']} synced to DB.'),
                              backgroundColor: const Color(0xFF10B981),
                            ),
                          );
                        }
                      },
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.sync_rounded, size: 13, color: Color(0xFFF59E0B)),
                          SizedBox(width: 4),
                          Text(
                            'Sync to DB',
                            style: TextStyle(
                              color: Color(0xFFF59E0B),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    Text(
                      'Application Active in Flow',
                      style: TextStyle(color: AppColors.accentCyan, fontSize: 10, fontWeight: FontWeight.w700),
                    ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  /// 2. APPROVALS VIEW: Split into Pending Approvals on top and Forwarded/Resolved rows below
  Widget _buildApprovalsView({
    required List<Map<String, dynamic>> pendingApprovals,
    required List<Map<String, dynamic>> historyApprovals,
    required Color cardBg,
    required Color borderColor,
    required Color textColor,
    required Color subtextColor,
  }) {
    if (pendingApprovals.isEmpty && historyApprovals.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 36),
              ),
              const SizedBox(height: 14),
              Text(
                'No Approvals Pending',
                style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                'All student discipline requests assigned to your role have been cleared.',
                textAlign: TextAlign.center,
                style: TextStyle(color: subtextColor, fontSize: 12),
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 95),
      children: [
        // ── TOP SECTION: PENDING APPROVALS (IMPORTANT) ──
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: Color(0xFFF59E0B),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'PENDING APPROVALS',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: textColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${pendingApprovals.length} Action Required',
                style: const TextStyle(
                  color: Color(0xFFF59E0B),
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 10),

        if (pendingApprovals.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_outline_rounded, color: Color(0xFF10B981), size: 18),
                const SizedBox(width: 10),
                Text(
                  'No pending approval requests waiting.',
                  style: TextStyle(color: subtextColor, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          )
        else
          ...pendingApprovals.map((log) {
            final studentName = log['student_name'] ?? 'Student';
            final regNo = log['reg_no'] ?? '';
            final category = log['category_title'] ?? 'Incident';
            final role = (log['current_role'] ?? 'Approver').toString().replaceAll('_', ' ');
            final hasReceipt = (log['receipt_document'] != null || log['receipt_document_url'] != null);

            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardBg,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.5), width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.08),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          studentName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: textColor,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF6366F1).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          role,
                          style: const TextStyle(
                            color: Color(0xFF6366F1),
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    regNo,
                    style: TextStyle(color: subtextColor, fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    category,
                    style: TextStyle(color: textColor, fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        hasReceipt ? 'Receipt: Uploaded' : 'Receipt: Pending',
                        style: TextStyle(
                          color: hasReceipt ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF6366F1),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          elevation: 0,
                        ),
                        onPressed: () => _openActionModal(log),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.visibility_rounded, size: 14),
                            SizedBox(width: 4),
                            Text('View & Action', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),

        const SizedBox(height: 20),

        // ── BOTTOM SECTION: FORWARDED & APPROVED SUBMISSIONS (ROWS WISE) ──
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Row(
                children: [
                  const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 16),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'FORWARDED & APPROVED HISTORY',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: textColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${historyApprovals.length} records',
              style: TextStyle(color: subtextColor, fontSize: 11, fontWeight: FontWeight.w600),
            ),
          ],
        ),

        const SizedBox(height: 10),

        if (historyApprovals.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: borderColor),
            ),
            child: Text(
              'No previous processed applications.',
              style: TextStyle(color: subtextColor, fontSize: 12),
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: borderColor),
            ),
            child: Column(
              children: historyApprovals.map((log) {
                final studentName = log['student_name'] ?? 'Student';
                final regNo = log['reg_no'] ?? '';
                final isResolved = log['status'] == 'RESOLVED';
                final statusDisplay = _formatStatus(log);
                final statusColor = _getStatusColor(log);

                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: borderColor.withValues(alpha: 0.5))),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          isResolved ? Icons.check_circle_rounded : Icons.arrow_forward_rounded,
                          color: statusColor,
                          size: 16,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              studentName,
                              style: TextStyle(
                                color: textColor,
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              regNo,
                              style: TextStyle(color: subtextColor, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          statusDisplay,
                          style: TextStyle(
                            color: statusColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
      ],
    );
  }
}
