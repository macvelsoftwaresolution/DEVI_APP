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
  final Set<String> _expandedIds = {};

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
        // Auto-expand the latest alert by default
        if (results.isNotEmpty && results.first['id'] != null) {
          _expandedIds.add(results.first['id'].toString());
        }
      });
    }
  }

  void _toggleExpand(String id) {
    setState(() {
      if (_expandedIds.contains(id)) {
        _expandedIds.remove(id);
      } else {
        _expandedIds.add(id);
      }
    });
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
                              final alertId = item['id']?.toString() ?? index.toString();
                              final isExpanded = _expandedIds.contains(alertId);
                              final timeStr = _formatLocalDisplayTime(item['timestamp'], item['displayTime']);

                              // Status determination:
                              // 1. RESOLVED
                              // 2. HELPER ON THE WAY (Assigned)
                              // 3. DISPATCHED (Triggered)
                              final rawStatus = (item['status'] ?? 'ACTIVE').toString().toUpperCase();
                              final isResolved = rawStatus == 'RESOLVED';
                              final hasHelper = item['assignedAgent'] != null &&
                                  item['assignedAgent'].toString().trim().isNotEmpty;
                              final isHelperAssigned = !isResolved && (hasHelper || rawStatus == 'ASSIGNED');

                              // Badge configuration
                              final Color badgeBg;
                              final Color badgeBorder;
                              final Color badgeText;
                              final String badgeLabel;
                              final IconData statusIcon;

                              if (isResolved) {
                                badgeBg = const Color(0xFFDCFCE7);
                                badgeBorder = const Color(0xFF86EFAC);
                                badgeText = const Color(0xFF15803D);
                                badgeLabel = 'RESOLVED';
                                statusIcon = Icons.check_circle_rounded;
                              } else if (isHelperAssigned) {
                                badgeBg = const Color(0xFFFEF3C7);
                                badgeBorder = const Color(0xFFFCD34D);
                                badgeText = const Color(0xFFB45309);
                                badgeLabel = 'HELPER ON THE WAY';
                                statusIcon = Icons.directions_run_rounded;
                              } else {
                                badgeBg = const Color(0xFFE0F2FE);
                                badgeBorder = const Color(0xFF7DD3FC);
                                badgeText = const Color(0xFF0369A1);
                                badgeLabel = 'DISPATCHED';
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
                                        : (isHelperAssigned ? const Color(0xFFFDE68A) : AppColors.emergencyRed.withValues(alpha: 0.3)),
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
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(16),
                                  onTap: () => _toggleExpand(alertId),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 12.0),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        // Header Row: Icon + Time + Status Badge + Arrow
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
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    timeStr,
                                                    style: const TextStyle(
                                                      fontSize: 13.5,
                                                      fontWeight: FontWeight.w700,
                                                      color: AppColors.primaryNavy,
                                                      letterSpacing: -0.2,
                                                    ),
                                                    overflow: TextOverflow.ellipsis,
                                                  ),
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    isResolved
                                                        ? 'Incident Closed'
                                                        : (isHelperAssigned ? 'Assistance en route' : 'Emergency dispatched'),
                                                    style: TextStyle(
                                                      fontSize: 11,
                                                      fontWeight: FontWeight.w500,
                                                      color: isResolved ? const Color(0xFF16A34A) : (isHelperAssigned ? const Color(0xFFD97706) : const Color(0xFF0284C7)),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            // Status Badge
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                              decoration: BoxDecoration(
                                                color: badgeBg,
                                                borderRadius: BorderRadius.circular(6),
                                                border: Border.all(color: badgeBorder, width: 0.8),
                                              ),
                                              child: Text(
                                                badgeLabel,
                                                style: TextStyle(
                                                  fontSize: 9.5,
                                                  fontWeight: FontWeight.w800,
                                                  color: badgeText,
                                                  letterSpacing: 0.3,
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 4),
                                            Icon(
                                              isExpanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                                              size: 20,
                                              color: AppColors.textMuted,
                                            ),
                                          ],
                                        ),

                                        // EXPANDABLE DETAILS DROPDOWN
                                        if (isExpanded) ...[
                                          const SizedBox(height: 12),
                                          Container(
                                            width: double.infinity,
                                            padding: const EdgeInsets.all(12),
                                            decoration: BoxDecoration(
                                              color: const Color(0xFFF8FAFC),
                                              borderRadius: BorderRadius.circular(12),
                                              border: Border.all(color: const Color(0xFFE2E8F0)),
                                            ),
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                // TIMELINE STEP 1: TRIGGERED
                                                _buildTimelineStep(
                                                  isDone: true,
                                                  icon: Icons.notifications_active_rounded,
                                                  color: const Color(0xFFEF4444),
                                                  title: 'SOS Triggered',
                                                  time: _formatLocalTimeOnly(item['timestamp'], item['displayTime'] ?? 'Initiated'),
                                                  subtitle: 'Alert broadcast to safety network',
                                                ),
                                                _buildTimelineLine(isDone: isHelperAssigned || isResolved),

                                                // TIMELINE STEP 2: HELPER ASSIGNED
                                                _buildTimelineStep(
                                                  isDone: isHelperAssigned || isResolved,
                                                  icon: Icons.shield_rounded,
                                                  color: (isHelperAssigned || isResolved) ? const Color(0xFF2563EB) : const Color(0xFF94A3B8),
                                                  title: 'Helper Assigned',
                                                  time: item['assignedTime'] != null
                                                      ? _formatLocalTimeOnly(item['assignedTime'], item['displayAssignedTime'])
                                                      : (isHelperAssigned || isResolved ? 'Assigned' : 'Pending'),
                                                  subtitle: hasHelper
                                                      ? item['assignedAgent'].toString()
                                                      : (isResolved ? 'Patrol Agent Dispatched' : 'Assigning nearest responder...'),
                                                ),
                                                _buildTimelineLine(isDone: isResolved),

                                                // TIMELINE STEP 3: RESOLVED
                                                _buildTimelineStep(
                                                  isDone: isResolved,
                                                  icon: Icons.verified_rounded,
                                                  color: isResolved ? const Color(0xFF16A34A) : const Color(0xFF94A3B8),
                                                  title: isResolved ? 'Resolved' : 'Resolution',
                                                  time: item['resolvedTime'] != null
                                                      ? _formatLocalTimeOnly(item['resolvedTime'], item['displayResolvedTime'])
                                                      : (isResolved ? 'Resolved' : 'In Progress'),
                                                  subtitle: isResolved ? 'Incident verified & closed safe' : 'Active monitoring',
                                                ),

                                                // Location Note (Minimal)
                                                if (item['location'] != null && item['location'].toString().trim().isNotEmpty) ...[
                                                  const SizedBox(height: 10),
                                                  Row(
                                                    children: [
                                                      const Icon(Icons.location_on_outlined, size: 13, color: AppColors.textMuted),
                                                      const SizedBox(width: 4),
                                                      Expanded(
                                                        child: Text(
                                                          item['location'].toString(),
                                                          style: const TextStyle(
                                                            fontSize: 11,
                                                            color: AppColors.textMuted,
                                                            fontWeight: FontWeight.w500,
                                                          ),
                                                          maxLines: 1,
                                                          overflow: TextOverflow.ellipsis,
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ],

                                                // Audio/Video Evidence Link if present
                                                if (item['evidenceUrl'] != null) ...[
                                                  const SizedBox(height: 8),
                                                  Row(
                                                    children: [
                                                      const Icon(Icons.mic_none_rounded, size: 13, color: Color(0xFF0284C7)),
                                                      const SizedBox(width: 4),
                                                      const Text(
                                                        'Evidence recorded (Saved securely)',
                                                        style: TextStyle(
                                                          fontSize: 11,
                                                          fontWeight: FontWeight.w600,
                                                          color: Color(0xFF0284C7),
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ],
                                              ],
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
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

  Widget _buildTimelineStep({
    required bool isDone,
    required IconData icon,
    required Color color,
    required String title,
    required String time,
    required String subtitle,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            color: isDone ? color.withValues(alpha: 0.12) : const Color(0xFFF1F5F9),
            shape: BoxShape.circle,
            border: Border.all(
              color: isDone ? color : const Color(0xFFCBD5E1),
              width: 1.2,
            ),
          ),
          child: Icon(icon, size: 12, color: isDone ? color : const Color(0xFF94A3B8)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isDone ? AppColors.primaryNavy : const Color(0xFF94A3B8),
                    ),
                  ),
                  Text(
                    time,
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w600,
                      color: isDone ? color : const Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 1),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textMuted,
                  fontWeight: FontWeight.w500,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTimelineLine({required bool isDone}) {
    return Container(
      margin: const EdgeInsets.only(left: 10, top: 2, bottom: 2),
      width: 2,
      height: 14,
      color: isDone ? const Color(0xFF93C5FD) : const Color(0xFFE2E8F0),
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
