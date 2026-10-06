import 'package:flutter/material.dart';
import '../services/sound_service.dart';

/// Independent, reusable Emergency Siren & Sound Card.
/// Can be embedded in SOS Screen, Responder Screen, or any Safety Screen.
class EmergencySoundCard extends StatefulWidget {
  final VoidCallback? onToggle;

  const EmergencySoundCard({
    super.key,
    this.onToggle,
  });

  @override
  State<EmergencySoundCard> createState() => _EmergencySoundCardState();
}

class _EmergencySoundCardState extends State<EmergencySoundCard> {
  bool _isPlaying = false;

  @override
  void initState() {
    super.initState();
    _isPlaying = SoundService.instance.isPlaying;
  }

  Future<void> _toggleSound() async {
    await SoundService.instance.toggleSiren();
    if (mounted) {
      setState(() {
        _isPlaying = SoundService.instance.isPlaying;
      });
      widget.onToggle?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: _toggleSound,
        borderRadius: BorderRadius.circular(24),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
          decoration: BoxDecoration(
            gradient: _isPlaying
                ? const LinearGradient(
                    colors: [Color(0xFFDC2626), Color(0xFF991B1B)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  )
                : null,
            color: _isPlaying ? null : const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: _isPlaying
                  ? const Color(0xFFFCA5A5)
                  : const Color(0xFF334155),
              width: _isPlaying ? 2.0 : 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: _isPlaying
                    ? const Color(0xFFDC2626).withValues(alpha: 0.45)
                    : Colors.black.withValues(alpha: 0.12),
                blurRadius: _isPlaying ? 18 : 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: _isPlaying
                      ? Colors.white
                      : const Color(0xFFFF521D),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: (_isPlaying
                              ? Colors.white
                              : const Color(0xFFFF521D))
                          .withValues(alpha: 0.35),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: Icon(
                  _isPlaying ? Icons.volume_up : Icons.volume_up_rounded,
                  color: _isPlaying
                      ? const Color(0xFFDC2626)
                      : Colors.white,
                  size: 28,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          _isPlaying
                              ? 'Siren Playing...'
                              : 'Emergency Sound',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.2,
                          ),
                        ),
                        if (_isPlaying) ...[
                          const SizedBox(width: 6),
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Colors.yellowAccent,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _isPlaying
                          ? 'Tap card to stop siren'
                          : 'Tap to sound loud siren',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: _isPlaying
                            ? Colors.white.withValues(alpha: 0.9)
                            : Colors.white.withValues(alpha: 0.65),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: _isPlaying
                      ? Colors.white
                      : Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: _isPlaying
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.2),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _isPlaying
                          ? Icons.stop_circle
                          : Icons.play_arrow_rounded,
                      size: 16,
                      color: _isPlaying
                          ? const Color(0xFFDC2626)
                          : Colors.white,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _isPlaying ? 'STOP' : 'PLAY',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: _isPlaying
                            ? const Color(0xFFDC2626)
                            : Colors.white,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
