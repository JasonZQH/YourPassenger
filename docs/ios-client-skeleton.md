# iOS Client Notes

## Current Runtime Mode

The iOS app is no longer running against a mock backend by default.

Current default path:

- `PassengerClientApp` bootstraps with `BackendAPIClient`
- `BackendAPIClient` targets `http://localhost:3000/v1`
- realtime uses `RealtimeWebSocketClient`
- the public backend entrypoint is `app-server`

`MockAPIClient` still exists in the source tree as a fallback scaffold, but it is not the active app path.

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

Important files:

- `PassengerClientApp.swift`: app entry
- `App/AppViewModel.swift`: root navigation and app-level state
- `Services/BackendAPIClient.swift`: REST client
- `Services/RealtimeWebSocketClient.swift`: websocket client
- `Views/*`: screen implementations

Source of truth:

- keep Swift source changes inside `ios/PassengerApp/PassengerClient/PassengerClient`
- do not create parallel Swift source outside the Xcode project tree

## Current Screen Flow

1. `AuthView`
2. `OnboardingView`
3. `PassengerNamingView`
4. `HomeView`
5. `ProfileView`
6. `LiveChatView`
7. `SessionSummaryView`

App-level routing currently lives in `AppViewModel`.

## Client State Strategy

`AppViewModel` owns:

- bootstrap state
- authentication state
- current profile
- active chat session
- latest session summary
- error and busy flags

The current startup sequence is:

1. restore local access token from `UserDefaults`
2. call `GET /v1/me`
3. call `GET /v1/profile`
4. route to `Auth`, `Onboarding`, or `Home`

## REST Contract Used By iOS

The iOS client currently calls these public routes on `app-server`:

- `POST /v1/auth/apple`
- `POST /v1/auth/guest`
- `GET /v1/me`
- `GET /v1/profile`
- `PUT /v1/profile`
- `POST /v1/sessions`
- `POST /v1/sessions/:id/end`
- `GET /v1/sessions/:id/summary`

Behavior details:

- `Continue with Apple` currently sends a persisted local mock identity token
- `Continue as Guest` creates a new guest identity
- profile load treats empty body or `null` as “profile not created yet”
- `POST /v1/sessions` returns both session metadata and the websocket URL/token payload

## Realtime Contract Used By iOS

The live chat screen connects to:

- `GET ws://localhost:3000/v1/realtime?sessionId=<sessionId>` with `Authorization: Bearer <accessToken>`

Client-sent events:

- `audio.commit`
- `assistant.interrupt`

Server events currently consumed by `RealtimeWebSocketClient`:

- `session.ready`
- `transcript.final`
- `assistant.state`
- `assistant.text`
- `assistant.audio`
- `assistant.interrupted`
- `pong`
- `error`

## Local Development Assumptions

- `localhost:3000` is correct for iOS Simulator
- a real device would need the Mac host IP, not `localhost`
- backend services should be started with `make local-up` before running the app

Recommended loop:

1. `npm install`
2. `make local-up`
3. run the Xcode project on Simulator
4. use `make local-down` when finished

## Current Known Limitations

- Apple Sign In is still a local mock identity flow, not the system Apple auth sheet
- assistant audio events currently send an empty payload placeholder
- the realtime path is still text-driven (`audio.commit` with text), not real microphone streaming
- `PassengerNamingView` currently stores local presentation state, not backend profile data
