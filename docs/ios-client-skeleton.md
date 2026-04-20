# iOS Client Skeleton

## Design Direction

The local design references live at:

- `references/awesome-design-md`

The MVP direction is still based on those high-level cues:

- Apple: premium white space and clarity
- Uber: strong mobility-oriented primary actions
- Claude: warm AI-oriented editorial tone

Resulting UI direction:

- light theme first
- warm off-white canvas instead of stark white
- graphite text and surfaces
- restrained amber accent for AI warmth
- one dominant action on each screen
- large tap targets and low visual clutter

## Current Screen Stack

1. `AuthView`
2. `OnboardingView`
3. `PassengerNamingView`
4. `HomeView`
5. `ProfileView`
6. `LiveChatView`
7. `SessionSummaryView`

The launch state is a loading gate owned by `RootView` and `AppViewModel`; it restores auth before routing into the visible screen stack.

## App Structure

```text
ios/PassengerApp/
  PassengerClient/
    PassengerClient.xcodeproj
    PassengerClient/
      App/
      Design/
      Models/
      Services/
      Views/
```

Source of truth:

- update Swift sources inside `ios/PassengerApp/PassengerClient/PassengerClient`
- keep design and API contracts aligned with the backend at `http://localhost:3000/v1` for Simulator work
- if testing on a physical device later, replace `localhost` with a reachable host and align `PUBLIC_WS_BASE_URL` on the backend if needed

## State Strategy

- `AppViewModel` owns root navigation, bootstrap, profile state, and active session state
- `BackendAPIClient` is the default runtime client used by `PassengerClientApp`
- `RealtimeWebSocketClient` owns the authenticated websocket session for live chat
- `MockAPIClient` remains available only for local UI iteration; it is not the default app runtime path anymore
- `ChatViewModel` owns transient live chat state for the voice screen

## Current Client Flow

1. App launches and calls `bootstrap()`.
2. If a stored access token exists, the client requests `GET /v1/me` and then `GET /v1/profile`.
3. If no valid token exists, the app routes to `AuthView`.
4. `Continue as Guest` calls `POST /v1/auth/guest`.
5. `Continue with Apple` calls `POST /v1/auth/apple` with a locally persisted mock identity token for MVP.
6. If no profile exists, the app routes to `OnboardingView`.
7. Saving onboarding data calls `PUT /v1/profile`, then reloads `GET /v1/profile`, then routes to `PassengerNamingView`.
8. `PassengerNamingView` stores a local display name in `UserDefaults` and routes to `HomeView`.
9. `Start Chat` calls `POST /v1/sessions`, then `LiveChatView` opens an authenticated websocket connection.
10. Ending the session calls `POST /v1/sessions/:id/end`, then `GET /v1/sessions/:id/summary`.

## Current Realtime Scope

The live chat screen is wired to the backend contract, but the transport is still an MVP mock of the future audio pipeline:

- the mic button currently sends an `audio.commit` event with canned text
- the backend responds with transcript and assistant text events over websocket
- interrupt is real at the protocol level through `assistant.interrupt`
- binary audio capture, ASR, and streamed TTS are still future work

## Build Direction

1. Keep the current authenticated REST + websocket flow stable.
2. Replace the canned text prompt path with real voice capture while preserving the existing view-layer contracts.
3. Continue all iOS work inside the Xcode project source tree only.
