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
                              final location = item['location'] ?? 'GPS Location Shared';
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
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            timeStr,
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                              color: AppColors.primaryNavy,
                                              letterSpacing: -0.2,
                                            ),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: isRecent
                                                ? AppColors.emergencyRed.withValues(alpha: 0.1)
                                                : Colors.grey.shade100,
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            item['status'] ?? 'DISPATCHED',
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w700,
                                              color: isRecent ? AppColors.emergencyRed : Colors.grey.shade700,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Row(
                                      children: [
                                        Icon(
                                          Icons.location_on_outlined,
                                          size: 15,
                                          color: isRecent ? AppColors.emergencyRed : AppColors.pinTeal,
                                        ),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            location,
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w500,
                                              color: AppColors.textMuted,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (contacts.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      Row(
                                        children: [
                                          const Icon(
                                            Icons.people_outline,
                                            size: 14,
                                            color: AppColors.textLight,
                                          ),
                                          const SizedBox(width: 4),
                                          Expanded(
                                            child: Text(
                                              'Alerted: $contacts',
                                              style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w400,
                                                color: AppColors.textLight,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ],
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
