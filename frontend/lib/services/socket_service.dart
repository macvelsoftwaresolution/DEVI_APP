import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api_service.dart';
import 'encryption_service.dart';

/// Low-Bandwidth Real-Time WebSocket Service for DEVI Safety App.
///
/// Advantages over HTTP Polling in 2G / Weak Networks:
/// 1. Single persistent TCP/TLS handshake — zero redundant HTTP request headers (~800 bytes saved per point).
/// 2. Frames use minimal 2-6 bytes framing overhead.
/// 3. Offline Buffering / Queue: If connection drops in signal dead zones, coordinates
///    are queued and instantly synced once signal returns.
/// 4. Graceful Fallback: Automatically falls back to HTTP REST if WebSocket fails.
class SocketService {
  static final SocketService instance = SocketService._internal();
  factory SocketService() => instance;
  SocketService._internal();

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;

  bool _isConnecting = false;
  bool _manuallyClosed = false;
  int _reconnectAttempts = 0;
  int _sequenceNumber = 0;

  final ValueNotifier<bool> isConnected = ValueNotifier<bool>(false);

  // Offline buffer queue (holds last 20 coordinates when signal is lost)
  final Queue<Map<String, dynamic>> _offlineQueue = Queue<Map<String, dynamic>>();

  /// Connects to the backend WebSocket stream
  void connect() {
    if (isConnected.value || _isConnecting) return;

    _manuallyClosed = false;
    _isConnecting = true;

    final url = ApiService.wsUrl;
    debugPrint('⚡ [WEBSOCKET CONNECTING] To $url (Low-Bandwidth Mode)');

    try {
      final uri = Uri.parse(url);
      _channel = WebSocketChannel.connect(uri);

      _subscription = _channel!.stream.listen(
        (event) {
          _handleIncomingMessage(event);
        },
        onDone: () {
          debugPrint('⚠️ [WEBSOCKET CLOSED] Stream completed.');
          _handleDisconnect();
        },
        onError: (error) {
          debugPrint('❌ [WEBSOCKET ERROR] $error');
          _handleDisconnect();
        },
        cancelOnError: true,
      );

      _onConnected();
    } catch (e) {
      debugPrint('❌ [WEBSOCKET INIT FAILED] $e');
      _handleDisconnect();
    }
  }

  void _onConnected() {
    _isConnecting = false;
    _reconnectAttempts = 0;
    isConnected.value = true;
    debugPrint('✅ [WEBSOCKET CONNECTED] Real-time low-bandwidth channel established.');

    // Start 25-second heartbeat ping to keep connection alive on cellular NATs
    _startHeartbeat();

    // Flush any pending coordinates accumulated during dead zones
    _flushOfflineQueue();
  }

  void _handleIncomingMessage(dynamic event) {
    try {
      final raw = event.toString();
      if (raw == 'pong') return;

      final data = jsonDecode(raw) as Map<String, dynamic>;
      final type = data['type'];

      if (type == 'ack') {
        // Confirmation from server that location packet was received
        debugPrint('🛰️ [WS ACK RECEIVED] Seq: ${data['seq']} for Alert #${data['alertId']}');
      } else if (type == 'pong') {
        // Heartbeat confirmed
      }
    } catch (e) {
      debugPrint('WS parse error: $e');
    }
  }

  void _handleDisconnect() {
    _isConnecting = false;
    isConnected.value = false;
    _stopHeartbeat();
    _cleanupChannel();

    if (_manuallyClosed) return;

    // Exponential backoff reconnect: 1s, 2s, 4s, max 8s
    final delaySeconds = (_reconnectAttempts < 3) ? (1 << _reconnectAttempts) : 8;
    _reconnectAttempts++;

    debugPrint('⏳ [WEBSOCKET RECONNECTING] in ${delaySeconds}s (Attempt $_reconnectAttempts)...');
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(seconds: delaySeconds), () {
      connect();
    });
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (timer) {
      if (isConnected.value && _channel != null) {
        try {
          _channel!.sink.add('ping');
        } catch (_) {
          _handleDisconnect();
        }
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void _cleanupChannel() {
    try {
      _subscription?.cancel();
      _subscription = null;
      _channel?.sink.close();
      _channel = null;
    } catch (_) {}
  }

  /// Sends a live GPS location update packet.
  ///
  /// Low-Bandwidth Optimizations:
  /// - Minimal JSON structure (~60 bytes instead of 800+ bytes HTTP header).
  /// - If offline, buffers up to 20 coordinates so no emergency route data is lost.
  /// - Automatically falls back to HTTP REST API if WebSocket fails.
  void sendLocationUpdate({
    required String alertId,
    required double latitude,
    required double longitude,
    double? accuracy,
    double? speed,
    double? heading,
    String status = 'ACTIVE',
  }) {
    final seq = ++_sequenceNumber;
    final plainPacket = <String, dynamic>{
      'type': 'loc',
      'alertId': alertId,
      'lat': latitude,
      'lng': longitude,
      'status': status,
      'seq': seq,
    };
    if (accuracy != null) {
      plainPacket['acc'] = accuracy;
      plainPacket['accuracy'] = accuracy;
    }
    if (speed != null) plainPacket['spd'] = speed;
    if (heading != null) plainPacket['hd'] = heading;

    // Encrypt coordinates & telemetry with AES-256
    final cipher = EncryptionService.instance.encryptJson(plainPacket);
    final packet = <String, dynamic>{
      'alertId': alertId,
      'encrypted': cipher,
    };

    if (isConnected.value && _channel != null) {
      try {
        final encoded = jsonEncode(packet);
        _channel!.sink.add(encoded);
        debugPrint('🔒 [AES-256 WS LOCATION PUSHED] Seq #$seq Lat: $latitude, Lng: $longitude, Acc: $accuracy');
        return;
      } catch (e) {
        debugPrint('⚠️ [WS SEND FAILED] Falling back to offline buffer & HTTP: $e');
      }
    }

    // Buffer offline coordinates
    if (_offlineQueue.length >= 20) {
      _offlineQueue.removeFirst(); // Drop oldest to prevent unbounded memory growth
    }
    _offlineQueue.add(packet);

    // Fallback to HTTP API
    ApiService.instance.updateLiveLocation(
      alertId: alertId,
      latitude: latitude,
      longitude: longitude,
      accuracy: accuracy,
      status: status,
    );
  }

  void _flushOfflineQueue() {
    if (_offlineQueue.isEmpty || !isConnected.value || _channel == null) return;

    debugPrint('📤 [FLUSHING OFFLINE QUEUE] Sending ${_offlineQueue.length} buffered points...');
    while (_offlineQueue.isNotEmpty && isConnected.value) {
      final packet = _offlineQueue.removeFirst();
      try {
        _channel!.sink.add(jsonEncode(packet));
      } catch (e) {
        _offlineQueue.addFirst(packet);
        break;
      }
    }
  }

  /// Explicitly disconnects WebSocket (e.g., when SOS is deactivated)
  void disconnect() {
    _manuallyClosed = true;
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _cleanupChannel();
    isConnected.value = false;
    _offlineQueue.clear();
    debugPrint('🛑 [WEBSOCKET DISCONNECTED] Closed manually.');
  }
}
