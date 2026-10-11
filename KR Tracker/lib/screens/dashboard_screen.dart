import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/offline_storage_service.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import 'staff_scanner_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _floatController;
  late Animation<double> _floatAnimation;

  List<Map<String, dynamic>> _studentPendingActions = [];
  List<Map<String, dynamic>> _studentCompletedActions = [];
  bool _loadingStudentIncidents = false;

  @override
  void initState() {
    super.initState();
    _floatController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat(reverse: true);

    _floatAnimation = Tween<double>(begin: -7.0, end: 7.0).animate(
      CurvedAnimation(
        parent: _floatController,
        curve: Curves.easeInOutSine,
      ),
    );

    _loadStudentIncidents();
  }

  Future<void> _loadStudentIncidents() async {
    setState(() => _loadingStudentIncidents = true);
    final data = await ApiService.fetchStudentMyIncidents();
    if (mounted) {
      setState(() {
        _studentPendingActions = List<Map<String, dynamic>>.from(data['pending_actions'] ?? []);
        _studentCompletedActions = List<Map<String, dynamic>>.from(data['completed_actions'] ?? []);
        _loadingStudentIncidents = false;
      });
    }
  }

  @override
  void dispose() {
    _floatController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final isDark = state.isDarkMode;
    // Student check: students strictly have no camera access or staff scanner
    final isStudent = state.role == 'Student' ||
        state.backendRoles.contains('STUDENT') ||
        state.studentId.length >= 10;
    final isStaff = !isStudent && state.role == 'Staff';

    final bgColor = isDark ? AppColors.darkBg : AppColors.lightBg;
    final cardBg = isDark ? AppColors.darkCard : Colors.white;
    final textColor =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final subtextColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    // Extract first name for warm personal greeting
    final nameParts = state.userName.trim().split(' ');
    final firstName = nameParts.isNotEmpty ? nameParts.first : state.userName;

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 1. TOP HEADER: Modern Squircle Profile Avatar, Name, Dept chip, and Theme Shifter
              Builder(
                builder: (context) {
                  final String? userPhotoUrl = state.profileImageUrl ?? () {
                    if (state.studentId.isNotEmpty) {
                      final st = OfflineStorageService.instance.getStudent(state.studentId);
                      final raw = st?['profile_image'];
                      return ApiService.formatProfileImageUrl(raw);
                    }
                    return null;
                  }();

                  final deptLabel = state.department.isNotEmpty && state.department != 'Campus Department'
                      ? state.department
                      : (isStaff ? state.roleTitle : 'Artificial Intelligence & Machine Learning');

                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Left: Enhanced Profile Avatar + Name + Department Section
                        Expanded(
                          child: Row(
                            children: [
                              // Enhanced Squircle Avatar with Dynamic Glowing Gradient Ring
                              Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  Container(
                                    width: 56,
                                    height: 56,
                                    padding: const EdgeInsets.all(2.5),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(19),
                                      gradient: const LinearGradient(
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                        colors: [
                                          Color(0xFF6366F1),
                                          Color(0xFF8B5CF6),
                                          Color(0xFFEC4899),
                                        ],
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF6366F1).withValues(alpha: 0.28),
                                          blurRadius: 12,
                                          offset: const Offset(0, 4),
                                        ),
                                      ],
                                    ),
                                    child: Container(
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(16.5),
                                        color: cardBg,
                                      ),
                                      clipBehavior: Clip.antiAlias,
                                      child: userPhotoUrl != null && userPhotoUrl.isNotEmpty
                                          ? Image.network(
                                              userPhotoUrl,
                                              fit: BoxFit.cover,
                                              errorBuilder: (context, error, stackTrace) =>
                                                  _buildInitialsAvatar(firstName, isDark),
                                            )
                                          : _buildInitialsAvatar(firstName, isDark),
                                    ),
                                  ),
                                  // Glowing Online/Verified Status Indicator
                                  Positioned(
                                    bottom: -1,
                                    right: -1,
                                    child: Container(
                                      width: 15,
                                      height: 15,
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF10B981),
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: isDark ? const Color(0xFF0F172A) : Colors.white,
                                          width: 2.5,
                                        ),
                                        boxShadow: [
                                          BoxShadow(
                                            color: const Color(0xFF10B981).withValues(alpha: 0.6),
                                            blurRadius: 6,
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(width: 14),

                              // Name & Department Section
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    // Top Portal Badge Tag
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: (isStaff ? const Color(0xFF6366F1) : const Color(0xFF10B981))
                                            .withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            isStaff ? Icons.verified_user_rounded : Icons.school_rounded,
                                            size: 10,
                                            color: isStaff ? const Color(0xFF6366F1) : const Color(0xFF10B981),
                                          ),
                                          const SizedBox(width: 4),
                                          Text(
                                            isStaff
                                                ? (state.roleTitle.isNotEmpty ? state.roleTitle.toUpperCase() : 'FACULTY')
                                                : 'STUDENT PORTAL',
                                            style: TextStyle(
                                              color: isStaff ? const Color(0xFF6366F1) : const Color(0xFF10B981),
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w800,
                                              letterSpacing: 0.8,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 3),

                                    // Hi, [Name] 👋
                                    Text(
                                      'Hi, $firstName 👋',
                                      style: TextStyle(
                                        color: textColor,
                                        fontSize: 21,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: -0.4,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),

                                    // Modern Department Pill & Reg/Staff ID
                                    Row(
                                      children: [
                                        Flexible(
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                                              borderRadius: BorderRadius.circular(7),
                                              border: Border.all(
                                                color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
                                                width: 0.8,
                                              ),
                                            ),
                                            child: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Icon(
                                                  Icons.apartment_rounded,
                                                  size: 11,
                                                  color: isDark ? Colors.white60 : const Color(0xFF64748B),
                                                ),
                                                const SizedBox(width: 4),
                                                Flexible(
                                                  child: Text(
                                                    deptLabel,
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: TextStyle(
                                                      color: isDark ? Colors.white70 : const Color(0xFF475569),
                                                      fontSize: 11,
                                                      fontWeight: FontWeight.w700,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                        if (state.studentId.isNotEmpty) ...[
                                          const SizedBox(width: 6),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: AppColors.primary.withValues(alpha: 0.1),
                                              borderRadius: BorderRadius.circular(7),
                                            ),
                                            child: Text(
                                              state.studentId,
                                              style: const TextStyle(
                                                color: AppColors.primary,
                                                fontSize: 10.5,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),

                        // Right: Theme Toggle
                        _buildThemeToggle(isDark),
                      ],
                    ),
                  );
                },
              ),

              const SizedBox(height: 24),

              // 2. METRIC CARDS ROW: Exactly 2 labels (Pending Actions, Total Actions) as requested
              Builder(
                builder: (context) {
                  final pendingCount = isStudent ? _studentPendingActions.length : state.violationsCount;
                  final totalCount = isStudent ? (_studentPendingActions.length + _studentCompletedActions.length) : 0;

                  return Row(
                    children: [
                      // Card 1: Pending Actions
                      Expanded(
                        child: _buildMetricCard(
                          label: 'Pending Actions',
                          value: '$pendingCount',
                          icon: Icons.hourglass_top_rounded,
                          iconColor: const Color(0xFFF59E0B),
                          iconBg: const Color(0xFFFEF3C7),
                          isDark: isDark,
                          cardBg: cardBg,
                          borderColor: borderColor,
                          textColor: textColor,
                          subtextColor: subtextColor,
                        ),
                      ),
                      const SizedBox(width: 14),

                      // Card 2: Total Actions
                      Expanded(
                        child: _buildMetricCard(
                          label: 'Total Actions',
                          value: '$totalCount',
                          icon: Icons.verified_user_rounded,
                          iconColor: const Color(0xFF10B981),
                          iconBg: const Color(0xFFD1FAE5),
                          isDark: isDark,
                          cardBg: cardBg,
                          borderColor: borderColor,
                          textColor: textColor,
                          subtextColor: subtextColor,
                        ),
                      ),
                    ],
                  );
                },
              ),

              const SizedBox(height: 24),

              // 3. BELOW STATE: If student has pending actions, display them; otherwise display celebratory "All clear!"
              if (isStudent && _loadingStudentIncidents)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                )
              else if (isStudent && _studentPendingActions.isNotEmpty)
                _buildPendingActionsList(
                  pendingActions: _studentPendingActions,
                  isDark: isDark,
                  cardBg: cardBg,
                  borderColor: borderColor,
                  textColor: textColor,
                  subtextColor: subtextColor,
                )
              else
                _buildCreativeEmptyState(
                  isDark: isDark,
                  cardBg: cardBg,
                  borderColor: borderColor,
                  textColor: textColor,
                  subtextColor: subtextColor,
                  isStaff: isStaff,
                ),

              const SizedBox(height: 90), // Taskbar breathing room
            ],
          ),
        ),
      ),
    );
  }

  /// Generates a modern gradient monogram initials avatar when photo is loading or unavailable
  Widget _buildInitialsAvatar(String name, bool isDark) {
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').map((p) => p.isNotEmpty ? p[0] : '').take(2).join().toUpperCase()
        : 'KR';
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF6366F1),
            Color(0xFF8B5CF6),
            Color(0xFFEC4899),
          ],
        ),
      ),
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w900,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
  }

  /// Exact top-right circular button for Light / Dark Mode Shifter matching the reference header
  Widget _buildThemeToggle(bool isDark) {
    return GestureDetector(
      onTap: () {
        setState(() {
          AppState.instance.toggleTheme();
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E283D) : Colors.white,
          shape: BoxShape.circle,
          border: Border.all(
            color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
            width: 1.2,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.08),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Center(
          child: Icon(
            isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
            size: 22,
            color: isDark ? const Color(0xFFFBBF24) : const Color(0xFF475569),
          ),
        ),
      ),
    );
  }

  /// Clean metric card matching the reference 2-card grid design
  Widget _buildMetricCard({
    required String label,
    required String value,
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required bool isDark,
    required Color cardBg,
    required Color borderColor,
    required Color textColor,
    required Color subtextColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: borderColor, width: 1.2),
        boxShadow: isDark
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ]
            : [
                BoxShadow(
                  color: const Color(0xFF64748B).withValues(alpha: 0.08),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Icon Pill + Label on top
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: isDark
                      ? iconColor.withValues(alpha: 0.18)
                      : iconBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  icon,
                  color: iconColor,
                  size: 18,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: textColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Big Bold Stat Number
          Text(
            value,
            style: TextStyle(
              color: textColor,
              fontSize: 30,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }

  /// Creative Empty State merging the happily telling animated character PNG with texts
  Widget _buildCreativeEmptyState({
    required bool isDark,
    required Color cardBg,
    required Color borderColor,
    required Color textColor,
    required Color subtextColor,
    required bool isStaff,
  }) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: borderColor, width: 1.2),
        boxShadow: isDark
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.35),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ]
            : [
                BoxShadow(
                  color: const Color(0xFF3B82F6).withValues(alpha: 0.08),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(30),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 22.0, vertical: 26.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Animated Floating Character with badges (Clean transparent presentation)
                  AnimatedBuilder(
                    animation: _floatAnimation,
                    builder: (context, child) {
                      return Transform.translate(
                        offset: Offset(0, _floatAnimation.value),
                        child: child,
                      );
                    },
                    child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: [
                        // Happy Student 3D Pixar Mascot (Transparent PNG without any square/shadow box)
                        SizedBox(
                          width: 190,
                          height: 190,
                          child: Image.asset(
                            'assets/happy_student.png',
                            fit: BoxFit.contain,
                          ),
                        ),

                        // Creative floating badge 1: Decorum Clean
                        Positioned(
                          top: 4,
                          right: -10,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF0F172A) : Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: const Color(0xFF10B981).withValues(alpha: 0.4),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.12),
                                  blurRadius: 8,
                                ),
                              ],
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 14),
                                SizedBox(width: 4),
                                Text(
                                  'Clean Record',
                                  style: TextStyle(
                                    color: Color(0xFF10B981),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),

                        // Creative floating badge 2: 100% Merit
                        
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Celebratory Title
                  ShaderMask(
                    shaderCallback: (bounds) => const LinearGradient(
                      colors: [Color(0xFF10B981), Color(0xFF059669)],
                    ).createShader(bounds),
                    child: const Text(
                      'All Clear! 🎉',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: -0.4,
                      ),
                    ),
                  ),

                  const SizedBox(height: 8),

                  // The specific requested text: "you have not got any actions from the staff."
                  Text(
                    isStaff
                        ? 'No disciplinary actions logged against students.'
                        : 'you have not got any actions from the Staffs.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: textColor,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      height: 1.35,
                    ),
                  ),

                  const SizedBox(height: 6),

                  // Friendly informative description
                  

                  const SizedBox(height: 18),

                  // Interactive Status Pill
                  if (isStaff)
                    ElevatedButton.icon(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (context) => const StaffScannerScreen(),
                          ),
                        );
                      },
                      icon: const Icon(Icons.camera_alt_rounded, size: 16),
                      label: const Text(
                        'Launch Staff Scanner',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    )
                  else
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: const Color(0xFF10B981).withValues(alpha: 0.3),
                        ),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.verified_rounded,
                            color: Color(0xFF10B981),
                            size: 15,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'Active Student Clearance',
                            style: TextStyle(
                              color: Color(0xFF059669),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// List of student pending actions replacing "All Clear!" when actions are pending
  Widget _buildPendingActionsList({
    required List<Map<String, dynamic>> pendingActions,
    required bool isDark,
    required Color cardBg,
    required Color borderColor,
    required Color textColor,
    required Color subtextColor,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section Header
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF59E0B),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'ACTION REQUIRED • PENDING REVIEW',
                  style: TextStyle(
                    color: textColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${pendingActions.length} Pending',
                style: const TextStyle(
                  color: Color(0xFFF59E0B),
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 12),

        // Cards list
        ...pendingActions.map((action) {
          final category = action['category_title'] ?? 'Discipline Notice';
          final remarks = action['remarks'] ?? '';
          final currentRole = (action['current_role'] ?? 'Approver').toString().replaceAll('_', ' ');
          final hasFine = action['has_fine'] == true;
          final fineAmount = action['fine_amount'] ?? 0;
          final hasReceipt = action['receipt_document'] != null || action['receipt_document_url'] != null;
          final date = action['incident_date'] ?? '';

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.5),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFF59E0B).withValues(alpha: 0.08),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Category & Pending Status Pill
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            category,
                            style: TextStyle(
                              color: textColor,
                              fontSize: 15,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Recorded by Staff • ${date.toString().split('T').first}',
                            style: TextStyle(color: subtextColor, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: const Color(0xFFF59E0B).withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.hourglass_empty_rounded, size: 12, color: Color(0xFFF59E0B)),
                          const SizedBox(width: 4),
                          Text(
                            'Pending at $currentRole',
                            style: const TextStyle(
                              color: Color(0xFFF59E0B),
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                if (remarks.toString().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: const Color(0xFFEF4444).withValues(alpha: 0.2),
                      ),
                    ),
                    child: Text(
                      '"$remarks"',
                      style: const TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 12),

                // Fine & Receipt details
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Text(
                          hasFine ? 'Fine: ₹$fineAmount' : 'No Monetary Fine',
                          style: TextStyle(
                            color: hasFine ? const Color(0xFFEF4444) : textColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (hasFine) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: hasReceipt
                                  ? const Color(0xFF10B981).withValues(alpha: 0.15)
                                  : const Color(0xFFEF4444).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              hasReceipt ? 'Receipt Uploaded' : 'Receipt Pending',
                              style: TextStyle(
                                color: hasReceipt ? const Color(0xFF10B981) : const Color(0xFFEF4444),
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    Text(
                      'Clearance In Progress',
                      style: TextStyle(
                        color: AppColors.accentCyan,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E283D) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline_rounded, size: 14, color: AppColors.primary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Awaiting clearance at $currentRole stage. Once resolved, status becomes All Clear!',
                          style: TextStyle(
                            color: subtextColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

