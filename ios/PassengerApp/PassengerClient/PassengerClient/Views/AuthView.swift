import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Spacer()

            SectionTitle(
                eyebrow: "AI Passenger",
                title: "A calm voice for the road.",
                subtitle: "Start with a lightweight profile so the assistant already knows how to talk with you."
            )

            PassengerCard {
                VStack(alignment: .leading, spacing: 14) {
                    Text("No real name required.")
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                        .foregroundStyle(PassengerTheme.ink)

                    Text("You only choose a nickname the assistant can use while talking to you.")
                        .font(.system(size: 15, weight: .medium, design: .rounded))
                        .foregroundStyle(PassengerTheme.secondaryInk)
                }
            }

            Spacer()

            VStack(spacing: 14) {
                PassengerPrimaryButton(title: "Continue with Apple", isLoading: appViewModel.isBusy) {
                    Task {
                        await appViewModel.signIn(with: .apple)
                    }
                }

                Button("Continue as Guest") {
                    Task {
                        await appViewModel.signIn(with: .guest)
                    }
                }
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(PassengerTheme.secondaryInk)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
        }
        .padding(PassengerTheme.pagePadding)
    }
}
