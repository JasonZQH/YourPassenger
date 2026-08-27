# PassengerClient iOS App

This folder contains the active Xcode project for the SwiftUI MVP client.

Source of truth:

- `ios/PassengerApp/PassengerClient/PassengerClient.xcodeproj`
- `ios/PassengerApp/PassengerClient/PassengerClient`

Current scope:

- auth
- onboarding
- passenger naming
- home
- profile
- live chat
- session summary
- real REST + WebSocket integration through `app-server`

Current runtime notes:

- the default app path uses `BackendAPIClient`, not `MockAPIClient`
- the client targets `http://localhost:3000/v1` for Simulator
- realtime connects to `/v1/realtime?sessionId=...` with a bearer token header
- local Apple sign-in is still mock-token based

Rule:

- Only edit files inside the Xcode project source tree above
- Do not reintroduce parallel copies under `ios/PassengerApp`
