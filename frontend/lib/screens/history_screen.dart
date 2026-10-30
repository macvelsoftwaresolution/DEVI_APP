import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../theme/app_colors.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<Map<String, dynamic>> _alerts = [];
  bool _isLoading = true;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _fetchHistory();
    // Auto-refresh every 4 seconds if there is an active/unresolved alert
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (mounted && _alerts.any((a) => (a['status'] ?? '').toString().toUpperCase() != 'RESOLVED')) {
        _fetchHistory(isSilent: true);
      }
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchHistory({bool isSilent = false}) async {
    if (!isSilent) setState(() => _isLoading = true);
    final state = AppState.instance;
    final results = state.isGuest
        ? await ApiService.instance.getGuestHistory(await state.guestAlertTokens())
        : await ApiService.instance.getHistory(state.phone);

    if (mounted) {
      setState(() {
        _alerts = results;
        if (!isSilent) _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSmallScreen = MediaQuery.of(context).size.width < 360;
    final horizontalPad = isSmallScreen ? 12.0 : 18.0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: const BoxDecoration(
                color: AppColors.guestShieldBg,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Icon(
                  Icons.shield_outlined,
                  color: AppColors.guestShieldRed,
                  size: 18,
                ),
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'History',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryNavy,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.primaryNavy, size: 20),
            onPressed: _fetchHistory,
            tooltip: 'Refresh',
          ),
          IconButton(
            icon: const Icon(Icons.arrow_back, color: AppColors.primaryNavy),
            onPressed: () => Navigator.of(context).pop(),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(AppColors.primaryNavy),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _fetchHistory,
                    color: AppColors.primaryNavy,
                    child: _alerts.isEmpty
                        ? ListView(
                            children: const [
                              SizedBox(height: 120),
                              Center(
                                child: Column(
                                  children: [
                                    Icon(
                                      Icons.history_outlined,
                                      size: 56,
                                      color: AppColors.textLight,
                                    ),
                                    SizedBox(height: 12),
                                    Text(
                                      'No emergency alerts recorded yet',
                                      style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                        color: AppColors.textMuted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          )
                        : ListView.separated(
                            padding: EdgeInsets.symmetric(horizontal: horizontalPad, vertical: 12.0),
                            itemCount: _alerts.length,
                            separatorBuilder: (context, index) => const SizedBox(height: 12),
                            itemBuilder: (context, index) {
                              final item = _alerts[index];
                              final timeStr = _formatLocalDisplayTime(item['timestamp'], item['displayTime']);

                              // Status determination:
                              // 1. RESOLVED
                              // 2. ACTIVE (Triggered, admin monitoring)
                              final rawStatus = (item['status'] ?? 'ACTIVE').toString().toUpperCase();
                              final isResolved = rawStatus == 'RESOLVED';

                              // Badge configuration
                              final Color badgeBg;
                              final Color badgeText;
                              final IconData statusIcon;

                              if (isResolved) {
                                badgeBg = const Color(0xFFDCFCE7);
                                badgeText = const Color(0xFF15803D);
                                statusIcon = Icons.check_circle_rounded;
                              } else {
                                badgeBg = const Color(0xFFE0F2FE);
                                badgeText = const Color(0xFF0369A1);
                                statusIcon = Icons.crisis_alert_rounded;
                              }

                              return Container(
                                width: double.infinity,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: isResolved
                                        ? const Color(0xFFE2E8F0)
                                        : AppColors.emergencyRed.withValues(alpha: 0.3),
                                    width: 1.2,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.02),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 12.0),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      // Header Row: Icon + Date
                                      Row(
                                        children: [
                                          Container(
                                            width: 32,
                                            height: 32,
                                            decoration: BoxDecoration(
                                              color: badgeBg,
                                              shape: BoxShape.circle,
                                            ),
                                            child: Icon(statusIcon, size: 16, color: badgeText),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(
                                              timeStr,
                                              style: const TextStyle(
                                                fontSize: 13.5,
                                                fontWeight: FontWeight.w700,
                                                color: AppColors.primaryNavy,
                                                letterSpacing: -0.2,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ],
                                      ),

                                      const SizedBox(height: 10),

                                      // SOS Triggered Section with Time
                                      Container(
                                        width: double.infinity,
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFF8FAFC),
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: const Color(0xFFE2E8F0)),
                                        ),
                                        child: Row(
                                          children: [
                                            Container(
                                              width: 22,
                                              height: 22,
                                              decoration: BoxDecoration(
                                                color: const Color(0xFFEF4444).withValues(alpha: 0.12),
                                                shape: BoxShape.circle,
                                                border: Border.all(
                                                  color: const Color(0xFFEF4444),
                                                  width: 1.2,
                                                ),
                                              ),
                                              child: const Icon(Icons.notifications_active_rounded, size: 12, color: Color(0xFFEF4444)),
                                            ),
                                            const SizedBox(width: 10),
                                            const Expanded(
                                              child: Text(
                                                'SOS Triggered',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w700,
                                                  color: AppColors.primaryNavy,
                                                ),
                                              ),
                                            ),
                                            Text(
                                              _formatLocalTimeOnly(item['timestamp'], item['displayTime'] ?? 'Initiated'),
                                              style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                                color: Color(0xFFEF4444),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
          ),
        ),
      ),
    );
  }



  String _formatLocalDisplayTime(dynamic rawIso, dynamic fallback) {
    if (rawIso != null) {
      try {
        final str = rawIso.toString();
        if (str.contains('T') || str.endsWith('Z')) {
          final dt = DateTime.parse(str).toLocal();
          final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
          final minute = dt.minute.toString().padLeft(2, '0');
          final ampm = dt.hour >= 12 ? 'PM' : 'AM';
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          final day = dt.day.toString().padLeft(2, '0');
          final month = months[dt.month - 1];
          final year = dt.year;
          return '$day $month $year, $hour:$minute $ampm';
        }
      } catch (_) {}
    }
    return fallback?.toString() ?? 'Recent';
  }

  String _formatLocalTimeOnly(dynamic rawIso, dynamic fallback) {
    if (rawIso != null) {
      try {
        final str = rawIso.toString();
        if (str.contains('T') || str.endsWith('Z')) {
          final dt = DateTime.parse(str).toLocal();
          final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
          final minute = dt.minute.toString().padLeft(2, '0');
          final ampm = dt.hour >= 12 ? 'PM' : 'AM';
          return '$hour:$minute $ampm';
        }
      } catch (_) {}
    }
    return fallback?.toString() ?? '';
  }
}
