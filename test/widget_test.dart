import 'package:flutter_test/flutter_test.dart';
import 'package:devi/main.dart';

void main() {
  testWidgets('App smoke test - displays login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const DeviApp());
    expect(find.text('Your Guardian'), findsOneWidget);
  });
}
