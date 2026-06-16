
## ✅ Best Practices for API Keys in Test Environments

### 🔒 1. **Never Hardcode API Keys in Code (Even for Testing)**

❌ Bad:

```dart
const apiKey = "my-secret-api-key"; // Avoid this!
```

✅ Instead, **load them dynamically** from environment files or mock configs.

---

### 📁 2. **Use `.env` Files (with `flutter_dotenv`)**

Create environment files:

```
.env.dev
.env.prod
.env.test
```

Add keys:

```
# .env.test
API_KEY=mock-api-key-for-tests
```

Load in tests:

```dart
import 'package:flutter_dotenv/flutter_dotenv.dart';

void main() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env.test");

  final apiKey = dotenv.env['API_KEY'];
}
```

👉 **Do not commit** these files if they contain sensitive data. Add them to `.gitignore`.

---

### 🧪 3. **Mock API Keys in Unit/Widget Tests**

Use mock services that **don’t require real keys**.

```dart
class MockApiService extends Fake implements ApiService {
  @override
  Future<String> fetchData() async {
    return "mock response";
  }
}
```

Pass dummy keys:

```dart
final mockService = ApiService(apiKey: 'test-api-key');
```

### 🔧 4. **Inject API Keys via Constructor or Dependency Injection**

This allows you to:

* Swap real vs. mock keys easily
* Keep test files clean and controlled

```dart
class ApiService {
  final String apiKey;
  ApiService({required this.apiKey});
}
```

In tests:

```dart
final apiService = ApiService(apiKey: 'mock-test-key');
```

---

### 🤫 5. **Use GitHub Actions Secrets (For CI Tests)**

If your CI (e.g., GitHub Actions) needs a real API key for integration testing:

* Store it in **GitHub Secrets**
* Inject it into `.env.test` at runtime using CI

```yaml
env:
  API_KEY: ${{ secrets.TEST_API_KEY }}
```

---

### 📌 Summary of Best Practices

| Practice                           | Why It’s Good                        |
| ---------------------------------- | ------------------------------------ |
| ❌ Don't hardcode in source code    | Avoid security leaks                 |
| ✅ Use `.env` files                 | Easy to manage multiple environments |
| ✅ Use mock services with fake keys | Safe, fast, reliable tests           |
| ✅ Inject keys via constructor/DI   | Makes testing and switching easier   |
| ✅ Use secrets in CI/CD             | Protect real keys in pipelines       |

---
