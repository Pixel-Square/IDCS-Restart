import 'package:flutter/material.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';

class CameraScannerModal extends StatefulWidget {
  final int initialModeIndex;
  final Function(String barcode)? onBarcodeScanned;

  const CameraScannerModal({
    super.key,
    this.initialModeIndex = 0,
    this.onBarcodeScanned,
  });

  @override
  State<CameraScannerModal> createState() => _CameraScannerModalState();
}

class _CameraScannerModalState extends State<CameraScannerModal>
    with SingleTickerProviderStateMixin {
  late AnimationController _scanLineController;
  late int _activeModeIndex;
  bool _flashOn = false;
  bool _isCaptured = false;

  final List<String> _scanModes = [
    'GatePass QR',
    'Student ID Scan',
    'Discipline Snap',
  ];

  @override
  void initState() {
    super.initState();
    _activeModeIndex = widget.initialModeIndex;
    _scanLineController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _scanLineController.dispose();
    super.dispose();
  }

  void _triggerCapture() {
    setState(() {
      _isCaptured = true;
    });

    Future.delayed(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      _showScanSuccessDialog();
    });
  }

  void _showScanSuccessDialog() {
    final state = AppState.instance;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: state.isDarkMode
                ? const Color(0xFF131A2A)
                : const Color(0xFFFFFFFF),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            border: Border.all(
              color: AppColors.accentCyan.withValues(alpha: 0.5),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.5),
                blurRadius: 30,
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 5,
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981).withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: const Color(0xFF10B981),
                    width: 2,
                  ),
                ),
                child: const Icon(
                  Icons.check_circle_rounded,
                  color: Color(0xFF10B981),
                  size: 44,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'VERIFICATION SUCCESSFUL',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.0,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _activeModeIndex == 0
                    ? 'GatePass #2024-X12 validated. Exit Approved.'
                    : _activeModeIndex == 1
                        ? 'Student ID verified • Active Decorum: 98.5%'
                        : 'Discipline record logged to Dean Office.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: state.isDarkMode ? Colors.white70 : Colors.black54,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: () {
                  final detectedCode = _activeModeIndex == 1
                      ? '2403811714821042'
                      : 'GP-2024-X12';
                  widget.onBarcodeScanned?.call(detectedCode);
                  Navigator.of(context).pop();
                  Navigator.of(context).pop(detectedCode);
                },
                child: Container(
                  width: double.infinity,
                  height: 52,
                  decoration: BoxDecoration(
                    gradient: AppColors.primaryGradient,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: AppStyles.button3DShadow(
                      color: AppColors.primary,
                    ),
                  ),
                  child: const Center(
                    child: Text(
                      'DONE',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        );
      },
    ).then((_) {
      if (mounted) {
        setState(() {
          _isCaptured = false;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Simulated Camera Preview Feed
          Positioned.fill(
            child: Opacity(
              opacity: 0.35,
              child: Image.asset(
                _activeModeIndex == 1
                    ? 'assets/genz_pass.jpg'
                    : 'assets/genz_pass.jpg',
                fit: BoxFit.cover,
              ),
            ),
          ),

          // Camera Darkness Gradient
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.75),
                  ],
                  radius: 0.85,
                ),
              ),
            ),
          ),

          // Top Camera Controls
          SafeArea(
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.2),
                        ),
                      ),
                      child: const Icon(
                        Icons.close_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black87,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: AppColors.accentCyan.withValues(alpha: 0.5),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Colors.redAccent,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'KR AI LENS ACTIVE',
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
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _flashOn = !_flashOn;
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: _flashOn
                            ? const Color(0xFFFBBF24)
                            : Colors.black54,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Icon(
                        _flashOn
                            ? Icons.flash_on_rounded
                            : Icons.flash_off_rounded,
                        color: _flashOn ? Colors.black : Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Center Viewfinder Target Reticle with Scanning Laser
          Center(
            child: SizedBox(
              width: 280,
              height: 280,
              child: Stack(
                children: [
                  // Corner Reticles
                  Align(
                    alignment: Alignment.topLeft,
                    child: _buildCornerBracket(isTop: true, isLeft: true),
                  ),
                  Align(
                    alignment: Alignment.topRight,
                    child: _buildCornerBracket(isTop: true, isLeft: false),
                  ),
                  Align(
                    alignment: Alignment.bottomLeft,
                    child: _buildCornerBracket(isTop: false, isLeft: true),
                  ),
                  Align(
                    alignment: Alignment.bottomRight,
                    child: _buildCornerBracket(isTop: false, isLeft: false),
                  ),

                  // Animated Scanning Laser Line
                  AnimatedBuilder(
                    animation: _scanLineController,
                    builder: (context, child) {
                      return Positioned(
                        top: _scanLineController.value * 260,
                        left: 10,
                        right: 10,
                        child: Container(
                          height: 3,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                Colors.transparent,
                                AppColors.accentCyan,
                                Colors.white,
                                AppColors.accentCyan,
                                Colors.transparent,
                              ],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.accentCyan,
                                blurRadius: 10,
                                spreadRadius: 2,
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),

                  // Center Guidance Prompt
                  Align(
                    alignment: Alignment.center,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.15),
                        ),
                      ),
                      child: Text(
                        'Align ${_scanModes[_activeModeIndex]} within frame',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom Controls: Mode Tabs + Skeuomorphic Shutter Button
          Positioned(
            left: 0,
            right: 0,
            bottom: 30,
            child: Column(
              children: [
                // Scan Mode Selector Tabs
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(_scanModes.length, (index) {
                      final isSelected = _activeModeIndex == index;
                      return GestureDetector(
                        onTap: () {
                          setState(() {
                            _activeModeIndex = index;
                          });
                        },
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 6),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? AppColors.primary
                                : Colors.black45,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isSelected
                                  ? Colors.white.withValues(alpha: 0.4)
                                  : Colors.white24,
                            ),
                          ),
                          child: Text(
                            _scanModes[index],
                            style: TextStyle(
                              color: isSelected ? Colors.white : Colors.white60,
                              fontSize: 12,
                              fontWeight: isSelected
                                  ? FontWeight.w800
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                ),

                const SizedBox(height: 28),

                // Center Skeuomorphic 3D Shutter Button
                GestureDetector(
                  onTap: _triggerCapture,
                  child: Container(
                    width: 78,
                    height: 78,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white,
                        width: 4,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.6),
                          blurRadius: 20,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.all(6),
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: _isCaptured
                            ? const LinearGradient(
                                colors: [Color(0xFF10B981), Color(0xFF059669)],
                              )
                            : const LinearGradient(
                                colors: [Color(0xFF6366F1), Color(0xFFEC4899)],
                              ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.4),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.camera_alt_rounded,
                        color: Colors.white,
                        size: 30,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCornerBracket({required bool isTop, required bool isLeft}) {
    const double length = 28;
    const double thickness = 3.5;
    const Color color = AppColors.accentCyan;

    return Container(
      width: length,
      height: length,
      decoration: BoxDecoration(
        border: Border(
          top: isTop
              ? const BorderSide(color: color, width: thickness)
              : BorderSide.none,
          bottom: !isTop
              ? const BorderSide(color: color, width: thickness)
              : BorderSide.none,
          left: isLeft
              ? const BorderSide(color: color, width: thickness)
              : BorderSide.none,
          right: !isLeft
              ? const BorderSide(color: color, width: thickness)
              : BorderSide.none,
        ),
      ),
    );
  }
}
