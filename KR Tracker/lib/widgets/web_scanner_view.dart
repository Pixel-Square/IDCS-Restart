import 'package:flutter/material.dart';
import '../utils/platform_utils.dart';

class WebScannerView extends StatelessWidget {
  final Function(String barcode) onBarcodeScanned;
  final double height;

  const WebScannerView({
    super.key,
    required this.onBarcodeScanned,
    this.height = 180,
  });

  @override
  Widget build(BuildContext context) {
    return buildInlineScannerView(
      onBarcodeScanned: onBarcodeScanned,
      height: height,
    );
  }
}
