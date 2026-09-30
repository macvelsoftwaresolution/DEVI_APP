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

  @override
  void initState() {
    super.initState();
    _fetchHistory();
  }

  Future<void> _fetchHistory() async {
    setState(() => _isLoading = true);
    final userPhone = AppState.instance.phone;
    final results = await ApiService.instance.getHistory(userPhone);

    if (mounted) {
      setState(() {
        _alerts = results;
        _isLoading = false;
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
                              final timeStr = item['displayTime'] ?? item['timestamp'] ?? 'Recent';
                              final contacts = (item['contactsAlerted'] as List<dynamic>?)
                                      ?.map((c) => c.toString())
                                      .join(', ') ??
                                  '';
                              final isRecent = index == 0;

                              return Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(
                                    color: isRecent ? AppColors.emergencyRed.withValues(alpha: 0.3) : AppColors.borderCard,
                                    width: isRecent ? 1.4 : 1.2,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.02),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Container(
                                          width: 32,
                                          height: 32,
                                          decoration: BoxDecoration(
                                            color: isRecent
                                                ? AppColors.emergencyRed.withValues(alpha: 0.1)
                                                : const Color(0xFFF1F5F9),
                                            shape: BoxShape.circle,
                                          ),
                                          child: Icon(
                                            Icons.crisis_alert,
                                            size: 16,
                                            color: isRecent ? AppColors.emergencyRed : AppColors.primaryNavy,
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                timeStr,
                                                style: const TextStyle(
                                                  fontSize: 14,
                                                  fontWeight: FontWeight.w700,
                                                  color: AppColors.primaryNavy,
                                                  letterSpacing: -0.2,
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 4),
                                              Row(
                                                children: [
                                                  Expanded(
                                                    child: Text(
                                                      (item['status'] == 'DISPATCHED' || item['assignedAgent'] != null)
                                                          ? 'Assistance Dispatched'
                                                          : isRecent
                                                              ? 'Emergency Alert Triggered'
                                                              : 'Alert Triggered',
                                                      style: TextStyle(
                                                        fontSize: 11,
                                                        fontWeight: FontWeight.w500,
                                                        color: (item['status'] == 'DISPATCHED' || item['assignedAgent'] != null)
                                                            ? const Color(0xFF0284C7)
                                                            : isRecent
                                                                ? AppColors.emergencyRed
                                                                : AppColors.textMuted,
                                                      ),
                                                    ),
                                                  ),
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                                    decoration: BoxDecoration(
                                                      color: (item['status'] == 'DISPATCHED' || item['assignedAgent'] != null)
                                                          ? const Color(0xFFE0F2FE)
                                                          : item['status'] == 'RESOLVED'
                                                              ? const Color(0xFFF1F5F9)
                                                              : const Color(0xFFFEE2E2),
                                                      borderRadius: BorderRadius.circular(6),
                                                      border: Border.all(
                                                        color: (item['status'] == 'DISPATCHED' || item['assignedAgent'] != null)
                                                            ? const Color(0xFF7DD3FC)
                                                            : item['status'] == 'RESOLVED'
                                                                ? const Color(0xFFCBD5E1)
                                                                : const Color(0xFFFCA5A5),
                                                        width: 0.8,
                                                      ),
                                                    ),
                                                    child: Text(
                                                      (item['status'] == 'DISPATCHED' || item['assignedAgent'] != null)
                                                          ? 'DISPATCHED'
                                                          : item['status'] == 'RESOLVED'
                                                              ? 'RESOLVED'
                                                              : 'TRIGGERED',
                                                      style: TextStyle(
                                                        fontSize: 9.5,
                                                        fontWeight: FontWeight.w800,
                                                        color: (item['status'] == 'DISPATCHED' || item['assignedAgent'] != null)
                                                            ? const Color(0xFF0369A1)
                                                            : item['status'] == 'RESOLVED'
                                                                ? const Color(0xFF64748B)
                                                                : const Color(0xFFB91C1C),
                                                        letterSpacing: 0.3,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (item['assignedAgent'] != null || item['status'] == 'DISPATCHED') ...[
                                      const SizedBox(height: 10),
                                      Container(
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFF0FDF4),
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: const Color(0xFF86EFAC)),
                                          boxShadow: [
                                            BoxShadow(
                                              color: const Color(0xFF22C55E).withValues(alpha: 0.08),
                                              blurRadius: 6,
                                              offset: const Offset(0, 2),
                                            ),
                                          ],
                                        ),
                                        child: Row(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Container(
                                              width: 32,
                                              height: 32,
                                              decoration: const BoxDecoration(
                                                color: Color(0xFFDCFCE7),
                                                shape: BoxShape.circle,
                                              ),
                                              child: const Icon(
                                                Icons.verified_user,
                                                color: Color(0xFF16A34A),
                                                size: 18,
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    '🚨 Helper is on the way: ' + (item['assignedAgent'] ?? 'Safety Responder'),
                                                    style: const TextStyle(
                                                      fontSize: 12.5,
                                                      fontWeight: FontWeight.w700,
                                                      color: Color(0xFF166534),
                                                    ),
                                                  ),
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    item['responderStatus'] == 'EN_ROUTE'
                                                        ? 'Responder confirmed OK and is actively en route to your live GPS coordinates. Stay calm!'
                                                        : 'Emergency assistance has been dispatched. Help is arriving soon!',
                                                    style: const TextStyle(
                                                      fontSize: 11,
                                                      fontWeight: FontWeight.w500,
                                                      color: Color(0xFF15803D),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                    if (contacts.isNotEmpty) ...[
                                      const SizedBox(height: 10),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFF8FAFC),
                                          borderRadius: BorderRadius.circular(10),
                                          border: Border.all(color: const Color(0xFFE2E8F0)),
                                        ),
                                        child: Row(
                                          children: [
                                            const Icon(
                                              Icons.people_outline,
                                              size: 14,
                                              color: AppColors.textMuted,
                                            ),
                                            const SizedBox(width: 6),
                                            Expanded(
                                              child: Text(
                                                'Alerted: $contacts',
                                                style: const TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w500,
                                                  color: AppColors.textMuted,
                                                ),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ],
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
}
