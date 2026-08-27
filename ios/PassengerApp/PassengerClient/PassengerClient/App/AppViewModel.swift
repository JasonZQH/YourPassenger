import Foundation
import SwiftUI
import Combine

@MainActor
final class AppViewModel: ObservableObject {
    @Published var screen: AppScreen = .launch
    @Published var profile: UserProfile?
    @Published var passengerName: String
    @Published var activeSession: ChatSession?
    @Published var latestSummary: SessionSummary?
    @Published var isBusy = false
    @Published var errorMessage: String?

    private let apiClient: APIClient
    private static let passengerNameStorageKey = "yourpassenger.dev.passengerName"

    // Initializes app state with the API client and stored passenger name.
    init(apiClient: APIClient) {
        self.apiClient = apiClient
        self.passengerName = Self.loadPassengerName()
    }

    // Loads initial auth and profile state from the backend.
    func bootstrap() async {
        errorMessage = nil
        passengerName = Self.loadPassengerName()

        do {
            let bootstrap = try await apiClient.bootstrap()
            profile = bootstrap.profile

            if bootstrap.isAuthenticated {
                screen = bootstrap.profile == nil ? .onboarding : .home
            } else {
                screen = .auth
            }
        } catch {
            errorMessage = "Unable to reach the backend."
            screen = .auth
        }
    }

    // Signs in with the selected auth method and routes to the next screen.
    func signIn(with method: AuthMethod) async {
        isBusy = true
        errorMessage = nil

        do {
            let bootstrap = try await apiClient.signIn(method: method)
            profile = bootstrap.profile
            screen = bootstrap.profile == nil ? .onboarding : .home
        } catch {
            errorMessage = "Unable to sign in with the backend."
        }

        isBusy = false
    }

    // Saves the first profile and moves into passenger naming.
    func completeOnboardingForCreate(with profile: UserProfile) async {
        isBusy = true
        errorMessage = nil

        do {
            self.profile = try await apiClient.saveProfile(profile)
            screen = .passengerNaming
        } catch {
            errorMessage = "Unable to save your profile."
        }

        isBusy = false
    }

    // Saves edits to an existing profile and returns home.
    func saveProfileChanges(with profile: UserProfile) async {
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

    // Stores the chosen passenger name and returns to the home screen.
    func completePassengerNaming(with name: String) {
        let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = normalized.isEmpty ? "Passenger" : normalized

        passengerName = finalName
        UserDefaults.standard.set(finalName, forKey: Self.passengerNameStorageKey)
        screen = .home
    }

    // Opens the profile editing screen.
    func openProfile() {
        screen = .profile
    }

    // Closes profile editing and returns home.
    func closeProfile() {
        screen = .home
    }

    // Starts a new backend chat session and opens live chat.
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

    // Ends the active chat session and opens the summary screen.
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

    // Clears the summary and starts another chat session.
    func startNewChatFromSummary() async {
        latestSummary = nil
        await startChat()
    }

    // Clears transient summary state and returns to home.
    func returnHome() {
        latestSummary = nil
        screen = .home
    }

    // Loads the persisted passenger name with a default fallback.
    private static func loadPassengerName() -> String {
        let value = UserDefaults.standard.string(forKey: passengerNameStorageKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? "Passenger" : value
    }
}
