import SwiftUI

struct PassengerNamingView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @State private var draftName = ""
    @State private var didAppear = false

    private let suggestions = [
        "Nova",
        "Atlas",
        "Echo",
        "Skye",
        "Milo",
        "Lumi"
    ]

    // Renders the passenger naming step and suggestion chips.
    var body: some View {
        ZStack {
            PassengerTheme.canvas
                .ignoresSafeArea()

            backgroundGlow
                .opacity(didAppear ? 1 : 0)
                .animation(.easeOut(duration: 0.6), value: didAppear)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    SectionTitle(
                        eyebrow: "Final Step",
                        title: "Name your passenger.",
                        subtitle: "Give your AI companion a name. This is what the app will call itself while talking to you."
                    )
                    .opacity(didAppear ? 1 : 0)
                    .offset(y: didAppear ? 0 : 14)
                    .animation(.spring(response: 0.45, dampingFraction: 0.85), value: didAppear)

                    PassengerCard {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Passenger Name")
                                .font(.system(size: 17, weight: .semibold, design: .rounded))

                            TextField("e.g. Nova", text: $draftName)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                                .padding(14)
                                .background(PassengerTheme.canvas)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                            Text("Preview: \"\(previewLine)\"")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundStyle(PassengerTheme.secondaryInk)
                        }
                    }
                    .opacity(didAppear ? 1 : 0)
                    .offset(y: didAppear ? 0 : 18)
                    .animation(.spring(response: 0.48, dampingFraction: 0.88).delay(0.04), value: didAppear)

                    PassengerCard {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Quick Suggestions")
                                .font(.system(size: 17, weight: .semibold, design: .rounded))

                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 10)], spacing: 10) {
                                ForEach(suggestions, id: \.self) { suggestion in
                                    TagChip(title: suggestion, isSelected: normalizedName == suggestion) {
                                        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                                            draftName = suggestion
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .opacity(didAppear ? 1 : 0)
                    .offset(y: didAppear ? 0 : 22)
                    .animation(.spring(response: 0.5, dampingFraction: 0.88).delay(0.08), value: didAppear)

                    PassengerPrimaryButton(title: "Finish Setup", isLoading: false) {
                        appViewModel.completePassengerNaming(with: normalizedName)
                    }
                    .opacity(didAppear ? 1 : 0)
                    .offset(y: didAppear ? 0 : 24)
                    .animation(.spring(response: 0.52, dampingFraction: 0.9).delay(0.12), value: didAppear)
                }
                .padding(PassengerTheme.pagePadding)
            }
        }
        .onAppear {
            if draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                draftName = appViewModel.passengerName
            }

            withAnimation {
                didAppear = true
            }
        }
    }

    // Returns the trimmed draft passenger name.
    private var normalizedName: String {
        draftName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Builds the live preview line for the chosen passenger name.
    private var previewLine: String {
        let name = normalizedName.isEmpty ? "Passenger" : normalizedName
        return "Hey, I am \(name). Want to talk about your next ride?"
    }

    // Renders the animated background accent for the naming screen.
    private var backgroundGlow: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [PassengerTheme.accentSoft.opacity(0.75), .clear],
                        center: .center,
                        startRadius: 30,
                        endRadius: 210
                    )
                )
                .frame(width: 320, height: 320)
                .offset(x: 140, y: -260)
                .scaleEffect(didAppear ? 1 : 0.86)
                .animation(.easeOut(duration: 0.8), value: didAppear)
        }
    }
}
