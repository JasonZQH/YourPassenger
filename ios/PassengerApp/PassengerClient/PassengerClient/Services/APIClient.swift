import Foundation

struct BootstrapPayload {
    let isAuthenticated: Bool
    let profile: UserProfile?
}

protocol APIClient {
    // Loads initial auth and profile state.
    func bootstrap() async throws -> BootstrapPayload
    // Signs in with the selected auth method.
    func signIn(method: AuthMethod) async throws -> BootstrapPayload
    // Saves a user profile and returns the persisted value.
    func saveProfile(_ profile: UserProfile) async throws -> UserProfile
    // Creates a new chat session.
    func createSession() async throws -> ChatSession
    // Ends a chat session and returns its summary.
    func endSession(id: String) async throws -> SessionSummary
}
