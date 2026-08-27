import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

    // Renders the root screen switcher and shared error alert.
    var body: some View {
        ZStack {
            PassengerTheme.canvas
                .ignoresSafeArea()

            switch appViewModel.screen {
            case .launch:
                ProgressView()
                    .tint(PassengerTheme.ink)
            case .auth:
                AuthView()
            case .onboarding:
                OnboardingView(mode: .create)
            case .passengerNaming:
                PassengerNamingView()
            case .home:
                HomeView()
            case .profile:
                ProfileView()
            case .chat:
                if let session = appViewModel.activeSession, let profile = appViewModel.profile {
                    LiveChatView(session: session, profile: profile)
                }
            case .summary:
                if let summary = appViewModel.latestSummary {
                    SessionSummaryView(summary: summary)
                }
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.88), value: appViewModel.screen)
        .alert("Error", isPresented: Binding(
            get: { appViewModel.errorMessage != nil },
            set: { _ in appViewModel.errorMessage = nil }
        )) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(appViewModel.errorMessage ?? "")
        }
    }
}
