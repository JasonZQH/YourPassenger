# iOS Client Skeleton

## Design Direction

The local `awesome-design-md` submodule is now available at:

- [references/awesome-design-md](/Users/zqh980802/Desktop/AI/YourPassenger/references/awesome-design-md)

The local markdown files mostly act as entry points to external design pages, so the practical design direction for the MVP is based on the high-level cues from those references:

- Apple: premium white space and clarity
- Uber: strong mobility-oriented primary actions
- Claude: warm AI-oriented editorial tone

For this app, the resulting direction should be:

- light theme first
- warm off-white canvas instead of stark white
- graphite text and surfaces
- a restrained amber accent for AI warmth
- one dominant action on each screen
- large tap targets and low visual clutter

This is a better fit than a dark immersive UI because the MVP is centered on driving-safe readability and fast orientation.

## Screen Stack

1. `AuthView`
2. `OnboardingView`
3. `HomeView`
4. `ProfileView`
5. `LiveChatView`
6. `SessionSummaryView`

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

- Only update files inside `ios/PassengerApp/PassengerClient/PassengerClient`
- Do not keep parallel Swift source files in `ios/PassengerApp` root

## State Strategy

- `AppViewModel` owns root navigation and app-level state
- `MockAPIClient` stands in for NestJS during UI skeleton work
- `ChatViewModel` simulates live conversation states for the voice screen

## Next Build Order

1. Keep the mock client in place until the NestJS auth, profile, and session APIs exist.
2. Replace the mock client with real REST and WebSocket adapters without changing the view layer contracts.
3. Continue all iOS work inside the Xcode project source tree only.
