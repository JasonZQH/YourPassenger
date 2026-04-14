import SwiftUI
import Combine

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var assistantState: AssistantState = .idle
    @Published var partialTranscript = ""
    @Published var messages: [MessageBubble] = []
    @Published var isInterrupted = false

    private let profile: UserProfile
    private let session: ChatSession

    init(session: ChatSession, profile: UserProfile) {
        self.session = session
        self.profile = profile
        self.messages = [
            MessageBubble(
                id: UUID().uuidString,
                role: .assistant,
                text: "Ready when you are, \(profile.nickname)."
            )
        ]
    }

    func simulateTurn() async {
        guard assistantState == .idle else { return }

        isInterrupted = false
        assistantState = .listening
        partialTranscript = "Tell me something interesting about the Silk Road."
        try? await Task.sleep(nanoseconds: 800_000_000)

        messages.append(
            MessageBubble(
                id: UUID().uuidString,
                role: .user,
                text: partialTranscript
            )
        )

        assistantState = .thinking
        try? await Task.sleep(nanoseconds: 900_000_000)

        assistantState = .speaking
        partialTranscript = ""

        let response = "The Silk Road was less one road and more a trading network. Since you like \(profile.interests.first?.title.lowercased() ?? "history"), I would frame it as an exchange of ideas as much as goods."

        messages.append(
            MessageBubble(
                id: UUID().uuidString,
                role: .assistant,
                text: response
            )
        )

        try? await Task.sleep(nanoseconds: 1_000_000_000)

        if !isInterrupted {
            assistantState = .idle
        }
    }

    func interrupt() {
        guard assistantState == .speaking else { return }
        isInterrupted = true
        assistantState = .idle
    }

    var statusText: String {
        switch assistantState {
        case .idle:
            return "Tap the mic to simulate a user utterance."
        case .listening:
            return "Listening for the end of your utterance."
        case .thinking:
            return "Planning a short response."
        case .speaking:
            return "Speaking. The interrupt button should always be within reach."
        }
    }
}

struct LiveChatView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @StateObject private var chatViewModel: ChatViewModel

    init(session: ChatSession, profile: UserProfile) {
        _chatViewModel = StateObject(wrappedValue: ChatViewModel(session: session, profile: profile))
    }

    var body: some View {
        VStack(spacing: 18) {
            HStack {
                PassengerCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(chatViewModel.assistantState.title)
                            .font(.system(size: 22, weight: .bold, design: .rounded))

                        Text(chatViewModel.statusText)
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                            .foregroundStyle(PassengerTheme.secondaryInk)
                    }
                }
            }

            ScrollView(showsIndicators: false) {
                VStack(spacing: 12) {
                    ForEach(chatViewModel.messages) { message in
                        HStack {
                            if message.role == .assistant {
                                Spacer(minLength: 40)
                            }

                            PassengerCard {
                                Text(message.text)
                                    .font(.system(size: 16, weight: .medium, design: .rounded))
                                    .foregroundStyle(PassengerTheme.ink)
                            }
                            .frame(maxWidth: 300, alignment: .leading)

                            if message.role == .user {
                                Spacer(minLength: 40)
                            }
                        }
                    }

                    if !chatViewModel.partialTranscript.isEmpty {
                        PassengerCard {
                            Text(chatViewModel.partialTranscript)
                                .font(.system(size: 16, weight: .medium, design: .rounded))
                                .foregroundStyle(PassengerTheme.secondaryInk)
                        }
                    }
                }
            }

            PassengerCard {
                VStack(spacing: 18) {
                    WaveformView(isAnimating: chatViewModel.assistantState != .idle)
                        .frame(height: 64)

                    Button {
                        Task {
                            await chatViewModel.simulateTurn()
                        }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(chatViewModel.assistantState == .idle ? PassengerTheme.ink : PassengerTheme.accent)
                                .frame(width: 112, height: 112)

                            Image(systemName: "mic.fill")
                                .font(.system(size: 34, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .buttonStyle(.plain)

                    Text("Voice capture plugs in here next. The screen contract already matches the session and realtime API design.")
                        .font(.system(size: 14, weight: .medium, design: .rounded))
                        .foregroundStyle(PassengerTheme.secondaryInk)
                        .multilineTextAlignment(.center)
                }
            }

            HStack(spacing: 12) {
                Button("Interrupt") {
                    chatViewModel.interrupt()
                }
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(PassengerTheme.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(PassengerTheme.accentSoft)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .disabled(chatViewModel.assistantState != .speaking)
                .opacity(chatViewModel.assistantState == .speaking ? 1 : 0.5)

                Button("End") {
                    Task {
                        await appViewModel.endChat()
                    }
                }
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(Color.red.opacity(0.9))
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
        }
        .padding(PassengerTheme.pagePadding)
    }
}
