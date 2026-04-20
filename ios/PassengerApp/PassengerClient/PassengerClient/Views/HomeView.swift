import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

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

    private var avatarLabel: String {
        let nickname = appViewModel.profile?.nickname.trimmingCharacters(in: .whitespacesAndNewlines) ?? "P"
        return String(nickname.prefix(1)).uppercased()
    }

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
