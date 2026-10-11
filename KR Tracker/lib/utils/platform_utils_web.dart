// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;
import 'dart:js' as js;
import 'dart:ui_web' as ui_web;
import 'package:flutter/material.dart';

void openBrowserUrl(String url) {
  html.window.open(url, '_blank');
}

Widget buildInlineScannerView({
  required Function(String) onBarcodeScanned,
  double height = 180,
}) {
  return _WebScannerWidget(
    onBarcodeScanned: onBarcodeScanned,
    height: height,
  );
}

class _WebScannerWidget extends StatefulWidget {
  final Function(String) onBarcodeScanned;
  final double height;

  const _WebScannerWidget({
    required this.onBarcodeScanned,
    required this.height,
  });

  @override
  State<_WebScannerWidget> createState() => _WebScannerWidgetState();
}

class _WebScannerWidgetState extends State<_WebScannerWidget> {
  static int _uniqueCounter = 0;
  late final String _viewType;

  @override
  void initState() {
    super.initState();
    _uniqueCounter++;
    _viewType = 'inline-barcode-camera-view-$_uniqueCounter';

    js.context['onFlutterBarcodeScanned'] = (dynamic code) {
      if (code != null && mounted) {
        final str = code.toString().trim();
        if (str.isNotEmpty) {
          widget.onBarcodeScanned(str);
        }
      }
    };

    ui_web.platformViewRegistry.registerViewFactory(
      _viewType,
      (int viewId) {
        final div = html.DivElement()
          ..id = 'camera-scanner-container-$viewId'
          ..style.width = '100%'
          ..style.height = '100%'
          ..style.backgroundColor = '#0A0E17'
          ..style.borderRadius = '16px'
          ..style.overflow = 'hidden'
          ..style.position = 'relative';

        Future.microtask(() {
          try {
            if (js.context.hasProperty('startInlineScanner')) {
              js.context.callMethod('startInlineScanner', [
                div,
                (dynamic code) {
                  if (code != null && mounted) {
                    widget.onBarcodeScanned(code.toString());
                  }
                }
              ]);
            }
          } catch (e) {
            debugPrint('Error starting inline camera scanner: $e');
          }
        });

        return div;
      },
    );
  }

  @override
  void dispose() {
    try {
      if (js.context.hasProperty('stopInlineScanner')) {
        js.context.callMethod('stopInlineScanner');
      }
    } catch (e) {
      debugPrint('Error stopping inline camera scanner: $e');
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: HtmlElementView(viewType: _viewType),
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
  return _WebAvatarImage(
    candidateUrls: candidateUrls,
    name: name,
    regNo: regNo,
    size: size,
    borderRadius: borderRadius,
  );
}

class _WebAvatarImage extends StatefulWidget {
  final List<String> candidateUrls;
  final String name;
  final String regNo;
  final double size;
  final BorderRadius? borderRadius;

  const _WebAvatarImage({
    required this.candidateUrls,
    required this.name,
    required this.regNo,
    required this.size,
    this.borderRadius,
  });

  @override
  State<_WebAvatarImage> createState() => _WebAvatarImageState();
}

class _WebAvatarImageState extends State<_WebAvatarImage> {
  static int _uniqueAvatarCounter = 0;
  late final String _viewType;

  @override
  void initState() {
    super.initState();
    _uniqueAvatarCounter++;
    _viewType = 'platform-avatar-view-$_uniqueAvatarCounter';

    ui_web.platformViewRegistry.registerViewFactory(
      _viewType,
      (int viewId) {
        final container = html.DivElement()
          ..id = 'avatar-container-$viewId'
          ..style.width = '100%'
          ..style.height = '100%'
          ..style.overflow = 'hidden'
          ..style.display = 'flex'
          ..style.alignItems = 'center'
          ..style.justifyContent = 'center'
          ..style.borderRadius = widget.borderRadius != null ? '16px' : '50%';

        void loadCandidate(int index) {
          container.children.clear();
          if (index >= widget.candidateUrls.length) {
            final initials = _getInitials(widget.name, widget.regNo);
            final fallbackDiv = html.DivElement()
              ..style.width = '100%'
              ..style.height = '100%'
              ..style.background = 'linear-gradient(135deg, #2563EB, #7C3AED, #DB2777)'
              ..style.display = 'flex'
              ..style.alignItems = 'center'
              ..style.justifyContent = 'center'
              ..style.color = '#FFFFFF'
              ..style.fontWeight = '900'
              ..style.fontSize = '${(widget.size * 0.28).clamp(14, 40)}px'
              ..innerText = initials;
            container.children.add(fallbackDiv);
            return;
          }

          final url = widget.candidateUrls[index];
          final img = html.ImageElement()
            ..src = url
            ..style.width = '100%'
            ..style.height = '100%'
            ..style.objectFit = 'cover';

          img.onError.listen((_) {
            loadCandidate(index + 1);
          });

          container.children.add(img);
        }

        loadCandidate(0);
        return container;
      },
    );
  }

  static String _getInitials(String name, String regNo) {
    final cleanName = name.trim();
    if (cleanName.isNotEmpty) {
      return cleanName.split(' ').map((p) => p.isNotEmpty ? p[0] : '').take(2).join().toUpperCase();
    }
    return regNo.length >= 2 ? regNo.substring(regNo.length - 2).toUpperCase() : 'KR';
  }

  @override
  Widget build(BuildContext context) {
    if (widget.candidateUrls.isEmpty) {
      return _buildInitialsFallback();
    }
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: ClipRRect(
        borderRadius: widget.borderRadius ?? BorderRadius.circular(widget.size / 2),
        child: HtmlElementView(viewType: _viewType),
      ),
    );
  }

  Widget _buildInitialsFallback() {
    final initials = _getInitials(widget.name, widget.regNo);
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
}
