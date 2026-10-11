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
