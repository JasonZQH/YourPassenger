import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Back") {
                    appViewModel.closeProfile()
                }
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(PassengerTheme.secondaryInk)

                Spacer()
            }
            .padding(.horizontal, PassengerTheme.pagePadding)
            .padding(.top, 18)

            OnboardingView(mode: .edit)
        }
    }
}
