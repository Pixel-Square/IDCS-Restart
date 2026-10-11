import 'dart:ui';
import 'package:flutter/material.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../screens/dashboard_screen.dart';
import '../screens/gatepass_screen.dart';
import '../screens/discipline_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/staff_scanner_screen.dart';

import '../services/notification_service.dart';

class MainNavigationShell extends StatefulWidget {
  const MainNavigationShell({super.key});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  final List<Widget> _pages = const [
    DashboardScreen(),     // Index 0: Home
    DisciplineScreen(),    // Index 1: Actions (Staff)
    StaffScannerScreen(),  // Index 2: Camera Scanner (with taskbar preserved)
    GatePassScreen(),      // Index 3: Gatepass
    ProfileScreen(),       // Index 4: Profile
  ];

  @override
  void initState() {
    super.initState();
    NotificationService.instance.startApprovalPolling();
  }

  @override
  void dispose() {
    NotificationService.instance.stopApprovalPolling();
    super.dispose();
  }

  void _onCenterCameraTap() {
    AppState.instance.setActiveNavIndex(2);
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;

    return ListenableBuilder(
      listenable: state,
      builder: (context, child) {
        final isDark = state.isDarkMode;
        final currentIndex = state.activeNavIndex;
        // Guaranteed non-staff for students: camera button strictly hidden from taskbar
        final isStudent = state.role == 'Student' ||
            state.backendRoles.contains('STUDENT') ||
            state.studentId.length >= 10;
        final isStaff = !isStudent && state.role == 'Staff';

        final bottomInset = MediaQuery.of(context).padding.bottom;
        final autoBottom = bottomInset > 0 ? bottomInset + 8 : 16.0;

        return Scaffold(
          extendBody: true,
          backgroundColor: Colors.transparent,
          body: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              IndexedStack(
                index: currentIndex,
                children: _pages,
              ),
              Positioned(
                bottom: autoBottom,
                left: 0,
                right: 0,
                child: _buildModernSkeuomorphicTaskbar(isDark, isStaff, currentIndex),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildModernSkeuomorphicTaskbar(bool isDark, bool isStaff, int currentIndex) {
    // Ultra-clean frosted glass blur effect: translucent so elements behind are softly blurred
    final barBg = isDark
        ? const Color(0xFF0F172A).withValues(alpha: 0.45)
        : Colors.white.withValues(alpha: 0.45);
    final borderColor = isDark
        ? Colors.white.withValues(alpha: 0.14)
        : Colors.white.withValues(alpha: 0.65);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      height: 74,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomCenter,
        children: [
          // Floating Frosted Glass Dock Container
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(32),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.06),
                  offset: const Offset(0, 8),
                  blurRadius: 24,
                  spreadRadius: 0,
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(32),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  height: 66,
                  decoration: BoxDecoration(
                    color: barBg,
                    borderRadius: BorderRadius.circular(32),
                    border: Border.all(color: borderColor, width: 1.2),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      // Tab 0: Home
                      _buildNavItem(
                        index: 0,
                        icon: Icons.dashboard_rounded,
                        label: 'Home',
                        isSelected: currentIndex == 0,
                        isDark: isDark,
                      ),

                      // If Staff: Tab 1: Actions (with My Submissions & Approvals)
                      if (isStaff)
                        _buildNavItem(
                          index: 1,
                          icon: Icons.fact_check_rounded,
                          label: 'Actions',
                          isSelected: currentIndex == 1,
                          isDark: isDark,
                        ),

                      // Center Gap for elevated camera ONLY if user role is Staff
                      if (isStaff) const SizedBox(width: 58),

                      // Tab 3: Gatepass / Passes
                      _buildNavItem(
                        index: 3,
                        icon: Icons.badge_rounded,
                        label: isStaff ? 'Gatepass' : 'Passes',
                        isSelected: currentIndex == 3,
                        isDark: isDark,
                      ),

                      // Tab 4: Profile
                      _buildNavItem(
                        index: 4,
                        icon: Icons.person_rounded,
                        label: 'Profile',
                        isSelected: currentIndex == 4,
                        isDark: isDark,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // UNIQUE ELEVATED CENTER 3D CAMERA BUTTON - SHOWN ONLY FOR STAFF
          if (isStaff)
            Positioned(
              top: -12,
              child: GestureDetector(
                onTap: _onCenterCameraTap,
                child: Container(
                  width: 68,
                  height: 68,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    // Multi-layered realistic outer bezel
                    gradient: isDark
                        ? const RadialGradient(
                            colors: [Color(0xFF374151), Color(0xFF111827)],
                          )
                        : const RadialGradient(
                            colors: [Colors.white, Color(0xFFE2E8F0)],
                          ),
                    border: Border.all(
                      color: isDark
                          ? const Color(0xFF4B5563)
                          : const Color(0xFFFFFFFF),
                      width: 3.0,
                    ),
                    boxShadow: [
                      // Ambient bottom drop shadow
                      BoxShadow(
                        color: const Color(0xFF6366F1).withValues(alpha: 0.55),
                        offset: const Offset(0, 10),
                        blurRadius: 20,
                        spreadRadius: 2,
                      ),
                      // High-glow backlight
                      BoxShadow(
                        color: const Color(0xFF06B6D4).withValues(alpha: 0.4),
                        blurRadius: 25,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  padding: const EdgeInsets.all(5),
                  child: Container(
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      // Vibrant 3D Camera Core Button
                      gradient: LinearGradient(
                        colors: [
                          Color(0xFF6366F1),
                          Color(0xFF8B5CF6),
                          Color(0xFFEC4899),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Glossy glass lens reflection arc
                        Positioned(
                          top: 4,
                          child: Container(
                            width: 32,
                            height: 12,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.35),
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                        // Camera Icon with depth shadow
                        const Icon(
                          Icons.camera_alt_rounded,
                          color: Colors.white,
                          size: 28,
                          shadows: [
                            Shadow(
                              color: Colors.black45,
                              blurRadius: 6,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required String label,
    required bool isSelected,
    required bool isDark,
  }) {
    final activeColor = isDark ? const Color(0xFF818CF8) : AppColors.primary;
    final inactiveColor = isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);

    return GestureDetector(
      onTap: () {
        AppState.instance.setActiveNavIndex(index);
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark
                  ? const Color(0xFF6366F1).withValues(alpha: 0.22)
                  : AppColors.primary.withValues(alpha: 0.12))
              : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 22,
              color: isSelected ? activeColor : inactiveColor,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? activeColor : inactiveColor,
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
