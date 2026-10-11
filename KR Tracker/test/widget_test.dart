import 'package:flutter_test/flutter_test.dart';
import 'package:kr_tracker/main.dart';

void main() {
  testWidgets('KR Track App launches smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const KRTrackApp());
    expect(find.byType(KRTrackApp), findsOneWidget);
  });
}
