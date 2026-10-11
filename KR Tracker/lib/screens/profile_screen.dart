import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import 'auth_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  List<Map<String, dynamic>> _authorities = [];
  bool _loadingAuthorities = false;

  @override
  void initState() {
    super.initState();
    _loadAuthorities();
  }

  Future<void> _loadAuthorities() async {
    setState(() => _loadingAuthorities = true);
    final regNo = AppState.instance.studentId;
    final list = await ApiService.fetchStudentAuthorities(regNo: regNo);
    if (mounted) {
      setState(() {
        _authorities = list.where((a) {
          final rk = (a['role_key'] ?? '').toString().toUpperCase();
          final rn = (a['role'] ?? '').toString().toUpperCase();
          return !rk.contains('SUBMITTER') &&
              !rk.contains('DISCIPLINE') &&
              !rk.contains('PRINCIPAL') &&
              !rn.contains('SUBMITTER') &&
              !rn.contains('DISCIPLINE') &&
              !rn.contains('PRINCIPAL');
        }).toList();
        _loadingAuthorities = false;
      });
    }
  }

  Widget _buildInitialsAvatar(String name, bool isDark) {
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').map((p) => p.isNotEmpty ? p[0] : '').take(2).join().toUpperCase()
        : 'KR';
    return Container(
      width: double.infinity,
      height: double.infinity,
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
            fontSize: 26,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }

  IconData _getAuthorityIcon(String roleKey) {
    switch (roleKey.toUpperCase()) {
      case 'MENTOR':
        return Icons.school_rounded;
      case 'ADVISOR':
        return Icons.person_rounded;
      case 'HOD':
        return Icons.account_balance_rounded;
      default:
        return Icons.supervised_user_circle_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppState.instance;
    final isDark = state.isDarkMode;

    final bgColor = isDark ? AppColors.darkBg : AppColors.lightBg;
    final cardBg = isDark ? AppColors.darkCard : AppColors.lightCard;
    final textColor =
        isDark ? AppColors.darkTextPrimary : AppColors.lightTextPrimary;
    final subtextColor =
        isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
    final borderColor = isDark ? AppColors.darkBorder : AppColors.lightBorder;

    final isStudent = state.role == 'Student' ||
        state.backendRoles.contains('STUDENT') ||
        state.studentId.length >= 10;

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Header
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'ACCOUNT & SECURITY',
                  style: TextStyle(
                    color: textColor,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // Profile 3D Card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: cardBg,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: borderColor),
                  boxShadow: isDark
                      ? AppStyles.skeuoDarkShadow()
                      : AppStyles.skeuoLightShadow(),
                ),
                child: Column(
                  children: [
                    Stack(
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: AppColors.primary,
                              width: 3,
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(40),
                            child: () {
                              final pUrl = state.profileImageUrl ??
                                  (state.studentId.isNotEmpty
                                      ? 'https://db.krgi.co.in/media/profile_images/${state.studentId}.jpg'
                                      : null);
                              return (pUrl != null && pUrl.isNotEmpty)
                                  ? Image.network(
                                      pUrl,
                                      fit: BoxFit.cover,
                                      errorBuilder: (context, error, stackTrace) =>
                                          _buildInitialsAvatar(state.userName, isDark),
                                    )
                                  : _buildInitialsAvatar(state.userName, isDark);
                            }(),
                          ),
                        ),
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: const BoxDecoration(
                              color: Color(0xFF10B981),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.check,
                              color: Colors.white,
                              size: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      state.userName,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: textColor,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        state.roleTitle,
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${state.studentId} • ${state.department}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: subtextColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (state.email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        state.email,
                        style: TextStyle(
                          color: subtextColor.withValues(alpha: 0.8),
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],

                    const SizedBox(height: 16),

                    if (isStudent) ...[
                      // ── ROLES HIERARCHY IN HORIZONTAL SQUARE BOXES (GRID 3 IN A ROW) ──
                      // As requested: "in the student profile it should have that roles in the middle or next to the submitter
                      // that roles should show in horizontal square boxes and that should be in a grid 3 in a row.
                      // role below their name should be there. it should smaller the name if that name text length is long it should be auto adjusted."
                      Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF0F1420).withValues(alpha: 0.8)
                            : const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isDark ? const Color(0xFF263248) : const Color(0xFFE2E8F0),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'ASSIGNED AUTHORITIES',
                                style: TextStyle(
                                  color: AppColors.accentCyan,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          if (_loadingAuthorities)
                            const Center(
                              child: Padding(
                                padding: EdgeInsets.all(16.0),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.primary,
                                ),
                              ),
                            )
                          else
                            GridView.builder(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3, // Exactly 3 in a row
                                childAspectRatio: 0.95, // Horizontal square boxes
                                crossAxisSpacing: 8,
                                mainAxisSpacing: 8,
                              ),
                              itemCount: _authorities.length,
                              itemBuilder: (context, index) {
                                final auth = _authorities[index];
                                final name = auth['name']?.toString() ?? 'Authority';
                                final role = auth['role']?.toString() ?? 'Approver';
                                final roleKey = auth['role_key']?.toString() ?? '';

                                return Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: isDark
                                        ? const Color(0xFF161E2E)
                                        : Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(
                                      color: isDark
                                          ? const Color(0xFF2B3A52)
                                          : const Color(0xFFE2E8F0),
                                      width: 1.1,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(
                                          alpha: isDark ? 0.3 : 0.04,
                                        ),
                                        blurRadius: 6,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      // Role Icon
                                      Container(
                                        width: 28,
                                        height: 28,
                                        decoration: BoxDecoration(
                                          color: AppColors.primary.withValues(alpha: 0.15),
                                          shape: BoxShape.circle,
                                        ),
                                        child: Icon(
                                          _getAuthorityIcon(roleKey),
                                          size: 15,
                                          color: AppColors.primary,
                                        ),
                                      ),
                                      const SizedBox(height: 6),

                                      // Auto-adjusted Name: Automatically shrink text if long
                                      Expanded(
                                        child: Center(
                                          child: FittedBox(
                                            fit: BoxFit.scaleDown,
                                            child: Padding(
                                              padding: const EdgeInsets.symmetric(horizontal: 2.0),
                                              child: Text(
                                                name,
                                                textAlign: TextAlign.center,
                                                maxLines: 2,
                                                style: TextStyle(
                                                  color: textColor,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w800,
                                                  height: 1.15,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 4),

                                      // Role below their name
                                      Text(
                                        role,
                                        textAlign: TextAlign.center,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: AppColors.accentCyan,
                                          fontSize: 9,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 0.2,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),
                    ],

                    Text(
                      state.college,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Preferences Section
              _buildSettingTile(
                title: 'Dark / Light Mode',
                subtitle: isDark ? 'Currently in Dark Mode' : 'Currently in Light Mode',
                icon: isDark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
                isDark: isDark,
                cardBg: cardBg,
                borderColor: borderColor,
                textColor: textColor,
                subtextColor: subtextColor,
                trailing: Switch(
                  value: isDark,
                  activeThumbColor: AppColors.primary,
                  onChanged: (val) {
                    state.toggleTheme();
                  },
                ),
              ),

              const SizedBox(height: 12),

              _buildSettingTile(
                title: 'Biometric Gate Access',
                subtitle: 'Facial OCR & Touch ID enabled',
                icon: Icons.fingerprint_rounded,
                isDark: isDark,
                cardBg: cardBg,
                borderColor: borderColor,
                textColor: textColor,
                subtextColor: subtextColor,
                trailing: const Icon(Icons.arrow_forward_ios_rounded, size: 16),
              ),

              const SizedBox(height: 12),

              _buildSettingTile(
                title: 'Discipline Clearance Certificate',
                subtitle: 'Download digital PDF verification',
                icon: Icons.verified_user_rounded,
                isDark: isDark,
                cardBg: cardBg,
                borderColor: borderColor,
                textColor: textColor,
                subtextColor: subtextColor,
                trailing: const Icon(Icons.arrow_forward_ios_rounded, size: 16),
              ),

              const SizedBox(height: 24),

              // Sign Out Button
              GestureDetector(
                onTap: () {
                  state.signOut();
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (context) => const AuthScreen()),
                    (route) => false,
                  );
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.3),
                    ),
                  ),
                  child: const Center(
                    child: Text(
                      'Sign Out',
                      style: TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 95),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSettingTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required bool isDark,
    required Color cardBg,
    required Color borderColor,
    required Color textColor,
    required Color subtextColor,
    required Widget trailing,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: borderColor),
        boxShadow: isDark
            ? AppStyles.skeuoDarkShadow(blur: 8)
            : AppStyles.skeuoLightShadow(blur: 8),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: AppColors.primary, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: textColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: subtextColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          trailing,
        ],
      ),
    );
  }
}
