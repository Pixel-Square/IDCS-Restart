import 'package:flutter/material.dart';
import '../services/offline_storage_service.dart';
import '../navigation/main_navigation_shell.dart';
import '../theme/app_theme.dart';

class OfflineSyncScreen extends StatefulWidget {
  final bool autoProceed;

  const OfflineSyncScreen({
    super.key,
    this.autoProceed = true,
  });

  @override
  State<OfflineSyncScreen> createState() => _OfflineSyncScreenState();
}

class _OfflineSyncScreenState extends State<OfflineSyncScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  bool _isSyncing = true;
  String _statusText = 'Connecting to campus database...';
  int _studentsCount = 0;
  int _categoriesCount = 0;
  bool _isSuccess = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    _startDataPull();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _startDataPull() async {
    setState(() {
      _isSyncing = true;
      _statusText = 'Pulling registered student directory & DC admin categories...';
    });

    final res = await OfflineStorageService.instance.pullLatestDataFromBackend();

    if (mounted) {
      final int sCount = res['students_count'] ?? OfflineStorageService.instance.getAllStudents().length;
      final int cCount = res['categories_count'] ?? OfflineStorageService.instance.getCategories().length;

      setState(() {
        _isSyncing = false;
        _isSuccess = res['success'] == true || sCount > 0;
        _studentsCount = sCount;
        _categoriesCount = cCount;
        if (res['success'] == true) {
          _statusText = 'Database snapshot updated successfully!';
          _errorMessage = null;
        } else {
          _statusText = 'Campus offline database snapshot armed and ready.';
          // Only show brief note if offline seed was loaded
          _errorMessage = sCount > 0 ? null : res['error']?.toString();
        }
      });

      if (widget.autoProceed) {
        // Auto proceed smoothly into the workspace
        Future.delayed(const Duration(milliseconds: 1200), () {
          if (mounted) {
            _proceedToHome();
          }
        });
      }
    }
  }


  void _proceedToHome() {
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) =>
            const MainNavigationShell(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 400),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Spacer(),

              // Glowing database icon with pulse animation
              AnimatedBuilder(
                animation: _pulseController,
                builder: (context, child) {
                  final scale = 1.0 + (_pulseController.value * 0.08);
                  return Transform.scale(
                    scale: scale,
                    child: Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          colors: [Color(0xFF6366F1), Color(0xFF06B6D4)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF6366F1).withValues(alpha: 0.5),
                            blurRadius: 30,
                            spreadRadius: 4,
                          ),
                        ],
                      ),
                      child: Icon(
                        _isSyncing
                            ? Icons.sync_rounded
                            : (_isSuccess ? Icons.cloud_done_rounded : Icons.offline_pin_rounded),
                        color: Colors.white,
                        size: 48,
                      ),
                    ),
                  );
                },
              ),

              const SizedBox(height: 36),

              const Text(
                'OFFLINE CAMPUS DATABASE',
                style: TextStyle(
                  color: AppColors.accentCyan,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 2.0,
                ),
              ),

              const SizedBox(height: 10),

              Text(
                _isSyncing ? 'Pulling Offline Data...' : 'Offline Ready',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: 10),

              Text(
                _statusText,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),

              const SizedBox(height: 36),

              // Status Metrics Cards
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(
                    color: const Color(0xFF334155),
                    width: 1.2,
                  ),
                ),
                child: Column(
                  children: [
                    _buildMetricRow(
                      icon: Icons.people_alt_rounded,
                      label: 'Student Directory',
                      value: _isSyncing
                          ? 'Downloading (2,950+ records)...'
                          : '${_formatCount(_studentsCount)} Students Cached',
                      color: const Color(0xFF06B6D4),
                      done: !_isSyncing,
                    ),
                    const Divider(color: Color(0xFF334155), height: 24),
                    _buildMetricRow(
                      icon: Icons.category_rounded,
                      label: 'Discipline Categories',
                      value: _isSyncing
                          ? 'Configuring DC Admin Rules...'
                          : '$_categoriesCount Categories Loaded',
                      color: const Color(0xFF10B981),
                      done: !_isSyncing,
                    ),

                    const Divider(color: Color(0xFF334155), height: 24),
                    _buildMetricRow(
                      icon: Icons.offline_bolt_rounded,
                      label: 'Offline Engine Status',
                      value: 'Local Storage Armed',
                      color: const Color(0xFFF59E0B),
                      done: true,
                    ),
                  ],
                ),
              ),

              if (_errorMessage != null) ...[
                const SizedBox(height: 16),
                Text(
                  'Notice: Server sync timed out ($_errorMessage). Offline seed cached active.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFFF59E0B),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],

              const Spacer(),

              // Proceed button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6366F1),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 4,
                  ),
                  onPressed: _proceedToHome,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _isSyncing ? 'Continue with Cached Data' : 'Launch Workspace',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Icon(Icons.arrow_forward_rounded, size: 18),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricRow({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
    required bool done,
  }) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                value,
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        if (done)
          const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 18)
        else
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF6366F1)),
          ),
      ],
    );
  }

  String _formatCount(int count) {
    if (count >= 1000) {
      final s = count.toString();
      final first = s.substring(0, s.length - 3);
      final last = s.substring(s.length - 3);
      return '$first,$last';
    }
    return count.toString();
  }
}

