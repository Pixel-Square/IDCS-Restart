import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../state/app_state.dart';
import '../utils/platform_utils.dart';
import 'offline_sync_screen.dart';
import 'onboarding_screen.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _obscurePassword = true;
  bool _rememberMe = true;
  bool _isLoading = false;
  String? _errorMessage;

  final TextEditingController _idController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  // KR Track Brand Palette
  static const Color midnightNavy = Color(0xFF071B49);
  static const Color electricCyan = Color(0xFF00B8FF);
  static const Color electricBlue = Color(0xFF2674F5);
  static const Color royalViolet = Color(0xFF702BEE);
  static const Color inputBg = Color(0xFFF1F5F9);
  static const Color mutedText = Color(0xFF64748B);

  @override
  void dispose() {
    _idController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _openZynix() {
    openBrowserUrl('https://zynix.us');
  }

  void _onAuthenticate() async {
    final identifier = _idController.text.trim();
    final password = _passwordController.text.trim();

    if (identifier.isEmpty || password.isEmpty) {
      setState(() {
        _errorMessage = 'Please enter your username and password.';
      });
      _showErrorToast(_errorMessage!);
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final result = await ApiService.login(
      identifier: identifier,
      password: password,
    );

    if (!mounted) return;

    if (result['success'] == true) {
      final state = AppState.instance;
      final user = (result['user'] as Map<String, dynamic>?) ?? {};
      final detectedRole = (result['role'] as String?) ?? 'Student';
      final roleTitle = (result['roleTitle'] as String?) ?? detectedRole;
      final backendRoles = (result['backendRoles'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [];

      state.setUserFromBackend(
        userProfile: user,
        primaryRole: detectedRole,
        roleTitle: roleTitle,
        backendRoles: backendRoles,
      );

      setState(() {
        _isLoading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: const Color(0xFF10B981),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          duration: const Duration(seconds: 2),
          content: Row(
            children: [
              const Icon(Icons.check_circle_rounded, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Welcome, ${state.userName}! Logged in as $roleTitle',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      );

      Navigator.of(context).pushReplacement(
        PageRouteBuilder(
          pageBuilder: (context, animation, secondaryAnimation) =>
              const OfflineSyncScreen(autoProceed: true),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
          transitionDuration: const Duration(milliseconds: 450),
        ),
      );
    } else {
      setState(() {
        _isLoading = false;
        _errorMessage = result['message'] ??
            'Invalid credentials. Please check your username and password.';
      });

      _showErrorToast(_errorMessage!);
    }
  }

  void _showErrorToast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFFE11D48),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        duration: const Duration(seconds: 3),
        content: Row(
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onBack() {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const OnboardingScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    // Header height where the student leans
    final headerHeight = size.height * 0.38;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SingleChildScrollView(
        child: SizedBox(
          height: size.height > 720 ? size.height : 720,
          child: Stack(
            children: [
              // 1. TOP HEADER BACKGROUND: Deep Midnight Campus Atmosphere
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: headerHeight + 20,
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color(0xFF040E26),
                        Color(0xFF0A1D45),
                        Color(0xFF132A60),
                      ],
                    ),
                  ),
                  child: Stack(
                    children: [
                      // Ambient Cyan Glow Sphere
                      Positioned(
                        top: -40,
                        right: -30,
                        width: 220,
                        height: 220,
                        child: Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [
                                electricCyan.withValues(alpha: 0.28),
                                Colors.transparent,
                              ],
                            ),
                          ),
                        ),
                      ),
                      // Ambient Violet Glow Sphere
                      Positioned(
                        top: 40,
                        left: -40,
                        width: 200,
                        height: 200,
                        child: Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [
                                royalViolet.withValues(alpha: 0.22),
                                Colors.transparent,
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // 2. Back Button (< only, no circular outline)
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.only(left: 12.0, top: 12.0),
                  child: GestureDetector(
                    onTap: _onBack,
                    behavior: HitTestBehavior.opaque,
                    child: const Padding(
                      padding: EdgeInsets.all(8.0),
                      child: Icon(
                        Icons.arrow_back_ios_new_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ),
                ),
              ),

              // 3. Official KR Track Logo Emblem Floating in Header
              SafeArea(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 14.0),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 14,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Image.asset(
                            'assets/kr_track_emblem.png',
                            height: 24,
                            fit: BoxFit.contain,
                          ),
                          const SizedBox(width: 8),
                          Image.asset(
                            'assets/kr_track_wordmark.png',
                            height: 12,
                            fit: BoxFit.contain,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

              // 4. White Login Sheet Card Layer (Sits beneath the student's ledge)
              Positioned(
                top: headerHeight,
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 24,
                        offset: const Offset(0, -6),
                      ),
                    ],
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 28.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Space for the overlapping pointing hand
                      const SizedBox(height: 52),

                      // Welcome Back Title & Subtitle
                      const Text(
                        'Welcome Back',
                        style: TextStyle(
                          fontFamily: 'Poppins',
                          color: midnightNavy,
                          fontSize: 27,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Login to your KRGI account',
                        style: TextStyle(
                          fontFamily: 'Poppins',
                          color: mutedText,
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                          letterSpacing: 0.1,
                        ),
                      ),

                      const SizedBox(height: 24),

                      // Form Field 1: Register ID / Username
                      Container(
                        height: 54,
                        padding: const EdgeInsets.symmetric(horizontal: 18),
                        decoration: BoxDecoration(
                          color: inputBg,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: const Color(0xFFE2E8F0),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.person_rounded,
                              color: electricBlue,
                              size: 20,
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: TextField(
                                controller: _idController,
                                style: const TextStyle(
                                  fontFamily: 'Poppins',
                                  color: midnightNavy,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                                decoration: const InputDecoration(
                                  hintText: 'Register No. / Staff ID',
                                  hintStyle: TextStyle(
                                    fontFamily: 'Poppins',
                                    color: mutedText,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  border: InputBorder.none,
                                  isDense: true,
                                  contentPadding: EdgeInsets.zero,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 16),

                      // Form Field 2: Password
                      Container(
                        height: 54,
                        padding: const EdgeInsets.symmetric(horizontal: 18),
                        decoration: BoxDecoration(
                          color: inputBg,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: const Color(0xFFE2E8F0),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.lock_rounded,
                              color: electricBlue,
                              size: 20,
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: TextField(
                                controller: _passwordController,
                                obscureText: _obscurePassword,
                                style: const TextStyle(
                                  fontFamily: 'Poppins',
                                  color: midnightNavy,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 1.5,
                                ),
                                decoration: const InputDecoration(
                                  hintText: '••••••••',
                                  hintStyle: TextStyle(
                                    fontFamily: 'Poppins',
                                    color: mutedText,
                                    fontSize: 14,
                                    letterSpacing: 2.0,
                                  ),
                                  border: InputBorder.none,
                                  isDense: true,
                                  contentPadding: EdgeInsets.zero,
                                ),
                                onSubmitted: (_) => _onAuthenticate(),
                              ),
                            ),
                            GestureDetector(
                              onTap: () {
                                setState(() {
                                  _obscurePassword = !_obscurePassword;
                                });
                              },
                              child: Icon(
                                _obscurePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                                color: mutedText,
                                size: 20,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 14),

                      // Remember Me & Forgot Password Row
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          GestureDetector(
                            onTap: () {
                              setState(() {
                                _rememberMe = !_rememberMe;
                              });
                            },
                            child: Row(
                              children: [
                                Icon(
                                  _rememberMe
                                      ? Icons.check_circle_rounded
                                      : Icons.radio_button_unchecked_rounded,
                                  color: _rememberMe ? electricBlue : mutedText,
                                  size: 18,
                                ),
                                const SizedBox(width: 7),
                                const Text(
                                  'Remember Me',
                                  style: TextStyle(
                                    fontFamily: 'Poppins',
                                    color: mutedText,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  backgroundColor: midnightNavy,
                                  content: const Text(
                                    'Please contact your College DC Admin / Dean Office for password assistance.',
                                  ),
                                  behavior: SnackBarBehavior.floating,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              );
                            },
                            child: const Text(
                              'Forgot Password ?',
                              style: TextStyle(
                                fontFamily: 'Poppins',
                                color: electricBlue,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 28),

                      // Login Gradient Button (Cyan to Violet)
                      GestureDetector(
                        onTap: _isLoading ? null : _onAuthenticate,
                        child: Container(
                          width: double.infinity,
                          height: 54,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                electricCyan,
                                electricBlue,
                                royalViolet,
                              ],
                            ),
                            borderRadius: BorderRadius.circular(27),
                            boxShadow: [
                              BoxShadow(
                                color: electricBlue.withValues(alpha: 0.4),
                                blurRadius: 18,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: Center(
                            child: _isLoading
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2.4,
                                    ),
                                  )
                                : const Text(
                                    'Login',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.6,
                                    ),
                                  ),
                          ),
                        ),
                      ),

                      const Spacer(),

                      // Footer: If any queries visit Zynix
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: 24.0),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Text(
                                "If any queries visit ",
                                style: TextStyle(
                                  color: mutedText,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              GestureDetector(
                                onTap: _openZynix,
                                child: const MouseRegion(
                                  cursor: SystemMouseCursors.click,
                                  child: Text(
                                    'Zynix',
                                    style: TextStyle(
                                      color: electricBlue,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w800,
                                      decoration: TextDecoration.underline,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // 5. 3D BREAKOUT STUDENT CHARACTER: Leaning on the card border, hands overlapping!
              Positioned(
                top: headerHeight - 206,
                left: 0,
                right: 0,
                height: 260,
                child: IgnorePointer(
                  child: Center(
                    child: SizedBox(
                      width: size.width * 0.88,
                      child: Image.asset(
                        'assets/student_leaning.png',
                        fit: BoxFit.contain,
                        alignment: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
