# DEVI – User App (Flutter)

Women safety app: login / Instant SOS, SOS with 5s countdown or hold, 2-minute evidence recording, live location tracking and guardian alerts.

## Run

```bash
flutter pub get
flutter run -d chrome                     # web debug → local backend (localhost:5005)
flutter run --dart-define=SERVER=live     # use live server
flutter run --dart-define=SERVER=local    # force local backend
```

See [../docs/DEVI_SYSTEM_ARCHITECTURE.md](../docs/DEVI_SYSTEM_ARCHITECTURE.md) for the full system flow.
