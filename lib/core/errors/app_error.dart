/// App-level error for unexpected failures.
sealed class AppError {
  const AppError();
}

final class AppErrorUnknown extends AppError {
  const AppErrorUnknown([this.message]);
  final String? message;
}
