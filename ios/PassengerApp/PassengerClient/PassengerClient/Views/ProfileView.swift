import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var appViewModel: AppViewModel

    // Renders profile editing with a simple back affordance.
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
