import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

    // Renders the home screen with profile preview and chat entry point.
    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HStack {
                Spacer()

                AvatarButton(label: avatarLabel) {
                    appViewModel.openProfile()
                }
            }

            Spacer()

            SectionTitle(
                eyebrow: "Ready",
                title: "Start the ride with one tap.",
                subtitle: "The home screen stays sparse on purpose. Everything here should feel immediate."
            )

            PassengerCard {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Hi \(appViewModel.profile?.nickname ?? "there")")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(PassengerTheme.ink)

                    Text("\(appViewModel.passengerName) is tuned for \(interestPreview).")
                        .font(.system(size: 16, weight: .medium, design: .rounded))
                        .foregroundStyle(PassengerTheme.secondaryInk)

                    WaveformView(isAnimating: true)
                        .frame(height: 60)
                }
            }

            PassengerPrimaryButton(title: "Start Chat", isLoading: appViewModel.isBusy) {
                Task {
                    await appViewModel.startChat()
                }
            }

            Spacer()
        }
        .padding(PassengerTheme.pagePadding)
    }

    // Returns the single-letter avatar label from the user's nickname.
    private var avatarLabel: String {
        let nickname = appViewModel.profile?.nickname.trimmingCharacters(in: .whitespacesAndNewlines) ?? "P"
        return String(nickname.prefix(1)).uppercased()
    }

    // Builds a short interests preview for the home screen copy.
    private var interestPreview: String {
        guard let interests = appViewModel.profile?.interests, !interests.isEmpty else {
            return "wide-ranging conversations"
        }

        return interests
            .prefix(3)
            .map { $0.title.lowercased() }
            .joined(separator: ", ")
    }
}
