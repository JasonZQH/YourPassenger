import Foundation
import SwiftUI
import Combine

@MainActor
final class AppViewModel: ObservableObject {
    @Published var screen: AppScreen = .launch
    @Published var profile: UserProfile?
    @Published var activeSession: ChatSession?
    @Published var latestSummary: SessionSummary?
    @Published var isBusy = false
    @Published var errorMessage: String?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func bootstrap() async {
        let bootstrap = await apiClient.bootstrap()
        profile = bootstrap.profile

        if bootstrap.isAuthenticated {
            screen = bootstrap.profile == nil ? .onboarding : .home
        } else {
            screen = .auth
        }
    }

    func signIn(with method: AuthMethod) async {
        isBusy = true
        errorMessage = nil

        let bootstrap = await apiClient.signIn(method: method)
        profile = bootstrap.profile
        screen = bootstrap.profile == nil ? .onboarding : .home

        isBusy = false
    }

    func completeOnboarding(with profile: UserProfile) async {
        isBusy = true
        errorMessage = nil

        do {
            self.profile = try await apiClient.saveProfile(profile)
            screen = .home
        } catch {
            errorMessage = "Unable to save your profile."
        }

        isBusy = false
    }

    func openProfile() {
        screen = .profile
    }

    func closeProfile() {
        screen = .home
    }

    func startChat() async {
        isBusy = true
        errorMessage = nil

        do {
            activeSession = try await apiClient.createSession()
            screen = .chat
        } catch {
            errorMessage = "Unable to start a session."
        }

        isBusy = false
    }

    func endChat() async {
        guard let activeSession else { return }

        isBusy = true
        errorMessage = nil

        do {
            latestSummary = try await apiClient.endSession(id: activeSession.id)
            self.activeSession = nil
            screen = .summary
        } catch {
            errorMessage = "Unable to end the session."
        }

        isBusy = false
    }

    func startNewChatFromSummary() async {
        latestSummary = nil
        await startChat()
    }

    func returnHome() {
        latestSummary = nil
        screen = .home
    }
}
