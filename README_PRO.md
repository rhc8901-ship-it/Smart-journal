# Rohan Chauhan Trades Journals — RC Pro (Capacitor 6)

## Included upgrades
- Native Android speech recognition: `@capacitor-community/speech-recognition` 6.0.1.
- Native Android text-to-speech: `@capacitor-community/text-to-speech` 4.1.1.
- Existing Munim commands, voice-first mode, and AI spoken conversation retained.
- Current news retrieval + AI analysis through GNews (requires a GNews API key).
- Runtime error capture, recovery overlay, offline/online status and local diagnostics.
- Existing RC journal, dashboard, analytics, diary, goals, MT5 import and backup retained.

## GitHub build
Upload/replace all project files at the repository root, including `.github/workflows/build-apk.yml`. Then open GitHub Actions → RC Trades Journal Pro APK → Run workflow. Download artifact `RC-Trades-Journal-Pro-APK`.

## Voice
Tap the gold microphone and grant microphone permission. Commands include: `aaj ka profit`, `win rate`, `monthly performance`, `naya trade`, `open dashboard`, `open trades`, `open goals`, `open diary`, `show last trade`, `delete last trade` (confirmation required), `help`, `repeat`, `speak slower`, `speak faster`, `English mein baat karo`. Ask normal questions for AI voice replies. Enable voice-first mode in Tools for continuous turn-taking.

## Market news
1. Get a key from https://gnews.io/.
2. Open Tools → RC Pro · Market News Intelligence and paste the key.
3. Say `gold news`, `forex news`, `bitcoin news`, `oil news`, or `latest market news`.
4. RC retrieves headlines and asks the configured AI model to analyze supplied article content. Sources are displayed in the chat.

News analysis is based on retrieved articles, not a real-time price feed. GNews Free plan has a 12-hour data delay and a maximum of 10 articles per request; real-time data requires a paid plan. It does not provide buy/sell signals. API availability and quotas are controlled by GNews.

## Limitations / test checklist
- This package is source code plus a GitHub Actions workflow; the APK is generated when you run the workflow.
- Workflow creates a debug APK, not a Play Store-signed release.
- Speech quality and supported languages depend on the Android speech service and installed voice packs. Native TTS uses the device's installed speech engine.
- AI and news require internet; AI needs the configured provider key and news needs the GNews key.
- No app can guarantee zero crashes or identical voice quality on every device. Test mic permission, speech recognition, TTS, voice-first stop, AI replies, news sources, app background/resume and journal save on the target phone.
