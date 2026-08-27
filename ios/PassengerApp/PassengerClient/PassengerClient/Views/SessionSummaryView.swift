import SwiftUI

struct SessionSummaryView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    let summary: SessionSummary

    // Renders the session summary and follow-up actions.
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer()

            SectionTitle(
                eyebrow: "Session Saved",
                title: "A short wrap before you go.",
                subtitle: "This screen is intentionally light. It should help continuity without feeling like work."
            )

            PassengerCard {
                VStack(alignment: .leading, spacing: 14) {
                    Text(summary.summary)
                        .font(.system(size: 18, weight: .medium, design: .rounded))
                        .foregroundStyle(PassengerTheme.ink)

                    Text("\(summary.durationMinutes) min")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(PassengerTheme.secondaryInk)
                }
            }

            PassengerCard {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Topics")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(PassengerTheme.ink)

                    FlowingTopicsView(topics: summary.topics)
                }
            }

            Spacer()

            VStack(spacing: 12) {
                PassengerPrimaryButton(title: "Start New Session", isLoading: appViewModel.isBusy) {
                    Task {
                        await appViewModel.startNewChatFromSummary()
                    }
                }

                Button("Back Home") {
                    appViewModel.returnHome()
                }
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(PassengerTheme.secondaryInk)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            }
        }
        .padding(PassengerTheme.pagePadding)
    }
}

struct FlowingTopicsView: View {
    let topics: [String]

    // Renders summary topics as adaptive chips.
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], alignment: .leading, spacing: 10) {
            ForEach(topics, id: \.self) { topic in
                Text(topic)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(PassengerTheme.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(PassengerTheme.canvas)
                    .clipShape(Capsule())
            }
        }
    }
}
