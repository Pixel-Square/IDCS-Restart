import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';

void openBrowserUrl(String url) {}

Widget buildInlineScannerView({
  required Function(String) onBarcodeScanned,
  double height = 180,
}) {
  return _MobileDeviceScanner(
    onBarcodeScanned: onBarcodeScanned,
    height: height,
  );
}

class _MobileDeviceScanner extends StatefulWidget {
  final Function(String) onBarcodeScanned;
  final double height;

  const _MobileDeviceScanner({
    required this.onBarcodeScanned,
    required this.height,
  });

  @override
  State<_MobileDeviceScanner> createState() => _MobileDeviceScannerState();
}

class _MobileDeviceScannerState extends State<_MobileDeviceScanner>
    with SingleTickerProviderStateMixin {
  late MobileScannerController _controller;
  late AnimationController _laserAnim;
  bool _permissionDenied = false;
  String _errorMessage = '';
  DateTime? _lastScannedTime;
  String? _lastScannedCode;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
      returnImage: false,
    );

    _laserAnim = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _checkPermission();
  }

  Future<void> _checkPermission() async {
    final status = await Permission.camera.request();
    if (status.isPermanentlyDenied || status.isDenied) {
      if (mounted) {
        setState(() {
          _permissionDenied = true;
          _errorMessage = 'Camera permission was not granted.';
        });
      }
    } else {
      if (mounted) {
        setState(() {
          _permissionDenied = false;
        });
        _controller.start();
      }
    }
  }

  @override
  void dispose() {
    _laserAnim.dispose();
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    for (final barcode in capture.barcodes) {
      final code = barcode.rawValue ?? barcode.displayValue;
      if (code != null && code.trim().isNotEmpty) {
        final clean = code.trim();
        final now = DateTime.now();
        if (_lastScannedCode == clean &&
            _lastScannedTime != null &&
            now.difference(_lastScannedTime!).inSeconds < 2) {
          continue;
        }
        _lastScannedCode = clean;
        _lastScannedTime = now;
        widget.onBarcodeScanned(clean);
        break;
      }
    }
  }

  Widget _buildPermissionDeniedCard() {
    return Container(
      height: widget.height,
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F131D),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFF5E3A).withValues(alpha: 0.5)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFFFF5E3A).withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.videocam_off_rounded,
              color: Color(0xFFFF5E3A),
              size: 26,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Camera Permission Not Granted',
            style: TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 3),
          Text(
            _errorMessage.isNotEmpty
                ? _errorMessage
                : 'Allow camera access in device settings to scan student barcodes',
            style: const TextStyle(
              color: Colors.white60,
              fontSize: 10,
              fontWeight: FontWeight.w500,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              GestureDetector(
                onTap: () async {
                  await openAppSettings();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF00B8FF), Color(0xFF2875FF)],
                    ),
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF2875FF).withValues(alpha: 0.3),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.settings_rounded, color: Colors.white, size: 14),
                      SizedBox(width: 5),
                      Text(
                        'Open Settings',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _checkPermission,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                  ),
                  child: const Text(
                    'Retry',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_permissionDenied) {
      return _buildPermissionDeniedCard();
    }

    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          alignment: Alignment.center,
          children: [
            MobileScanner(
              controller: _controller,
              onDetect: _onDetect,
              errorBuilder: (context, error) {
                return _buildPermissionDeniedCard();
              },
            ),

            // Viewfinder Corner Accents
            Positioned(
              top: 10,
              left: 12,
              child: Container(
                width: 18,
                height: 18,
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                    left: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 10,
              right: 12,
              child: Container(
                width: 18,
                height: 18,
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                    right: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 10,
              left: 12,
              child: Container(
                width: 18,
                height: 18,
                decoration: const BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                    left: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 10,
              right: 12,
              child: Container(
                width: 18,
                height: 18,
                decoration: const BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                    right: BorderSide(color: Color(0xFF00B8FF), width: 2.5),
                  ),
                ),
              ),
            ),

            // Animated Laser Line
            AnimatedBuilder(
              animation: _laserAnim,
              builder: (context, child) {
                return Positioned(
                  top: 14 + (_laserAnim.value * (widget.height - 30)),
                  left: 14,
                  right: 14,
                  child: Container(
                    height: 2.0,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Colors.transparent,
                          Color(0xFF00B8FF),
                          Colors.white,
                          Color(0xFF00B8FF),
                          Colors.transparent,
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Color(0xFF00B8FF),
                          blurRadius: 8,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

Widget buildPlatformAvatarImage({
  required List<String> candidateUrls,
  required String name,
  required String regNo,
  required double size,
  BorderRadius? borderRadius,
}) {
  return _MobileAvatarImage(
    candidateUrls: candidateUrls,
    name: name,
    regNo: regNo,
    size: size,
    borderRadius: borderRadius,
  );
}

class _MobileAvatarImage extends StatefulWidget {
  final List<String> candidateUrls;
  final String name;
  final String regNo;
  final double size;
  final BorderRadius? borderRadius;

  const _MobileAvatarImage({
    required this.candidateUrls,
    required this.name,
    required this.regNo,
    required this.size,
    this.borderRadius,
  });

  @override
  State<_MobileAvatarImage> createState() => _MobileAvatarImageState();
}

class _MobileAvatarImageState extends State<_MobileAvatarImage> {
  int _candidateIndex = 0;

  String _getInitials() {
    final cleanName = widget.name.trim();
    if (cleanName.isNotEmpty) {
      return cleanName.split(' ').map((p) => p.isNotEmpty ? p[0] : '').take(2).join().toUpperCase();
    }
    return widget.regNo.length >= 2 ? widget.regNo.substring(widget.regNo.length - 2).toUpperCase() : 'KR';
  }

  Widget _buildInitials() {
    final initials = _getInitials();
    return Container(
      width: widget.size,
      height: widget.size,
      decoration: BoxDecoration(
        borderRadius: widget.borderRadius ?? BorderRadius.circular(widget.size / 2),
        gradient: const LinearGradient(
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
          style: TextStyle(
            color: Colors.white,
            fontSize: (widget.size * 0.28).clamp(14.0, 40.0),
            fontWeight: FontWeight.w900,
            letterSpacing: -1,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.candidateUrls.isEmpty || _candidateIndex >= widget.candidateUrls.length) {
      return _buildInitials();
    }

    final rawUrl = widget.candidateUrls[_candidateIndex];
    final url = rawUrl.startsWith('/') ? 'https://db.krgi.co.in$rawUrl' : rawUrl;

    return ClipRRect(
      borderRadius: widget.borderRadius ?? BorderRadius.circular(widget.size / 2),
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: Image.network(
          url,
          fit: BoxFit.cover,
          loadingBuilder: (context, child, progress) {
            if (progress == null) return child;
            return Container(
              color: const Color(0xFF1F2637),
              child: const Center(
                child: CircularProgressIndicator(
                  color: Color(0xFF06B6D4),
                  strokeWidth: 2.0,
                ),
              ),
            );
          },
          errorBuilder: (context, error, stackTrace) {
            if (_candidateIndex + 1 < widget.candidateUrls.length) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) {
                  setState(() => _candidateIndex++);
                }
              });
              return Container(color: const Color(0xFF1F2637));
            }
            return _buildInitials();
          },
        ),
      ),
    );
  }
}
