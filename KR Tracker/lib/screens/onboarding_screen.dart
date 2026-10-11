import 'package:flutter/material.dart';
import 'auth_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  final List<Map<String, dynamic>> _stages = [
    {
      'step': '1/3',
      'title': 'Explore the Campus\nwith Us',
      'subtitle': 'Explore real-time student identity, digital profiles, and campus events, all handpicked for you.',
      'image': 'assets/onboarding_1.jpg',
      'buttonText': 'Next',
    },
    {
      'step': '2/3',
      'title': 'Simple & Smart\nCampus Planning',
      'subtitle': 'Instant barcode scan, discipline actions & multi-stage approvals — all in one seamless app experience.',
      'image': 'assets/onboarding_2.jpg',
      'buttonText': 'Next',
    },
    {
      'step': '3/3',
      'title': 'Confident & Safe\nJourneys',
      'subtitle': 'Get offline auto-sync, verified gate passes, and 24/7 campus support wherever you go.',
      'image': 'assets/onboarding_3.jpg',
      'buttonText': 'Get Started',
    },
  ];

  void _onNext() {
    if (_currentPage < _stages.length - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOutCubic,
      );
    } else {
      _navigateToAuth();
    }
  }

  void _onBack() {
    if (_currentPage > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOutCubic,
      );
    }
  }

  void _navigateToAuth() {
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => const AuthScreen(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: animation,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0.0, 0.08),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutCubic,
              )),
              child: child,
            ),
          );
        },
        transitionDuration: const Duration(milliseconds: 400),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── 1. PageView for full-bleed illustration slides ──
          PageView.builder(
            controller: _pageController,
            itemCount: _stages.length,
            onPageChanged: (index) {
              setState(() => _currentPage = index);
            },
            itemBuilder: (context, index) {
              final stage = _stages[index];
              return Stack(
                fit: StackFit.expand,
                children: [
                  // Full bleed illustration image
                  Image.asset(
                    stage['image'],
                    fit: BoxFit.cover,
                    alignment: Alignment.topCenter,
                    errorBuilder: (context, error, stackTrace) => Container(
                      color: const Color(0xFF1E293B),
                      child: const Center(
                        child: Icon(Icons.image_outlined, color: Colors.white38, size: 48),
                      ),
                    ),
                  ),

                  // Smooth dark vignette fading towards pure black at bottom
                  Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: const [0.0, 0.35, 0.58, 0.85, 1.0],
                        colors: [
                          Colors.black.withValues(alpha: 0.2),
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.55),
                          Colors.black.withValues(alpha: 0.95),
                          Colors.black,
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),

          // ── 2. Top Bar: Minimal Skip Button ──
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(top: 10, right: 20),
                child: _currentPage < _stages.length - 1
                    ? GestureDetector(
                        onTap: _navigateToAuth,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.35),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white24, width: 0.8),
                          ),
                          child: const Text(
                            'Skip',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
          ),

          // ── 3. Bottom Panel (Indicator, Title, Subtitle, Back & Next buttons) ──
          Positioned(
            left: 24,
            right: 24,
            bottom: 34,
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Step Indicator Pill (e.g. 1/3) matching reference screenshot
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    child: Container(
                      key: ValueKey<int>(_currentPage),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF262626).withValues(alpha: 0.85),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white24, width: 0.8),
                      ),
                      child: Text(
                        _stages[_currentPage]['step'],
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 14),

                  // Headline
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: Text(
                      _stages[_currentPage]['title'],
                      key: ValueKey<String>(_stages[_currentPage]['title']),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.6,
                        height: 1.15,
                      ),
                    ),
                  ),

                  const SizedBox(height: 10),

                  // Subtitle
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: Text(
                      _stages[_currentPage]['subtitle'],
                      key: ValueKey<String>(_stages[_currentPage]['subtitle']),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.72),
                        fontSize: 14,
                        fontWeight: FontWeight.w400,
                        height: 1.45,
                      ),
                    ),
                  ),

                  const SizedBox(height: 28),

                  // Bottom Action Row: [< Circular Back] and [Next / Get Started Pill]
                  Row(
                    children: [
                      // Circular Back Button
                      GestureDetector(
                        onTap: _currentPage > 0 ? _onBack : null,
                        child: AnimatedOpacity(
                          duration: const Duration(milliseconds: 200),
                          opacity: _currentPage > 0 ? 1.0 : 0.45,
                          child: Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: const Color(0xFF1E1E20),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.22),
                                width: 1.2,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.3),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.chevron_left_rounded,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(width: 14),

                      // Next / Get Started Pill Button (Vibrant Yellow #FFDE21)
                      Expanded(
                        child: GestureDetector(
                          onTap: _onNext,
                          child: Container(
                            height: 52,
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFDE21),
                              borderRadius: BorderRadius.circular(26),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFFFFDE21).withValues(alpha: 0.35),
                                  blurRadius: 16,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: Center(
                              child: Text(
                                _stages[_currentPage]['buttonText'],
                                style: const TextStyle(
                                  color: Colors.black,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -0.2,
                                ),
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
          ),
        ],
      ),
    );
  }
}
