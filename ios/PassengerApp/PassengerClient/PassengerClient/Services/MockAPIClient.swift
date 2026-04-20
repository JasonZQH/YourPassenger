import Foundation

final class MockAPIClient: APIClient {
    private var storedProfile: UserProfile?

    func bootstrap() async throws -> BootstrapPayload {
        await pause()
        return BootstrapPayload(isAuthenticated: false, profile: storedProfile)
    }

    func signIn(method: AuthMethod) async throws -> BootstrapPayload {
        await pause()
        return BootstrapPayload(isAuthenticated: true, profile: storedProfile)
    }

    func saveProfile(_ profile: UserProfile) async throws -> UserProfile {
        await pause()
        storedProfile = profile
        return profile
    }

    func createSession() async throws -> ChatSession {
        await pause()
        return ChatSession(
            id: UUID().uuidString,
            startedAt: .now,
            wsURL: URL(string: "ws://localhost:3000/v1/realtime?sessionId=mock-session")!,
            realtimeToken: "mock-token"
        )
    }

    func endSession(id: String) async throws -> SessionSummary {
        await pause()
        return SessionSummary(
            sessionId: id,
            durationMinutes: 18,
            summary: "You explored Roman trade routes, future travel plans, and what makes long solo drives less mentally tiring.",
            topics: ["History", "Travel", "Driving Focus"]
        )
    }

    private func pause() async {
        try? await Task.sleep(nanoseconds: 350_000_000)
    }
}
