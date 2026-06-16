import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:strategy/main.dart';

void main() {
  setUpAll(() {
    dotenv.testLoad();
  });

  testWidgets('Nifty Alpha smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: NiftyAlphaApp(),
      ),
    );
    await tester.pump();

    expect(find.text('Nifty Alpha'), findsOneWidget);
    expect(find.text('Dashboard'), findsOneWidget);

    await tester.pump(const Duration(seconds: 1));
  });
}
