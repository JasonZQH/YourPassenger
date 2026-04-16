import SwiftUI
import Combine

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var assistantState: AssistantState = .idle
    @Published var partialTranscript = ""
    @Published var messages: [MessageBubble] = []
    @Published var isInterrupted = false
    @Published var connectionStatus = "Connecting..."

    private let profile: UserProfile
    private let session: ChatSession
    private let realtimeClient: RealtimeWebSocketClient
    private let cannedPrompts = [
        "Tell me something interesting about the Silk Road.",
        "Give me a short history topic for a drive.",
        "Talk to me about Roman roads."
    ]
    private var nextPromptIndex = 0

    init(session: ChatSession, profile: UserProfile) {
        self.session = session
        self.profile = profile
        self.realtimeClient = RealtimeWebSocketClient(url: session.wsURL, token: session.realtimeToken)
    }

    func connect() async {
        do {
            try await realtimeClient.connect { [weak self] event in
                Task { @MainActor in
                    self?.handle(event: event)
                }
            }
            connectionStatus = "Connected to backend"
            print("[WS] Connected:", session.wsURL.absoluteString)
        } catch {
            connectionStatus = "Realtime unavailable"
            messages.append(
                MessageBubble(
                    id: UUID().uuidString,
                    role: .assistant,
                    text: "I could not connect to the realtime service."
                )
            )
            print("[WS] Connect error:", error.localizedDescription)
        }
    }

    func disconnect() {
        realtimeClient.disconnect()
    }

    func sendPrompt() async {
        guard assistantState == .idle || assistantState == .listening else { return }

        let prompt = cannedPrompts[nextPromptIndex % cannedPrompts.count]
        nextPromptIndex += 1
        partialTranscript = prompt

        do {
            try await realtimeClient.sendAudioCommit(text: prompt)
            print("[WS] Sent audio.commit:", prompt)
        } catch {
            connectionStatus = "Failed to send"
            print("[WS] Send error:", error.localizedDescription)
        }
    }

    func interrupt() {
        guard assistantState == .speaking else { return }
        isInterrupted = true
        Task {
            try? await realtimeClient.sendInterrupt()
        }
    }

    var statusText: String {
        switch assistantState {
        case .idle:
            return connectionStatus == "Connected to backend"
                ? "Tap the mic to send a real websocket event."
                : connectionStatus
        case .listening:
            return "Listening for the end of your utterance."
        case .thinking:
            return "Planning a short response."
        case .speaking:
            return "Speaking. The interrupt button should always be within reach."
        }
    }

    private func handle(event: RealtimeServerEvent) {
        switch event {
        case .sessionReady(let sessionId):
            connectionStatus = "Session ready: \(sessionId)"
        case .transcriptFinal(_, let text):
            partialTranscript = ""
            messages.append(
                MessageBubble(
                    id: UUID().uuidString,
                    role: .user,
                    text: text
                )
            )
        case .assistantState(let state):
            assistantState = state
        case .assistantText(_, let text):
            messages.append(
                MessageBubble(
                    id: UUID().uuidString,
                    role: .assistant,
                    text: text
                )
            )
        case .assistantAudio:
            break
        case .assistantInterrupted:
            assistantState = .idle
        case .pong:
            break
        case .error(let code, let message):
            connectionStatus = "\(code): \(message)"
            print("[WS] Server error:", code, message)
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
                            await chatViewModel.sendPrompt()
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
        .task {
            await chatViewModel.connect()
        }
        .onDisappear {
            chatViewModel.disconnect()
        }
    }
}
