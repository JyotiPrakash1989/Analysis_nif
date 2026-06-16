/// Represents async data state: initial, loading, success, or failure.
sealed class DataState<T> {
  const DataState();
  factory DataState.initial() = DataStateInitial<T>;
  factory DataState.loading() = DataStateLoading<T>;
  factory DataState.success({required T value}) = DataStateSuccess<T>;
  factory DataState.failure({required Object error}) = DataStateFailure<T>;
  bool get isLoading => this is DataStateLoading<T>;
  bool get isSuccess => this is DataStateSuccess<T>;
  bool get hasFailure => this is DataStateFailure<T>;
  bool get isInitial => this is DataStateInitial<T>;
  T? get valueOrNull => switch (this) {
        DataStateSuccess(value: final v) => v,
        _ => null,
      };
}

final class DataStateInitial<T> extends DataState<T> {
  const DataStateInitial();
}

final class DataStateLoading<T> extends DataState<T> {
  const DataStateLoading();
}

final class DataStateSuccess<T> extends DataState<T> {
  const DataStateSuccess({required this.value});
  final T value;
}

final class DataStateFailure<T> extends DataState<T> {
  const DataStateFailure({required this.error});
  final Object error;
}
