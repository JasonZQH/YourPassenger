import Foundation

struct BootstrapPayload {
    let isAuthenticated: Bool
    let profile: UserProfile?
}

protocol APIClient {
    func bootstrap() async throws -> BootstrapPayload
    func signIn(method: AuthMethod) async throws -> BootstrapPayload
    func saveProfile(_ profile: UserProfile) async throws -> UserProfile
    func createSession() async throws -> ChatSession
    func endSession(id: String) async throws -> SessionSummary
}
