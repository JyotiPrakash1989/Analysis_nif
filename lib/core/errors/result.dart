/// Result type for fallible operations.
/// [T] = success value, [E] = error type.
sealed class Result<T, E> {
  const Result();

  static Result<T, E> success<T, E>(T value) => Success<T, E>(value);
  static Result<T, E> failure<T, E>(E error) => Failure<T, E>(error);

  bool get isSuccess => this is Success<T, E>;
  bool get isFailure => this is Failure<T, E>;

  T? get successOrNull =>
      switch (this) { Success(:final value) => value, _ => null };
  E? get failureOrNull =>
      switch (this) { Failure(:final error) => error, _ => null };

  R when<R>({required R Function(T value) success, required R Function(E error) failure}) {
    return switch (this) {
      Success(value: final v) => success(v),
      Failure(error: final e) => failure(e),
    };
  }
}

final class Success<T, E> extends Result<T, E> {
  const Success(this.value);
  final T value;
}

final class Failure<T, E> extends Result<T, E> {
  const Failure(this.error);
  final E error;
}
