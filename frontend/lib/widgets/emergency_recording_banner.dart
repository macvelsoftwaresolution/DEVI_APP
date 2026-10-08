import 'package:flutter/material.dart';

class EmergencyRecordingBanner extends StatelessWidget {
  const EmergencyRecordingBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}

/*

class _EmergencyRecordingBannerState extends State<EmergencyRecordingBanner>
    with SingleTickerProviderStateMixin {
  final EmergencyMediaService _mediaService = EmergencyMediaService.instance;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _mediaService.addListener(_onMediaStateChanged);
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _mediaService.removeListener(_onMediaStateChanged);
    _pulseController.dispose();
    super.dispose();
  }

  void _onMediaStateChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (_mediaService.isRecording) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1014),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppColors.emergencyRed.withValues(alpha: 0.6),
            width: 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.emergencyRed.withValues(alpha: 0.25),
              blurRadius: 16,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Row(
          children: [
            // Pulsing Red Recording Dot
            FadeTransition(
              opacity: _pulseController,
              child: Container(
                width: 14,
                height: 14,
                decoration: const BoxDecoration(
                  color: AppColors.emergencyRed,
                  shape: BoxShape.circle,
                ),
              ),
            ),
            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      const Text(
                        'REC ',
                        style: TextStyle(
                          color: AppColors.emergencyRed,
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                          letterSpacing: 0.5,
                        ),
                      ),
                      Text(
                        _mediaService.remainingFormatted,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                      const Text(
                        ' / 02:00',
                        style: TextStyle(
                          color: Colors.white54,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    '📹 Capturing 2-min video & audio evidence',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            // Stop & Save button
            InkWell(
              onTap: () {
                _mediaService.stopEmergencyRecording();
              },
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.stop_rounded, color: Colors.white, size: 16),
                    SizedBox(width: 4),
                    Text(
                      'Stop',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    // If uploading to Cloudinary in background:
    if (_mediaService.isUploading) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.5)),
        ),
        child: const Row(
          children: [
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Saving Emergency Evidence...',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    'Uploading securely to Cloudinary & Database',
                    style: TextStyle(color: Color(0xFF38BDF8), fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // If not recording, but evidence has been saved:
    if (_mediaService.lastRecordedUrl != null || _mediaService.localFilePath != null) {
      final isCloudSaved = _mediaService.lastRecordedUrl != null &&
          _mediaService.lastRecordedUrl!.startsWith('http');
      final isPlaying = _mediaService.isPlayingAudio;

      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isPlaying ? const Color(0xFF22C55E) : const Color(0xFF334155),
            width: isPlaying ? 1.5 : 1.0,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isPlaying ? Icons.graphic_eq_rounded : Icons.verified_user_rounded,
              color: isPlaying ? const Color(0xFF22C55E) : const Color(0xFF38BDF8),
              size: 22,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    isPlaying ? 'Playing Audio Evidence...' : 'Emergency Evidence Saved',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    isCloudSaved
                        ? '✅ Stored in Cloudinary & Linked to DB'
                        : 'Audio recorded on device',
                    style: TextStyle(
                      color: isCloudSaved ? const Color(0xFF38BDF8) : Colors.white60,
                      fontSize: 11,
                      fontWeight: isCloudSaved ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
            ElevatedButton.icon(
              onPressed: () => _mediaService.viewEvidence(),
              icon: Icon(
                isCloudSaved
                    ? Icons.videocam_rounded
                    : (isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded),
                size: 18,
              ),
              label: Text(
                isCloudSaved
                    ? 'Watch Video'
                    : (isPlaying ? 'Pause' : 'Play Audio'),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: isCloudSaved
                    ? const Color(0xFFEF4444)
                    : (isPlaying ? const Color(0xFF16A34A) : const Color(0xFF2563EB)),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            ),
            const SizedBox(width: 8),
            InkWell(
              onTap: () => _mediaService.dismissEvidence(),
              borderRadius: BorderRadius.circular(16),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.close_rounded, size: 16, color: Colors.white70),
              ),
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
*/
