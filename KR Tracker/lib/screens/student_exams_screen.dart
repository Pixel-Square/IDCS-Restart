import 'dart:async';
import 'package:flutter/material.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';
import 'student_take_exam_screen.dart';

class StudentExamsScreen extends StatefulWidget {
  const StudentExamsScreen({super.key});

  @override
  State<StudentExamsScreen> createState() => _StudentExamsScreenState();
}

class _StudentExamsScreenState extends State<StudentExamsScreen> {
  int _selectedTab = 0; // 0: Available & Live, 1: Upcoming & History
  bool _isLoading = true;
  String _errorMessage = '';
  String _studentSection = '';
  List<Map<String, dynamic>> _activeExams = [];
  List<Map<String, dynamic>> _pastExams = [];
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadExams();
    // Auto-poll active exams every 4 seconds to catch admin starting/ending exams live
    _refreshTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (mounted) _loadExams(isBackground: true);
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadExams({bool isBackground = false}) async {
    if (!isBackground) {
      setState(() {
        _isLoading = true;
        _errorMessage = '';
      });
    }

    try {
      final res = await ApiService.fetchStudentOnlineExams();
      if (mounted) {
        setState(() {
          _isLoading = false;
          if (res['success'] == true) {
            _activeExams = List<Map<String, dynamic>>.from(res['active'] ?? []);
            _pastExams = List<Map<String, dynamic>>.from(res['past'] ?? []);
            _studentSection = res['student_section'] ?? '';
            // Also notify AppState so taskbar status updates accurately
            AppState.instance.checkStudentExams();
          } else {
            _errorMessage = 'Unable to fetch exams. Please swipe down to refresh.';
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Connection error: $e';
        });
      }
    }
  }

  void _showExamInstructionsModal(BuildContext context, Map<String, dynamic> exam) {
    bool agreed = false;
    final isDark = AppState.instance.isDarkMode;
    final maxViolations = exam['max_violations'] ?? 3;
    final cooldownSecs = exam['cooldown_seconds'] ?? 30;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final sheetBg = isDark ? const Color(0xFF131A2A) : Colors.white;
            final titleColor = isDark ? Colors.white : AppColors.lightTextPrimary;
            final subColor = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

            return Container(
              height: MediaQuery.of(context).size.height * 0.85,
              decoration: BoxDecoration(
                color: sheetBg,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 30,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: Column(
                children: [
                  // Handle bar
                  Center(
                    child: Container(
                      margin: const EdgeInsets.only(top: 12, bottom: 8),
                      width: 48,
                      height: 5,
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white24 : Colors.black12,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),

                  // Header
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                            ),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: const Icon(Icons.security_rounded, color: Colors.white, size: 26),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                exam['title'] ?? 'Examination Instructions',
                                style: TextStyle(
                                  color: titleColor,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w900,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                '${exam['course_code'] ?? ''} • ${exam['duration_minutes'] ?? 0} Minutes',
                                style: TextStyle(
                                  color: subColor,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: Icon(Icons.close_rounded, color: subColor),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                  ),

                  const Divider(height: 1),

                  // Instructions List
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.all(24),
                      children: [
                        Text(
                          'MANDATORY PROCTORING RULES',
                          style: TextStyle(
                            color: const Color(0xFF6366F1),
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 16),
                        _buildInstructionRow(
                          icon: Icons.fullscreen_rounded,
                          color: Colors.indigo,
                          title: 'Immersive Full Screen Locked',
                          desc: 'Once started, the app enters locked full-screen mode. Navigation bar, notification shade, recents bar, and home button are completely disabled.',
                          isDark: isDark,
                        ),
                        const SizedBox(height: 14),
                        _buildInstructionRow(
                          icon: Icons.no_photography_rounded,
                          color: const Color(0xFFF43F5E),
                          title: 'Anti-Screenshot & Hardware Shield',
                          desc: 'Screenshots and screen recordings are strictly prohibited and hardware-blocked (FLAG_SECURE). Any screenshot attempt will show an anti-screenshot watermark and be logged.',
                          isDark: isDark,
                        ),
                        const SizedBox(height: 14),
                        _buildInstructionRow(
                          icon: Icons.touch_app_rounded,
                          color: Colors.amber,
                          title: 'No Hold, Selection or Copy/Paste',
                          desc: 'Text selection, long-press context menus, and copy-paste are disabled across the entire test interface.',
                          isDark: isDark,
                        ),
                        const SizedBox(height: 14),
                        _buildInstructionRow(
                          icon: Icons.timer_outlined,
                          color: Colors.red,
                          title: '$cooldownSecs-Second Cooldown & Auto-Kick',
                          desc: 'Switching apps, minimizing, or exiting full screen triggers a $cooldownSecs-second countdown warning. You are permitted at most $maxViolations attempts before being disqualified and kicked.',
                          isDark: isDark,
                        ),
                        const SizedBox(height: 14),
                        _buildInstructionRow(
                          icon: Icons.shuffle_rounded,
                          color: Colors.teal,
                          title: 'Dynamic Question & Option Shuffling',
                          desc: 'Questions and options are randomized uniquely for every student. Answers are auto-saved in real-time.',
                          isDark: isDark,
                        ),
                      ],
                    ),
                  ),

                  // Bottom Action Box
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
                      border: Border(top: BorderSide(color: isDark ? Colors.white12 : Colors.black12)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Agreement Checkbox
                        GestureDetector(
                          onTap: () {
                            setModalState(() {
                              agreed = !agreed;
                            });
                          },
                          child: Row(
                            children: [
                              Checkbox(
                                value: agreed,
                                onChanged: (val) {
                                  setModalState(() {
                                    agreed = val ?? false;
                                  });
                                },
                                activeColor: const Color(0xFF6366F1),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                              ),
                              Expanded(
                                child: Text(
                                  'I understand and strictly agree to all proctoring guidelines and the $maxViolations-attempt malpractice policy.',
                                  style: TextStyle(
                                    color: titleColor,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),

                        // Start Exam Button
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: ElevatedButton(
                            onPressed: agreed
                                ? () {
                                    Navigator.pop(ctx);
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => StudentTakeExamScreen(
                                          examId: exam['id'] as int,
                                          examTitle: exam['title'] ?? 'Online Exam',
                                        ),
                                      ),
                                    ).then((_) => _loadExams(isBackground: true));
                                  }
                                : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF6366F1),
                              disabledBackgroundColor: isDark ? Colors.white12 : Colors.black12,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              elevation: agreed ? 4 : 0,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.fullscreen_rounded, color: Colors.white, size: 22),
                                const SizedBox(width: 8),
                                Text(
                                  exam['is_retest'] == true ? 'START RE-TEST (FULL SCREEN)' : 'ENTER FULL SCREEN EXAM',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildInstructionRow({
    required IconData icon,
    required Color color,
    required String title,
    required String desc,
    required bool isDark,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: color.withValues(alpha: 0.3)),
          ),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: isDark ? Colors.white : AppColors.lightTextPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                desc,
                style: TextStyle(
                  color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  fontSize: 11,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final isDark = state.isDarkMode;

    final bgColor = isDark ? AppColors.darkBg : AppColors.lightBg;
    final textColor = isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final subtextColor = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'ONLINE EXAMS',
                            style: TextStyle(
                              color: textColor,
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.5,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF6366F1).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: const Color(0xFF6366F1).withValues(alpha: 0.3)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF6366F1),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  _studentSection.isNotEmpty ? _studentSection : (state.department),
                                  style: const TextStyle(
                                    color: Color(0xFF6366F1),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      Text(
                        'Proctored Assessment Hub • Section Filtered',
                        style: TextStyle(
                          color: subtextColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  IconButton(
                    onPressed: () => _loadExams(),
                    icon: Icon(Icons.refresh_rounded, color: textColor),
                    tooltip: 'Refresh Exams',
                  ),
                ],
              ),
            ),

            // Tab Selector (Available & Live vs Upcoming & History)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E283D) : const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: _buildTabButton(
                        index: 0,
                        title: 'Available & Live',
                        count: _activeExams.length,
                        isSelected: _selectedTab == 0,
                        isDark: isDark,
                      ),
                    ),
                    Expanded(
                      child: _buildTabButton(
                        index: 1,
                        title: 'Upcoming & History',
                        count: _pastExams.length,
                        isSelected: _selectedTab == 1,
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 8),

            // Content Area
            Expanded(
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(color: Color(0xFF6366F1)),
                    )
                  : RefreshIndicator(
                      onRefresh: () => _loadExams(),
                      color: const Color(0xFF6366F1),
                      child: _selectedTab == 0
                          ? _buildExamsList(_activeExams, isLiveList: true, isDark: isDark)
                          : _buildExamsList(_pastExams, isLiveList: false, isDark: isDark),
                    ),
            ),

            // Taskbar spacing
            const SizedBox(height: 90),
          ],
        ),
      ),
    );
  }

  Widget _buildTabButton({
    required int index,
    required String title,
    required int count,
    required bool isSelected,
    required bool isDark,
  }) {
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedTab = index;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark ? const Color(0xFF0F172A) : Colors.white)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.08),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              title,
              style: TextStyle(
                color: isSelected
                    ? (isDark ? Colors.white : AppColors.lightTextPrimary)
                    : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: isSelected
                    ? const Color(0xFF6366F1)
                    : (isDark ? Colors.white12 : Colors.black12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  color: isSelected
                      ? Colors.white
                      : (isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExamsList(List<Map<String, dynamic>> exams, {required bool isLiveList, required bool isDark}) {
    if (exams.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isLiveList ? Icons.quiz_outlined : Icons.history_edu_rounded,
                    size: 36,
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  isLiveList ? 'No Live Exams Today' : 'No History Recorded',
                  style: TextStyle(
                    color: isDark ? Colors.white : AppColors.lightTextPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _errorMessage.isNotEmpty
                      ? _errorMessage
                      : (isLiveList
                          ? 'When an exam is scheduled or started by IQAC/Faculty for your section, it will appear here.'
                          : 'Past exam submissions and results will be archived here.'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      itemCount: exams.length,
      itemBuilder: (context, index) {
        final ex = exams[index];
        return _buildExamCard(ex, isLiveList: isLiveList, isDark: isDark);
      },
    );
  }

  Widget _buildExamCard(Map<String, dynamic> ex, {required bool isLiveList, required bool isDark}) {
    final status = (ex['status'] ?? 'SCHEDULED').toString().toUpperCase();
    final isRunning = status == 'RUNNING';
    final isRetest = ex['is_retest'] == true;
    final sub = ex['submission'] as Map<String, dynamic>?;
    final isKicked = sub?['is_kicked'] == true;
    final isSubmitted = sub?['submitted'] == true;

    final cardBg = isDark ? AppColors.darkCard : AppColors.lightCard;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;
    final titleColor = isDark ? Colors.white : AppColors.lightTextPrimary;
    final subColor = isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isRunning
              ? const Color(0xFF10B981).withValues(alpha: 0.5)
              : isRetest
                  ? Colors.amber.withValues(alpha: 0.5)
                  : borderColor,
          width: isRunning || isRetest ? 1.5 : 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.05),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Row: Course Code & Status Badge
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Course Code Chip
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6366F1).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFF6366F1).withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    ex['course_code'] ?? 'EXAM',
                    style: const TextStyle(
                      color: Color(0xFF6366F1),
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),

                // Status Badge
                _buildStatusBadge(
                  status: status,
                  isRunning: isRunning,
                  isRetest: isRetest,
                  isKicked: isKicked,
                  isSubmitted: isSubmitted,
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Exam Title
            Text(
              ex['title'] ?? 'Online Assessment',
              style: TextStyle(
                color: titleColor,
                fontSize: 16,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 2),

            // Course Name
            Text(
              ex['course_name'] ?? 'Departmental Course',
              style: TextStyle(
                color: subColor,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),

            // Kicked Warning Box
            if (isKicked) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.gavel_rounded, color: Colors.red, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Kicked: ${sub?['kicked_reason'] ?? 'Disqualified due to malpractice violation'}',
                        style: const TextStyle(
                          color: Colors.red,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 14),

            // Metadata Chips (Date, Duration, Questions)
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _buildMetaChip(
                  icon: Icons.calendar_today_rounded,
                  label: ex['exam_date'] ?? 'Today',
                  isDark: isDark,
                ),
                _buildMetaChip(
                  icon: Icons.timer_outlined,
                  label: '${ex['duration_minutes'] ?? 0} Mins',
                  isDark: isDark,
                ),
                _buildMetaChip(
                  icon: Icons.format_list_numbered_rounded,
                  label: '${ex['questions_count'] ?? 0} Qs',
                  isDark: isDark,
                ),
              ],
            ),

            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 14),

            // Action Button
            if (isLiveList && (isRunning || isRetest)) ...[
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () => _showExamInstructionsModal(context, ex),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isRetest ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 3,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 22),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          isRetest ? 'START RE-TEST' : 'START EXAM NOW',
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ] else if (isLiveList) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.schedule_rounded, size: 16, color: subColor),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'Scheduled • Awaiting Faculty / IQAC Start',
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                        style: TextStyle(
                          color: subColor,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              // Past / Completed row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isKicked ? Icons.cancel_rounded : Icons.check_circle_rounded,
                        color: isKicked ? Colors.red : const Color(0xFF10B981),
                        size: 18,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        isKicked
                            ? 'Disqualified'
                            : isSubmitted
                                ? 'Submitted'
                                : 'Ended',
                        style: TextStyle(
                          color: isKicked ? Colors.red : const Color(0xFF10B981),
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: sub?['is_results_published'] == true && sub?['score'] != null
                        ? Text(
                            'Score: ${sub?['score']} / ${sub?['total_questions']}',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: titleColor,
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                            ),
                          )
                        : Text(
                            'Results Pending',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: subColor,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge({
    required String status,
    required bool isRunning,
    required bool isRetest,
    required bool isKicked,
    required bool isSubmitted,
  }) {
    Color bg;
    Color fg;
    String text;

    if (isKicked) {
      bg = Colors.red.withValues(alpha: 0.12);
      fg = Colors.red;
      text = 'KICKED';
    } else if (isRetest) {
      bg = Colors.amber.withValues(alpha: 0.15);
      fg = Colors.amber.shade800;
      text = 'RE-TEST';
    } else if (isRunning) {
      bg = const Color(0xFF10B981).withValues(alpha: 0.15);
      fg = const Color(0xFF10B981);
      text = 'LIVE NOW';
    } else if (isSubmitted) {
      bg = const Color(0xFF6366F1).withValues(alpha: 0.12);
      fg = const Color(0xFF6366F1);
      text = 'SUBMITTED';
    } else if (status == 'ENDED') {
      bg = Colors.grey.withValues(alpha: 0.15);
      fg = Colors.grey;
      text = 'ENDED';
    } else {
      bg = const Color(0xFF06B6D4).withValues(alpha: 0.12);
      fg = const Color(0xFF06B6D4);
      text = 'SCHEDULED';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isRunning) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
            const SizedBox(width: 5),
          ],
          Text(
            text,
            style: TextStyle(
              color: fg,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetaChip({required IconData icon, required String label, required bool isDark}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
