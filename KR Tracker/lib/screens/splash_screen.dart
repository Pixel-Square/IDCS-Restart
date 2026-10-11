import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'onboarding_screen.dart';
import '../navigation/main_navigation_shell.dart';
import '../state/app_state.dart';

/// KR TRACK — PREMIUM MOTION IDENTITY SPLASH SCREEN
/// White Edition: Distinctive, cinematic, code-driven motion identity.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  // Scene A: Intro Line & Initial Glow (0–320 ms)
  late final Animation<double> _introLineProgress;
  late final Animation<double> _introLineOpacity;

  // Scene B: Signature Fluid Ribbons Motion (300–850 ms)
  late final Animation<double> _ribbonFlow;
  late final Animation<double> _ribbonExit;

  // Scene C: Emblem & Wordmark Reveal (700–1250 ms)
  late final Animation<double> _emblemOpacity;
  late final Animation<double> _emblemScale;
  late final Animation<double> _lightSweep;
  late final Animation<double> _wordmarkOpacity;
  late final Animation<double> _wordmarkOffset;

  // Scene D: Brand Statement Reveal (1100–1550 ms)
  late final Animation<double> _statementOpacity;
  late final Animation<double> _statementOffset;
  late final Animation<double> _pillScale;

  // Scene E: Campus Journey Signature Road & Transition (1550–2200 ms)
  late final Animation<double> _journeyPathProgress;
  late final Animation<double> _exitFade;

  bool _navigated = false;

  @override
  void initState() {
    super.initState();

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 5000),
    );

    // Scene A: Intro Line & Initial Glow (0 – 600 ms / 0.00 – 0.12)
    _introLineProgress = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.00, 0.12, curve: Curves.easeInOutCubic),
      ),
    );
    _introLineOpacity = Tween<double>(begin: 1.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.12, 0.18, curve: Curves.easeOut),
      ),
    );

    // Scene B: Slower, cinematic fluid ribbons sweeping across (500 – 1600 ms / 0.10 – 0.32)
    _ribbonFlow = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.10, 0.32, curve: Curves.easeInOutCubic),
      ),
    );
    _ribbonExit = Tween<double>(begin: 1.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.28, 0.44, curve: Curves.easeOut),
      ),
    );

    // Scene C: Emblem & Wordmark reveal (1200 – 2500 ms / 0.24 – 0.50)
    _emblemOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.24, 0.40, curve: Curves.easeOut),
      ),
    );
    _emblemScale = Tween<double>(begin: 0.90, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.24, 0.42, curve: Curves.easeOutCubic),
      ),
    );
    _lightSweep = Tween<double>(begin: -1.2, end: 1.4).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.32, 0.48, curve: Curves.easeInOutCubic),
      ),
    );
    _wordmarkOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.36, 0.48, curve: Curves.easeOut),
      ),
    );
    _wordmarkOffset = Tween<double>(begin: 14.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.36, 0.50, curve: Curves.easeOutCubic),
      ),
    );

    // Scene D: Brand Statement Reveal (2300 – 2900 ms / 0.46 – 0.58)
    _statementOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.46, 0.56, curve: Curves.easeOut),
      ),
    );
    _statementOffset = Tween<double>(begin: 8.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.46, 0.58, curve: Curves.easeOutCubic),
      ),
    );
    _pillScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.50, 0.58, curve: Curves.easeOutBack),
      ),
    );

    // Scene E: Campus Journey Signature Road (2600 – 3000 ms / 0.52 – 0.60)
    _journeyPathProgress = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.52, 0.60, curve: Curves.easeInOutCubic),
      ),
    );

    // Final Logo Screen stays solid for 2 full seconds (3.0s to 4.8s / 0.60 to 0.96)
    // Smooth exit crossfade at the end (4800 – 5000 ms / 0.96 – 1.00)
    _exitFade = Tween<double>(begin: 1.0, end: 0.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.96, 1.00, curve: Curves.easeInOut),
      ),
    );

    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _navigateToDestination();
      }
    });

    _controller.forward();
  }

  void _navigateToDestination() {
    if (_navigated || !mounted) return;
    _navigated = true;

    final Widget destination = AppState.instance.isAuthenticated
        ? const MainNavigationShell()
        : const OnboardingScreen();

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => destination,
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: CurvedAnimation(
              parent: animation,
              curve: Curves.easeInOut,
            ),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 400),
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    if (reduceMotion && !_controller.isCompleted) {
      _controller.value = 1.0;
    }

    // Dynamic responsive dimensions
    final double maxLogoWidth = math.min(size.width * 0.64, 260.0);
    final double emblemWidth = maxLogoWidth;
    final double wordmarkWidth = maxLogoWidth * 0.84;

    return Scaffold(
      backgroundColor: Colors.white,
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _navigateToDestination,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
          return Opacity(
            opacity: _exitFade.value,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // 1. Subtle, pure-white ambient gradient base
                Container(
                  decoration: const BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment(0.0, -0.15),
                      radius: 1.1,
                      colors: [
                        Color(0xFFFCFEFF),
                        Color(0xFFFFFFFF),
                      ],
                      stops: [0.0, 1.0],
                    ),
                  ),
                ),

                // 2. Corner Ambient Atmosphere (soft, ethereal cyan/violet glow)
                Positioned(
                  bottom: -60,
                  right: -60,
                  width: size.width * 0.75,
                  height: size.height * 0.40,
                  child: Opacity(
                    opacity: 0.12 + 0.18 * _journeyPathProgress.value,
                    child: Container(
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            Color(0xFF2875FF),
                            Color(0xFF713BFF),
                            Colors.transparent,
                          ],
                          stops: [0.0, 0.45, 1.0],
                        ),
                      ),
                    ),
                  ),
                ),

                // 3. Scene A: Animated Intro Drawing Line with Glowing Tip
                if (_introLineOpacity.value > 0.0)
                  Opacity(
                    opacity: _introLineOpacity.value,
                    child: CustomPaint(
                      size: size,
                      painter: _IntroLinePainter(
                        progress: _introLineProgress.value,
                      ),
                    ),
                  ),

                // 4. Scene B: Sweeping Fluid Ribbons across composition
                if (_ribbonExit.value > 0.01)
                  Opacity(
                    opacity: _ribbonExit.value,
                    child: CustomPaint(
                      size: size,
                      painter: _FluidRibbonsPainter(
                        flow: _ribbonFlow.value,
                      ),
                    ),
                  ),

                // 5. Ambient Top-Right and Bottom-Left Corner Accent Swooshes
                CustomPaint(
                  size: size,
                  painter: _CornerAtmospherePainter(
                    progress: _emblemOpacity.value,
                  ),
                ),

                // 6. Central Brand Reveal: KR Emblem + "Track" Wordmark + Typography
                Center(
                  child: Transform.translate(
                    // Optical vertical centering slightly above true midpoint
                    offset: const Offset(0, -22),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // KR Emblem with scale, fade and light sweep
                        Opacity(
                          opacity: _emblemOpacity.value,
                          child: Transform.scale(
                            scale: _emblemScale.value,
                            child: SizedBox(
                              width: emblemWidth,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  // Base Emblem Asset (crisp, transparent)
                                  Image.asset(
                                    'assets/kr_track_emblem.png',
                                    width: emblemWidth,
                                    fit: BoxFit.contain,
                                    filterQuality: FilterQuality.high,
                                  ),

                                  // Cyan-to-violet Light Sweep Shimmer
                                  if (_lightSweep.value > -1.0 &&
                                      _lightSweep.value < 1.3)
                                    Positioned.fill(
                                      child: ShaderMask(
                                        blendMode: BlendMode.srcATop,
                                        shaderCallback: (bounds) {
                                          final sweepX =
                                              bounds.width * _lightSweep.value;
                                          return LinearGradient(
                                            begin: Alignment.topLeft,
                                            end: Alignment.bottomRight,
                                            colors: [
                                              Colors.white.withValues(alpha: 0.0),
                                              const Color(0xFF00B8FF)
                                                  .withValues(alpha: 0.45),
                                              const Color(0xFF2875FF)
                                                  .withValues(alpha: 0.70),
                                              const Color(0xFF713BFF)
                                                  .withValues(alpha: 0.45),
                                              Colors.white.withValues(alpha: 0.0),
                                            ],
                                            stops: const [
                                              0.0,
                                              0.35,
                                              0.50,
                                              0.65,
                                              1.0
                                            ],
                                            transform: const GradientRotation(
                                              math.pi / 4,
                                            ),
                                          ).createShader(
                                            Rect.fromLTWH(
                                              sweepX - 80,
                                              0,
                                              160,
                                              bounds.height,
                                            ),
                                          );
                                        },
                                        child: Image.asset(
                                          'assets/kr_track_emblem.png',
                                          width: emblemWidth,
                                          fit: BoxFit.contain,
                                          color: Colors.white
                                              .withValues(alpha: 0.75),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 12),

                        // "Track" Wordmark with upward glide & opacity
                        Opacity(
                          opacity: _wordmarkOpacity.value,
                          child: Transform.translate(
                            offset: Offset(0, _wordmarkOffset.value),
                            child: SizedBox(
                              width: wordmarkWidth,
                              child: Image.asset(
                                'assets/kr_track_wordmark.png',
                                width: wordmarkWidth,
                                fit: BoxFit.contain,
                                filterQuality: FilterQuality.high,
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 20),

                        // Scene D: Brand Statement Reveal
                        Opacity(
                          opacity: _statementOpacity.value,
                          child: Transform.translate(
                            offset: Offset(0, _statementOffset.value),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                // “YOUR CAMPUS. YOUR JOURNEY.”
                                const Text(
                                  'YOUR CAMPUS. YOUR JOURNEY.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Color(0xFF081A3A),
                                    fontSize: 12.0,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 2.2,
                                    height: 1.2,
                                  ),
                                ),

                                const SizedBox(height: 10),

                                // Subtle accent gradient bar / pill
                                Transform.scale(
                                  scaleX: _pillScale.value,
                                  child: Container(
                                    width: 32,
                                    height: 3.0,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(3),
                                      gradient: const LinearGradient(
                                        colors: [
                                          Color(0xFF00B8FF), // Electric cyan
                                          Color(0xFF2875FF), // Vivid blue
                                          Color(0xFF713BFF), // Royal violet
                                        ],
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF2875FF)
                                              .withValues(alpha: 0.35),
                                          blurRadius: 6,
                                          offset: const Offset(0, 1),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),

                                const SizedBox(height: 10),

                                // Institutional signature: “KR INSTITUTIONS”
                                const Text(
                                  'KR INSTITUTIONS',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 10.0,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 2.8,
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

                // 7. Scene E & F: Signature Campus Journey Road / Ribbon Path
                if (_journeyPathProgress.value > 0.05)
                  Positioned(
                    bottom: 0,
                    right: 0,
                    width: size.width,
                    height: size.height * 0.34,
                    child: CustomPaint(
                      painter: _CampusJourneyRoadPainter(
                        progress: _journeyPathProgress.value,
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    ),
  );
}
}

/// Custom painter for Scene A: Intro glowing curved line drawing across canvas
class _IntroLinePainter extends CustomPainter {
  final double progress;

  _IntroLinePainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0.0) return;

    final path = Path();
    // Elegant sweeping curve from top left towards middle-right
    final start = Offset(-10, size.height * 0.08);
    final control1 = Offset(size.width * 0.15, size.height * 0.12);
    final control2 = Offset(size.width * 0.35, size.height * 0.18);
    final end = Offset(size.width * 0.65, size.height * 0.22);

    path.moveTo(start.dx, start.dy);
    path.cubicTo(
      control1.dx,
      control1.dy,
      control2.dx,
      control2.dy,
      end.dx,
      end.dy,
    );

    // Extract subpath up to progress
    final pathMetrics = path.computeMetrics().toList();
    if (pathMetrics.isEmpty) return;

    final metric = pathMetrics.first;
    final totalLength = metric.length;
    final currentLength = totalLength * progress.clamp(0.0, 1.0);
    final extractPath = metric.extractPath(0.0, currentLength);

    final linePaint = Paint()
      ..shader = const LinearGradient(
        colors: [
          Color(0xFF00B8FF),
          Color(0xFF2875FF),
          Color(0xFF713BFF),
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height * 0.3))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(extractPath, linePaint);

    // Draw glowing leading dot at the tip
    final tangent = metric.getTangentForOffset(currentLength);
    if (tangent != null) {
      final headPos = tangent.position;

      // Outer soft glow
      final glowPaint = Paint()
        ..color = const Color(0xFF713BFF).withValues(alpha: 0.45)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
      canvas.drawCircle(headPos, 6.0, glowPaint);

      // Core luminous dot
      final coreDotPaint = Paint()..color = const Color(0xFF00B8FF);
      canvas.drawCircle(headPos, 3.0, coreDotPaint);

      final whiteCenterPaint = Paint()..color = Colors.white;
      canvas.drawCircle(headPos, 1.5, whiteCenterPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _IntroLinePainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}

/// Custom painter for Scene B: Multi-layer fluid 3D ribbons weaving across canvas
class _FluidRibbonsPainter extends CustomPainter {
  final double flow;

  _FluidRibbonsPainter({required this.flow});

  @override
  void paint(Canvas canvas, Size size) {
    if (flow <= 0.0) return;

    final w = size.width;
    final h = size.height;

    // Ribbon 1: Electric Cyan to Vivid Blue (Sweeping upper wave)
    final path1 = Path();
    final yOffset1 = (1.0 - flow) * 60;
    path1.moveTo(-20, h * 0.28 + yOffset1);
    path1.cubicTo(
      w * 0.25,
      h * 0.24 + yOffset1,
      w * 0.60,
      h * 0.36 + yOffset1,
      w + 20,
      h * 0.26 + yOffset1,
    );
    path1.lineTo(w + 20, h * 0.35 + yOffset1);
    path1.cubicTo(
      w * 0.55,
      h * 0.44 + yOffset1,
      w * 0.20,
      h * 0.32 + yOffset1,
      -20,
      h * 0.36 + yOffset1,
    );
    path1.close();

    final paint1 = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFF00B8FF),
          Color(0xFF2875FF),
          Color(0xFF713BFF),
        ],
      ).createShader(Rect.fromLTWH(0, h * 0.20, w, h * 0.30))
      ..style = PaintingStyle.fill;

    // Shadow for depth
    canvas.drawShadow(path1, const Color(0xFF2875FF), 8.0, false);
    canvas.drawPath(path1, paint1);

    // Ribbon 2: Violet accent intertwining ribbon (weaving diagonally down)
    final path2 = Path();
    final yOffset2 = (1.0 - flow) * -40;
    path2.moveTo(-20, h * 0.36 + yOffset2);
    path2.cubicTo(
      w * 0.30,
      h * 0.40 + yOffset2,
      w * 0.65,
      h * 0.22 + yOffset2,
      w + 20,
      h * 0.32 + yOffset2,
    );
    path2.lineTo(w + 20, h * 0.36 + yOffset2);
    path2.cubicTo(
      w * 0.60,
      h * 0.27 + yOffset2,
      w * 0.25,
      h * 0.45 + yOffset2,
      -20,
      h * 0.41 + yOffset2,
    );
    path2.close();

    final paint2 = Paint()
      ..shader = LinearGradient(
        begin: Alignment.bottomLeft,
        end: Alignment.topRight,
        colors: [
          const Color(0xFF713BFF).withValues(alpha: 0.85),
          const Color(0xFF2875FF).withValues(alpha: 0.80),
          const Color(0xFF00B8FF).withValues(alpha: 0.50),
        ],
      ).createShader(Rect.fromLTWH(0, h * 0.20, w, h * 0.30))
      ..style = PaintingStyle.fill;

    canvas.drawPath(path2, paint2);

    // Ribbon 3: Fine light stream trace line
    final streamPath = Path();
    streamPath.moveTo(-10, h * 0.33);
    streamPath.cubicTo(
      w * 0.40,
      h * 0.31,
      w * 0.70,
      h * 0.39,
      w + 10,
      h * 0.30,
    );
    final streamPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.70)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8;
    canvas.drawPath(streamPath, streamPaint);
  }

  @override
  bool shouldRepaint(covariant _FluidRibbonsPainter oldDelegate) {
    return oldDelegate.flow != flow;
  }
}

/// Custom painter for corner ambient atmosphere ribbon accents
class _CornerAtmospherePainter extends CustomPainter {
  final double progress;

  _CornerAtmospherePainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0.0) return;

    final w = size.width;
    final h = size.height;

    // Top-right subtle ribbon arch
    final topPath = Path();
    topPath.moveTo(w * 0.45, -10);
    topPath.cubicTo(
      w * 0.70,
      h * 0.05,
      w * 0.85,
      h * 0.03,
      w + 10,
      h * 0.12,
    );
    topPath.lineTo(w + 10, -10);
    topPath.close();

    final topPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.bottomLeft,
        end: Alignment.topRight,
        colors: [
          const Color(0xFF2875FF).withValues(alpha: 0.25 * progress),
          const Color(0xFF713BFF).withValues(alpha: 0.15 * progress),
          Colors.transparent,
        ],
      ).createShader(Rect.fromLTWH(w * 0.45, 0, w * 0.55, h * 0.15))
      ..style = PaintingStyle.fill;

    canvas.drawPath(topPath, topPaint);

    // Bottom-left subtle ribbon arch
    final bottomPath = Path();
    bottomPath.moveTo(-10, h * 0.82);
    bottomPath.cubicTo(
      w * 0.20,
      h * 0.86,
      w * 0.40,
      h * 0.94,
      w * 0.55,
      h + 10,
    );
    bottomPath.lineTo(-10, h + 10);
    bottomPath.close();

    final bottomPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
        colors: [
          const Color(0xFF00B8FF).withValues(alpha: 0.30 * progress),
          const Color(0xFF2875FF).withValues(alpha: 0.18 * progress),
          Colors.transparent,
        ],
      ).createShader(Rect.fromLTWH(0, h * 0.80, w * 0.60, h * 0.20))
      ..style = PaintingStyle.fill;

    canvas.drawPath(bottomPath, bottomPaint);
  }

  @override
  bool shouldRepaint(covariant _CornerAtmospherePainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}

/// Custom painter for Scene E & F: Signature Campus Journey Track / Road
/// A flowing 3D perspective path sweeping to the bottom right with forward chevron
class _CampusJourneyRoadPainter extends CustomPainter {
  final double progress;

  _CampusJourneyRoadPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0.0) return;

    final w = size.width;
    final h = size.height;

    // Animated scale & position along path
    final roadPath = Path();
    final startY = h * (0.85 - 0.25 * progress);

    roadPath.moveTo(-20, h + 10);
    roadPath.cubicTo(
      w * 0.20,
      h * 0.88,
      w * 0.45,
      startY,
      w * 0.80,
      h * 0.50,
    );
    roadPath.cubicTo(
      w * 0.92,
      h * 0.40,
      w * 0.96,
      h * 0.34,
      w + 10,
      h * 0.32,
    );
    roadPath.lineTo(w + 10, h * 0.45);
    roadPath.cubicTo(
      w * 0.90,
      h * 0.52,
      w * 0.82,
      h * 0.64,
      w * 0.60,
      h * 0.88,
    );
    roadPath.lineTo(w * 0.40, h + 10);
    roadPath.close();

    final roadPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.bottomLeft,
        end: Alignment.topRight,
        colors: [
          Color(0xFF00B8FF), // Cyan
          Color(0xFF2875FF), // Vivid blue
          Color(0xFF713BFF), // Violet
        ],
        stops: [0.0, 0.45, 1.0],
      ).createShader(Rect.fromLTWH(0, 0, w, h))
      ..style = PaintingStyle.fill;

    // Depth Shadow
    canvas.drawShadow(roadPath, const Color(0xFF2875FF), 10.0, false);
    canvas.drawPath(roadPath, roadPaint);

    // Center dashed lane / light strip
    final lanePath = Path();
    lanePath.moveTo(0, h * 0.95);
    lanePath.cubicTo(
      w * 0.35,
      h * 0.82,
      w * 0.65,
      h * 0.66,
      w * 0.90,
      h * 0.42,
    );

    final lanePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.80 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(lanePath, lanePaint);

    // Forward motion arrow / chevron at top right of the road
    if (progress > 0.6) {
      final arrowAlpha = ((progress - 0.6) / 0.4).clamp(0.0, 1.0);
      final arrowPaint = Paint()
        ..color = const Color(0xFF00B8FF).withValues(alpha: arrowAlpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.0
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;

      final arrowPath = Path();
      const ax = 0.94;
      const ay = 0.32;
      arrowPath.moveTo(w * ax - 6, h * ay - 6);
      arrowPath.lineTo(w * ax, h * ay);
      arrowPath.lineTo(w * ax - 6, h * ay + 6);

      arrowPath.moveTo(w * ax, h * ay - 6);
      arrowPath.lineTo(w * ax + 6, h * ay);
      arrowPath.lineTo(w * ax, h * ay + 6);

      canvas.drawPath(arrowPath, arrowPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _CampusJourneyRoadPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}
