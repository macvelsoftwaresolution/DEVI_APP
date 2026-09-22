import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class HistoryItem {
  final String timestamp;
  final String location;
  final Color pinColor;

  const HistoryItem({
    required this.timestamp,
    required this.location,
    required this.pinColor,
  });
}

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  static const List<HistoryItem> _sampleHistory = [
    HistoryItem(
      timestamp: 'Today, 10:42 PM',
      location: '143 Road Metro Station, Gate 2',
      pinColor: AppColors.pinRed,
    ),
    HistoryItem(
      timestamp: '12 Sep 2026, 11:30 PM',
      location: 'Koramangala 5th Block',
      pinColor: AppColors.pinTeal,
    ),
    HistoryItem(
      timestamp: '04 Sep 2026, 08:15 PM',
      location: 'Indiranagar 100ft Road',
      pinColor: AppColors.pinTeal,
    ),
  ];

  @override
  Widget build(BuildContext context) {
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
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 18.0, vertical: 12.0),
              itemCount: _sampleHistory.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final item = _sampleHistory[index];
                return Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: AppColors.borderCard,
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.timestamp,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primaryNavy,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(
                            Icons.location_on_outlined,
                            size: 15,
                            color: item.pinColor,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              item.location,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
