import SwiftUI
import Combine

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var assistantState: AssistantState = .idle
    @Published var partialTranscript = ""
    @Published var messages: [MessageBubble] = []
    @Published var isInterrupted = false
    @Published var connectionStatus = "Connecting..."
    @Published var draftPrompt = ""

    private let profile: UserProfile
    private let session: ChatSession
    private let realtimeClient: RealtimeClient
    private let cannedPrompts = [
        "Tell me something interesting about the Silk Road.",
        "Give me a short history topic for a drive.",
        "Talk to me about Roman roads."
    ]
    private var nextPromptIndex = 0

    // Creates the view model and chooses the realtime transport for the session.
    init(session: ChatSession, profile: UserProfile) {
        self.session = session
        self.profile = profile
        switch session.realtime {
        case .websocket(let wsURL, let token):
            self.realtimeClient = .websocket(RealtimeWebSocketClient(url: wsURL, token: token))
        case .livekit(let livekitURL, let roomName, let participantToken):
            self.realtimeClient = .livekit(
                LiveKitRealtimeClient(
                    livekitURL: livekitURL,
                    roomName: roomName,
                    participantToken: participantToken
                )
            )
        }
    }

    // Connects to the configured realtime transport and wires event handling.
    func connect() async {
        switch realtimeClient {
        case .websocket(let client):
            do {
                try await client.connect { [weak self] event in
                    Task { @MainActor in
                        self?.handle(event: event)
                    }
                }
                connectionStatus = "Connected to backend"
                if case .websocket(let wsURL, _) = session.realtime {
                    print("[WS] Connected:", wsURL.absoluteString)
                }
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
        case .livekit(let client):
            do {
                try await client.connect { [weak self] event in
                    Task { @MainActor in
                        self?.handle(event: event)
                    }
                }
                connectionStatus = "LiveKit connected: \(client.roomName)"
                print("[LiveKit] Connected:", client.roomName)
            } catch {
                connectionStatus = "LiveKit unavailable"
                messages.append(
                    MessageBubble(
                        id: UUID().uuidString,
                        role: .assistant,
                        text: "I could not connect to the LiveKit room."
                    )
                )
                print("[LiveKit] Connect error:", error.localizedDescription)
            }
        }
    }

    // Disconnects from the active realtime transport.
    func disconnect() {
        switch realtimeClient {
        case .websocket(let client):
            client.disconnect()
        case .livekit(let client):
            Task {
                await client.disconnect()
            }
        }
    }

    // Sends typed text or a manual audio commit through the realtime transport.
    func sendPrompt() async {
        guard assistantState == .idle || assistantState == .listening else { return }

        switch realtimeClient {
        case .websocket(let client):
            let prompt = nextPrompt(useFallback: true)
            partialTranscript = prompt

            do {
                try await client.sendAudioCommit(text: prompt)
                print("[WS] Sent audio.commit:", prompt)
            } catch {
                connectionStatus = "Failed to send"
                print("[WS] Send error:", error.localizedDescription)
            }
        case .livekit(let client):
            let prompt = nextPrompt(useFallback: false)
            partialTranscript = prompt.isEmpty ? "Listening..." : prompt

            do {
                try await client.sendAudioCommit(text: prompt)
                connectionStatus = "Sent to LiveKit room: \(client.roomName)"
                print("[LiveKit] Sent audio.commit:", prompt)
            } catch {
                connectionStatus = "Failed to send"
                print("[LiveKit] Send error:", error.localizedDescription)
            }
        }
    }

    // Requests interruption of the assistant while it is speaking.
    func interrupt() {
        guard assistantState == .speaking else { return }
        isInterrupted = true
        switch realtimeClient {
        case .websocket(let client):
            Task {
                try? await client.sendInterrupt()
            }
        case .livekit(let client):
            Task {
                try? await client.sendInterrupt()
            }
        }
    }

    // Returns the primary status copy for the current assistant state.
    var statusText: String {
        switch assistantState {
        case .idle:
            if usesLiveKitRealtime && !connectionStatus.contains("unavailable") && !connectionStatus.contains("Failed") {
                return "Listening hands-free. Speak naturally."
            }
            return connectionStatus == "Connected to backend"
                ? "Tap the mic to send a websocket test event."
                : connectionStatus
        case .listening:
            return "Listening for the end of your utterance."
        case .thinking:
            return "Planning a short response."
        case .speaking:
            return "Speaking. The interrupt button should always be within reach."
        }
    }

    // Returns helper copy for the manual microphone fallback.
    var manualPromptText: String {
        usesLiveKitRealtime
            ? "Hands-free listening is on. Tap the mic only to submit the current audio manually."
            : "Say hello when you're ready."
    }

    // Applies one realtime server event to local chat state.
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

    // Returns typed prompt text or the next websocket fallback prompt.
    private func nextPrompt(useFallback: Bool) -> String {
        let typedPrompt = draftPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if !typedPrompt.isEmpty {
            draftPrompt = ""
            return typedPrompt
        }

        guard useFallback else { return "" }

        let prompt = cannedPrompts[nextPromptIndex % cannedPrompts.count]
        nextPromptIndex += 1
        return prompt
    }

    private enum RealtimeClient {
        case websocket(RealtimeWebSocketClient)
        case livekit(LiveKitRealtimeClient)
    }

    // Returns whether the current session uses LiveKit realtime.
    private var usesLiveKitRealtime: Bool {
        if case .livekit = realtimeClient {
            return true
        }
        return false
    }
}

struct LiveChatView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @StateObject private var chatViewModel: ChatViewModel

    // Creates the live chat view with a session-scoped view model.
    init(session: ChatSession, profile: UserProfile) {
        _chatViewModel = StateObject(wrappedValue: ChatViewModel(session: session, profile: profile))
    }

    // Renders the live chat transcript, controls, and connection lifecycle.
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

                    TextField("Ask your passenger", text: $chatViewModel.draftPrompt)
                        .textInputAutocapitalization(.sentences)
                        .disableAutocorrection(false)
                        .font(.system(size: 16, weight: .medium, design: .rounded))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(Color.white.opacity(0.76))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .submitLabel(.send)
                        .onSubmit {
                            Task {
                                await chatViewModel.sendPrompt()
                            }
                        }

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

                    Text(chatViewModel.manualPromptText)
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
