import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/offline_storage_service.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import 'record_incident_screen.dart';
import '../widgets/web_scanner_view.dart';

class StaffScannerScreen extends StatefulWidget {
  const StaffScannerScreen({super.key});

  @override
  State<StaffScannerScreen> createState() => _StaffScannerScreenState();
}

class _StaffScannerScreenState extends State<StaffScannerScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _laserController;
  final TextEditingController _barcodeInputController = TextEditingController();

  Map<String, dynamic>? _scannedStudent;
  bool _isLoading = false;
  String _activeBarcode = '';

  @override
  void initState() {
    super.initState();
    _laserController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    // Initial state is unscanned: photo placeholder alone
  }

  @override
  void dispose() {
    _laserController.dispose();
    _barcodeInputController.dispose();
    super.dispose();
  }

  Future<void> _scanBarcode(String barcode) async {
    final cleanCode = barcode.trim();
    if (cleanCode.isEmpty) return;

    if (_barcodeInputController.text != cleanCode) {
      _barcodeInputController.text = cleanCode;
    }

    setState(() {
      _isLoading = true;
      _activeBarcode = cleanCode;
    });

    final data = await ApiService.fetchStudentByBarcode(_activeBarcode);

    if (mounted) {
      setState(() {
        _scannedStudent = data;
        _isLoading = false;
      });
    }
  }

  void _navigateToRecordIncident() {
    if (_scannedStudent == null) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => RecordIncidentScreen(
          student: _scannedStudent!,
          barcode: _activeBarcode,
        ),
      ),
    );
  }

  void _openTakeActionSheet() {
    if (_scannedStudent == null) return;

    final student = _scannedStudent!;
    final regNo = student['reg_no'] ?? _activeBarcode;
    final name = student['name'] ?? 'Student';

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: const Color(0xFF1E2433),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.15),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.7),
                blurRadius: 30,
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white30,
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.shield_rounded,
                      color: AppColors.primary,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'STAFF DISCIPLINE & GATE ACTION',
                        style: TextStyle(
                          color: AppColors.accentCyan,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.1,
                        ),
                      ),
                      Text(
                        '$name ($regNo)',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 20),
              _buildActionItem(
                title: 'Grant Gate Outpass Exit',
                subtitle: 'Gate 02 (North) clearance stamp',
                icon: Icons.logout_rounded,
                color: const Color(0xFF10B981),
                onTap: () => _executeAction(regNo, 'GATE_EXIT', 'Exit Granted at Gate 02'),
              ),
              const SizedBox(height: 10),
              _buildActionItem(
                title: 'Log Gate Entry Check-in',
                subtitle: 'Verify return within approved duration',
                icon: Icons.login_rounded,
                color: const Color(0xFF06B6D4),
                onTap: () => _executeAction(regNo, 'GATE_ENTRY', 'Entry Recorded at Main Gate'),
              ),
              const SizedBox(height: 10),
              _buildActionItem(
                title: 'Record Decorum & Uniform Check',
                subtitle: 'Compliant ID card, dress code & etiquette',
                icon: Icons.verified_user_rounded,
                color: const Color(0xFF8B5CF6),
                onTap: () => _executeAction(regNo, 'DECORUM_OK', 'Uniform & ID Verified Clean'),
              ),
              const SizedBox(height: 10),
              _buildActionItem(
                title: 'Issue Discipline Notice',
                subtitle: 'Log dress violation or unauthorized late entry',
                icon: Icons.warning_amber_rounded,
                color: const Color(0xFFFF5E3A),
                onTap: () => _executeAction(regNo, 'WARNING', 'Decorum Infraction Recorded'),
              ),
              const SizedBox(height: 14),
            ],
          ),
        );
      },
    );
  }

  void _executeAction(String regNo, String actionType, String message) async {
    Navigator.of(context).pop();
    await ApiService.submitAction(
      regNo: regNo,
      actionType: actionType,
      notes: message,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF10B981),
        content: Text(
          message,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  Widget _buildActionItem({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF131A2A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: Colors.white60,
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: Colors.white38,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStudentPhotoWidget(String? photoUrl, String name, String regNo) {
    final candidateUrl = (photoUrl != null && photoUrl.isNotEmpty)
        ? photoUrl
        : AppState.instance.profileImageUrl;

    if (candidateUrl != null &&
        candidateUrl.isNotEmpty &&
        (candidateUrl.startsWith('http://') || candidateUrl.startsWith('https://'))) {
      return Image.network(
        candidateUrl,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return Container(
            color: const Color(0xFF1F2637),
            child: const Center(
              child: CircularProgressIndicator(
                color: AppColors.accentCyan,
                strokeWidth: 2.0,
              ),
            ),
          );
        },
        errorBuilder: (context, error, stackTrace) {
          final userPhoto = AppState.instance.profileImageUrl;
          if (userPhoto != null && userPhoto.isNotEmpty && userPhoto != candidateUrl) {
            return Image.network(
              userPhoto,
              fit: BoxFit.cover,
              errorBuilder: (c, e, s) => _buildInitialsAvatar(name, regNo),
            );
          }
          return _buildInitialsAvatar(name, regNo);
        },
      );
    }

    if (candidateUrl != null &&
        candidateUrl.isNotEmpty &&
        candidateUrl.startsWith('assets/') &&
        !candidateUrl.contains('discipline_student.jpg')) {
      return Image.asset(
        candidateUrl,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) =>
            _buildInitialsAvatar(name, regNo),
      );
    }

    return _buildInitialsAvatar(name, regNo);
  }

  Widget _buildInitialsAvatar(String name, String regNo) {
    final cleanName = name.trim();
    final initials = cleanName.isNotEmpty
        ? cleanName.split(' ').map((p) => p.isNotEmpty ? p[0] : '').take(2).join().toUpperCase()
        : (regNo.length >= 2 ? regNo.substring(regNo.length - 2) : 'KR');

    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF2563EB),
            Color(0xFF7C3AED),
            Color(0xFFDB2777),
          ],
        ),
      ),
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 34,
            fontWeight: FontWeight.w900,
            letterSpacing: -1,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final student = _scannedStudent;
    final name = student?['name']?.toString() ?? '';
    final dept = student?['department']?.toString() ?? '';
    final regNo = student?['reg_no']?.toString() ?? _activeBarcode;

    // Resolve photo URL exactly like Dashboard and Profile page
    final String? photoUrl = () {
      final state = AppState.instance;

      // 1. If scanned barcode matches logged-in user, use state.profileImageUrl
      if (state.profileImageUrl != null &&
          state.profileImageUrl!.isNotEmpty &&
          (regNo.isEmpty ||
              regNo == state.studentId ||
              regNo == state.userName ||
              state.studentId.contains(regNo) ||
              regNo.contains(state.studentId))) {
        return state.profileImageUrl;
      }

      // 2. Query OfflineStorageService exactly like DashboardScreen:
      if (regNo.isNotEmpty) {
        final st = OfflineStorageService.instance.getStudent(regNo);
        final raw = st?['profile_image'] ?? st?['profile_image_url'] ?? st?['photo'];
        final formatted = ApiService.formatProfileImageUrl(raw);
        if (formatted != null && formatted.isNotEmpty) {
          return formatted;
        }
      }

      // 3. Try the photo_url or raw profile_image from the student object
      final rawStudentImg = student?['profile_image'] ??
          student?['photo_url'] ??
          student?['image'] ??
          student?['photo'] ??
          student?['avatar'];
      final formattedStudent = ApiService.formatProfileImageUrl(rawStudentImg);
      if (formattedStudent != null &&
          formattedStudent.isNotEmpty &&
          !formattedStudent.contains('discipline_student.jpg')) {
        return formattedStudent;
      }

      // 4. Direct media folder lookup like ProfileScreen:
      if (regNo.isNotEmpty) {
        return 'https://db.krgi.co.in/media/profile_images/$regNo.jpg';
      }

      // 5. Fallback to state.profileImageUrl
      return state.profileImageUrl;
    }();

    return Scaffold(
      backgroundColor: const Color(0xFF161A23), // Dark matte surface from image
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20.0, 12.0, 20.0, 115.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Top Bar with Close/Back and Staff Badge
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  GestureDetector(
                    onTap: () {
                      if (Navigator.of(context).canPop()) {
                        Navigator.of(context).pop();
                      } else {
                        AppState.instance.setActiveNavIndex(0);
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF222838),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.1),
                        ),
                      ),
                      child: const Icon(
                        Icons.arrow_back_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF222838),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: AppColors.accentCyan.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Color(0xFF10B981),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'STAFF SCANNER • KRCT',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 36),
                ],
              ),

              const SizedBox(height: 24),

              // CASE 1: NO BARCODE SCANNED / DETECTED
              // User requirement: "if no barcode scanned and detected means there should have only the photo place holder alone no registernumber, name, and all then no approval leaders roles. then also no record incident / action."
              if (student == null) ...[
                Center(
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Outer Skeuomorphic Embossed Bevel Ring
                      Container(
                        width: 140,
                        height: 140,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFF1A1F2C),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.6),
                              offset: const Offset(6, 6),
                              blurRadius: 16,
                            ),
                            BoxShadow(
                              color: Colors.white.withValues(alpha: 0.08),
                              offset: const Offset(-4, -4),
                              blurRadius: 12,
                            ),
                          ],
                        ),
                      ),

                      // Photo Placeholder alone
                      Container(
                        width: 124,
                        height: 124,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFF141926),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.15),
                            width: 2.0,
                          ),
                        ),
                        child: _isLoading
                            ? const Center(
                                child: CircularProgressIndicator(
                                  color: AppColors.accentCyan,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : Center(
                                child: Icon(
                                  Icons.person_rounded,
                                  size: 60,
                                  color: Colors.white.withValues(alpha: 0.22),
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'No student barcode detected',
                  style: TextStyle(
                    color: Colors.white38,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 24),
              ]

              // CASE 2: BARCODE SCANNED & DETECTED
              // User requirement: "while the barcode scanner is detected a register number only the photo, name, then below registernumber and deparmtnent should show then action button"
              else ...[
                Center(
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Outer Skeuomorphic Embossed Bevel Ring
                      Container(
                        width: 140,
                        height: 140,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFF1A1F2C),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.6),
                              offset: const Offset(6, 6),
                              blurRadius: 16,
                            ),
                            BoxShadow(
                              color: Colors.white.withValues(alpha: 0.08),
                              offset: const Offset(-4, -4),
                              blurRadius: 12,
                            ),
                            BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.25),
                              blurRadius: 24,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                      ),

                      // Profile Image Container
                      Container(
                        width: 124,
                        height: 124,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppColors.accentCyan.withValues(alpha: 0.8),
                            width: 2.5,
                          ),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(62),
                          child: _isLoading
                              ? Container(
                                  color: const Color(0xFF1F2637),
                                  child: const Center(
                                    child: CircularProgressIndicator(
                                      color: AppColors.accentCyan,
                                      strokeWidth: 2.5,
                                    ),
                                  ),
                                )
                              : _buildStudentPhotoWidget(
                                  photoUrl,
                                  name,
                                  regNo,
                                ),
                        ),
                      ),

                      // Active Decorum Indicator Dot
                      Positioned(
                        bottom: 4,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.all(5),
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
                ),

                const SizedBox(height: 18),

                // Name
                Text(
                  name.isNotEmpty ? name : 'Student',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 8),

                // Below Name: Register Number and Department
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                  decoration: BoxDecoration(
                    color: const Color(0xFF22293A),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    dept.isNotEmpty ? 'REG: $regNo  •  $dept' : 'REG: $regNo',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.accentCyan,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),

                if (student['is_offline'] == true) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF59E0B).withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: const Color(0xFFF59E0B).withValues(alpha: 0.5),
                        width: 1,
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.offline_pin_rounded, size: 13, color: Color(0xFFF59E0B)),
                        SizedBox(width: 5),
                        Text(
                          'Offline Mode • Cached Record',
                          style: TextStyle(
                            color: Color(0xFFF59E0B),
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 20),

                // ACTION BUTTON
                GestureDetector(
                  onTap: _navigateToRecordIncident,
                  child: Container(
                    width: double.infinity,
                    height: 56,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [
                          Color(0xFF6366F1),
                          Color(0xFF8B5CF6),
                          Color(0xFFEC4899),
                        ],
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF6366F1).withValues(alpha: 0.5),
                          offset: const Offset(0, 8),
                          blurRadius: 20,
                        ),
                        BoxShadow(
                          color: Colors.white.withValues(alpha: 0.3),
                          offset: const Offset(0, -1),
                          blurRadius: 2,
                        ),
                      ],
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.bolt_rounded,
                          color: Colors.white,
                          size: 22,
                        ),
                        SizedBox(width: 8),
                        Text(
                          'RECORD INCIDENT / ACTION',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),

                // Quick Gate Clearance sheet & Scan Another
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    TextButton.icon(
                      onPressed: _openTakeActionSheet,
                      icon: const Icon(Icons.tune_rounded, size: 14, color: Colors.white54),
                      label: const Text(
                        'Quick Gate Actions',
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton.icon(
                      onPressed: () {
                        setState(() {
                          _scannedStudent = null;
                          _activeBarcode = '';
                        });
                      },
                      icon: const Icon(Icons.refresh_rounded, size: 14, color: Colors.white54),
                      label: const Text(
                        'Clear / New Scan',
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 14),
              ],

              const SizedBox(height: 18),

              // REAL-TIME LIVE BARCODE SCANNER AREA (Below Take Action button)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E2433),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.12),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.4),
                      offset: const Offset(0, 6),
                      blurRadius: 16,
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Row(
                          children: [
                            Icon(
                              Icons.barcode_reader,
                              color: AppColors.accentCyan,
                              size: 18,
                            ),
                            SizedBox(width: 8),
                            Text(
                              'REAL-TIME LIVE SCANNER',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.0,
                              ),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.fiber_manual_record,
                                color: Color(0xFF10B981),
                                size: 8,
                              ),
                              SizedBox(width: 4),
                              Text(
                                'LIVE SCANNING',
                                style: TextStyle(
                                  color: Color(0xFF10B981),
                                  fontSize: 9,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 14),

                    // Embedded Real-Time Optical Camera Barcode Scanner
                    WebScannerView(
                      height: 180,
                      onBarcodeScanned: (code) {
                        _scanBarcode(code);
                      },
                    ),

                    const SizedBox(height: 18),

                    // Direct Hardware Scanner / Manual Barcode Input
                    const Text(
                      'HARDWARE BARCODE GUN / MANUAL INPUT',
                      style: TextStyle(
                        color: Colors.white60,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 8),

                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 48,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            decoration: BoxDecoration(
                              color: const Color(0xFF131A2A),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.15),
                              ),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.qr_code_scanner_rounded,
                                  color: AppColors.accentCyan,
                                  size: 20,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: TextField(
                                    controller: _barcodeInputController,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                    decoration: InputDecoration(
                                      hintText: 'Scan or type Register ID...',
                                      hintStyle: TextStyle(
                                        color: Colors.white.withValues(alpha: 0.35),
                                        fontSize: 12,
                                      ),
                                      border: InputBorder.none,
                                      isDense: true,
                                      contentPadding: EdgeInsets.zero,
                                    ),
                                    onSubmitted: (val) {
                                      if (val.trim().isNotEmpty) {
                                        _scanBarcode(val.trim());
                                      }
                                    },
                                  ),
                                ),
                                if (_barcodeInputController.text.isNotEmpty)
                                  GestureDetector(
                                    onTap: () {
                                      setState(() {
                                        _barcodeInputController.clear();
                                      });
                                    },
                                    child: const Icon(
                                      Icons.close_rounded,
                                      color: Colors.white38,
                                      size: 18,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        GestureDetector(
                          onTap: () {
                            if (_barcodeInputController.text.trim().isNotEmpty) {
                              _scanBarcode(_barcodeInputController.text.trim());
                            }
                          },
                          child: Container(
                            height: 48,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            decoration: BoxDecoration(
                              color: const Color(0xFF2875FF),
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF2875FF).withValues(alpha: 0.3),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            child: const Center(
                              child: Text(
                                'LOOKUP',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.6,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
