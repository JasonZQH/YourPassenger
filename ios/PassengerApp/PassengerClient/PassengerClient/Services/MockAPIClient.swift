import Foundation

final class MockAPIClient: APIClient {
    private var storedProfile: UserProfile?

    // Returns mock bootstrap state after a short simulated delay.
    func bootstrap() async throws -> BootstrapPayload {
        await pause()
        return BootstrapPayload(isAuthenticated: false, profile: storedProfile)
    }

    // Returns mock authenticated state after a short simulated delay.
    func signIn(method: AuthMethod) async throws -> BootstrapPayload {
        await pause()
        return BootstrapPayload(isAuthenticated: true, profile: storedProfile)
    }

    // Stores the mock profile and returns it.
    func saveProfile(_ profile: UserProfile) async throws -> UserProfile {
        await pause()
        storedProfile = profile
        return profile
    }

    // Creates a mock websocket chat session.
    func createSession() async throws -> ChatSession {
        await pause()
        return ChatSession(
            id: UUID().uuidString,
            startedAt: .now,
            realtime: .websocket(
                wsURL: URL(string: "ws://localhost:3000/v1/realtime?sessionId=mock-session")!,
                token: "mock-token"
            )
        )
    }

    // Returns a mock session summary for the provided session id.
    func endSession(id: String) async throws -> SessionSummary {
        await pause()
        return SessionSummary(
            sessionId: id,
            durationMinutes: 18,
            summary: "You explored Roman trade routes, future travel plans, and what makes long solo drives less mentally tiring.",
            topics: ["History", "Travel", "Driving Focus"]
        )
    }

    // Simulates network latency for mock API calls.
    private func pause() async {
        try? await Task.sleep(nanoseconds: 350_000_000)
    }
}
