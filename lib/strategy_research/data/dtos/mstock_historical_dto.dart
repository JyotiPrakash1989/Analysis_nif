import '../sources/remote/mstock_api_helpers.dart';

/// One candle from mStock historical API: [timestamp, open, high, low, close, volume].
typedef MstockCandle = List<dynamic>;

/// Response from mStock Type B historical candles API.
class MstockHistoricalResponseDto {
  const MstockHistoricalResponseDto({
    this.status = false,
    this.message = '',
    this.errorcode,
    this.candles = const [],
  });

  final bool status;
  final String message;
  final String? errorcode;
  final List<MstockCandle> candles;

  factory MstockHistoricalResponseDto.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    List<MstockCandle> candles = [];
    if (data is Map && data['candles'] is List) {
      candles = List<MstockCandle>.from(
        (data['candles'] as List).map((e) => e is List ? List<dynamic>.from(e) : <dynamic>[]),
      );
    }
    final broker = extractMstockBrokerMessage(json);
    return MstockHistoricalResponseDto(
      status: isMstockResponseOk(json) || candles.isNotEmpty,
      message: broker.message.isNotEmpty
          ? broker.message
          : (json['message'] as String? ?? ''),
      errorcode: broker.errorcode.isNotEmpty
          ? broker.errorcode
          : json['errorcode'] as String?,
      candles: candles,
    );
  }

  bool get isSuccess => status && candles.isNotEmpty;
}
