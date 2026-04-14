import Foundation

struct BootstrapPayload {
    let isAuthenticated: Bool
    let profile: UserProfile?
}

protocol APIClient {
    func bootstrap() async -> BootstrapPayload
    func signIn(method: AuthMethod) async -> BootstrapPayload
    func saveProfile(_ profile: UserProfile) async throws -> UserProfile
    func createSession() async throws -> ChatSession
    func endSession(id: String) async throws -> SessionSummary
}
