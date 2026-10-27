# Store listing images

- `feature-graphic.html` → `../feature-graphic-1024x500.png` (render with headless Edge at 1024x500).
- Screenshots are the **real app** rendered from a Flutter web build with demo data (Priya / Amma / 9876543210):
  1. `flutter build web --release --dart-define=SERVER=local -o <dir>` (SERVER=local: no calls to the live API)
  2. copy `preset.html` into `<dir>` and serve it: `python -m http.server 8765 --bind 127.0.0.1`
  3. `node shoot.mjs ../raw sos:01-sos.png setup:02-setup.png terms:03-terms.png login:04-login.png`
  4. `python ../frame_screenshots.py` → `../framed/*.png` (1080x1920, upload these)
