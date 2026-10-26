import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// The big SOS card. Red: tap for countdown / hold to send. During countdown: Cancel / Send Now.
/// Green while an alert is active: tap to mark yourself safe.
class SosActionCard extends StatelessWidget {
  final bool isEmergencyActive;
  final bool isCountingDown;
  final bool isHolding;
  final double holdProgress;
  final int countdownSeconds;
  final bool isSmallScreen;
  final bool isShortScreen;
  final VoidCallback onTap;
  final VoidCallback onPressStart;
  final VoidCallback onPressEnd;
  final VoidCallback onCancelCountdown;
  final VoidCallback onSendNow;

  const SosActionCard({
    super.key,
    required this.isEmergencyActive,
    required this.isCountingDown,
    required this.isHolding,
    required this.holdProgress,
    required this.countdownSeconds,
    required this.isSmallScreen,
    required this.isShortScreen,
    required this.onTap,
    required this.onPressStart,
    required this.onPressEnd,
    required this.onCancelCountdown,
    required this.onSendNow,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isEmergencyActive
              ? [const Color(0xFF059669), const Color(0xFF047857)]
              : isCountingDown
              ? [const Color(0xFFFF3366), const Color(0xFFCC0826)]
              : [const Color(0xFFE80B1E), const Color(0xFFD60719)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        borderRadius: BorderRadius.circular(isSmallScreen ? 24 : 32),
        boxShadow: [
          BoxShadow(
            color:
                (isEmergencyActive
                        ? const Color(0xFF059669)
                        : isCountingDown
                        ? const Color(0xFFF05252)
                        : AppColors.emergencyRed)
                    .withValues(alpha: 0.35),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        onTapDown: (_) => onPressStart(),
        onTapUp: (_) => onPressEnd(),
        onTapCancel: onPressEnd,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final availableHeight = constraints.maxHeight;
            final circleSize = (availableHeight * 0.22).clamp(52.0, 78.0);
            final iconSize = (circleSize * 0.48).clamp(24.0, 36.0);
            final titleSize = (availableHeight * 0.12).clamp(32.0, 44.0);
            final spacing1 = (availableHeight * 0.04).clamp(8.0, 18.0);
            final spacing2 = (availableHeight * 0.03).clamp(6.0, 12.0);

            return Stack(
              alignment: Alignment.center,
              children: [
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AnimatedScale(
                      scale: (isEmergencyActive || isCountingDown)
                          ? 1.10
                          : isHolding
                          ? 0.94
                          : 1.0,
                      duration: const Duration(milliseconds: 200),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          // Circular Progress Ring when holding
                          if (holdProgress > 0)
                            SizedBox(
                              width: circleSize + 16,
                              height: circleSize + 16,
                              child: CircularProgressIndicator(
                                value: holdProgress,
                                strokeWidth: 4.5,
                                strokeCap: StrokeCap.round,
                                valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                                backgroundColor: Colors.white.withValues(alpha: 0.25),
                              ),
                            ),
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            width: circleSize,
                            height: circleSize,
                            decoration: BoxDecoration(
                              color: isEmergencyActive
                                  ? const Color(0xFF064E3B)
                                  : isCountingDown
                                  ? Colors.white
                                  : const Color(0xFFBF0818),
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.18),
                                  blurRadius: 10,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: Center(
                              child: isCountingDown
                                  ? Text(
                                      '${countdownSeconds}s',
                                      style: TextStyle(
                                        fontSize: iconSize,
                                        fontWeight: FontWeight.w900,
                                        color: const Color(0xFFDC2626),
                                      ),
                                    )
                                  : Icon(
                                      isEmergencyActive ? Icons.verified_user_rounded : Icons.crisis_alert,
                                      color: Colors.white,
                                      size: iconSize,
                                    ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    SizedBox(height: spacing1),

                    Text(
                      isHolding
                          ? 'HOLDING FOR SOS'
                          : isCountingDown
                          ? 'ALERT IN ${countdownSeconds}S'
                          : isEmergencyActive
                          ? "I'M SAFE"
                          : 'SOS',
                      style: TextStyle(
                        fontSize: (isHolding || isCountingDown || isEmergencyActive)
                            ? (titleSize * 0.72).clamp(24.0, 34.0)
                            : titleSize,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: 1.0,
                      ),
                    ),

                    SizedBox(height: spacing2),

                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24.0),
                      child: Text(
                        isHolding
                            ? 'Keep holding to trigger SOS instantly\nRelease finger to cancel'
                            : isCountingDown
                            ? 'Auto-dispatching alert in ${countdownSeconds}s\nTap anywhere or press Cancel'
                            : isEmergencyActive
                            ? 'Alert is Active • Tap here\nto finish alert & mark safe'
                            : 'Tap for 5s countdown or hold to send\nemergency contacts',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: isSmallScreen || isShortScreen ? 11.5 : 12.5,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.92),
                          height: 1.35,
                        ),
                      ),
                    ),

                    if (isEmergencyActive) ...[
                      SizedBox(height: spacing2),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.15),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.verified_user_rounded, color: Color(0xFF059669), size: 18),
                            SizedBox(width: 8),
                            Text(
                              "Tap: I'm Safe",
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF059669),
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    if (isCountingDown) ...[
                      SizedBox(height: spacing2),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: onCancelCountdown,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(20),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.2),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.close, color: Color(0xFFDC2626), size: 16),
                                  SizedBox(width: 4),
                                  Text(
                                    'CANCEL',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFFDC2626),
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: onSendNow,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.22),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: Colors.white, width: 1.5),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.send_rounded, color: Colors.white, size: 15),
                                  SizedBox(width: 4),
                                  Text(
                                    'SEND NOW',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),

                // Hold Progress Indicator (Bottom Bar)
                if (holdProgress > 0)
                  Positioned(
                    bottom: 20,
                    left: 40,
                    right: 40,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: holdProgress,
                        backgroundColor: Colors.white.withValues(alpha: 0.25),
                        valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                        minHeight: 5,
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
