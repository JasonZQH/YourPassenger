import Foundation
import LiveKit

enum LiveKitRealtimeClientError: LocalizedError {
    case notConnected

    // Describes LiveKit realtime client failures for UI and debug output.
    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "LiveKit room is not connected."
        }
    }
}

@MainActor
final class LiveKitRealtimeClient {
    let roomName: String

    private let livekitURL: URL
    private let participantToken: String
    private let room = Room()
    private lazy var eventBridge = LiveKitRoomEventBridge { [weak self] data, topic in
        guard let client = self else { return }
        Task { @MainActor [weak client] in
            client?.handleData(data, topic: topic)
        }
    }
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private(set) var isConnected = false
    private var eventHandler: ((RealtimeServerEvent) -> Void)?
    private var didAttachDelegate = false

    // Initializes a LiveKit realtime client with room connection credentials.
    init(livekitURL: URL, roomName: String, participantToken: String) {
        self.livekitURL = livekitURL
        self.roomName = roomName
        self.participantToken = participantToken
    }

    // Joins the LiveKit room, publishes the microphone, and starts event handling.
    func connect(onEvent: @escaping (RealtimeServerEvent) -> Void) async throws {
        guard !isConnected else { return }

        eventHandler = onEvent
        if !didAttachDelegate {
            room.add(delegate: eventBridge)
            didAttachDelegate = true
        }

        try await room.connect(
            url: livekitURL.absoluteString,
            token: participantToken
        )
        do {
            try await room.localParticipant.setMicrophone(enabled: true)
        } catch {
            print("[LiveKit] Microphone publish failed:", error.localizedDescription)
        }
        isConnected = true
    }

    // Leaves the LiveKit room and disables microphone publication.
    func disconnect() async {
        guard isConnected else { return }

        _ = try? await room.localParticipant.setMicrophone(enabled: false)
        await room.disconnect()
        isConnected = false
    }

    // Sends a manual audio commit event over LiveKit data.
    func sendAudioCommit(text: String) async throws {
        struct AudioCommitRequest: Encodable {
            let type = "audio.commit"
            let text: String
        }

        try await publish(AudioCommitRequest(text: text))
    }

    // Sends an interrupt request for current assistant speech.
    func sendInterrupt() async throws {
        struct InterruptRequest: Encodable {
            let type = "assistant.interrupt"
        }

        try await publish(InterruptRequest())
    }

    // Publishes a typed realtime client event over LiveKit data.
    private func publish<Body: Encodable>(_ body: Body) async throws {
        guard isConnected else {
            throw LiveKitRealtimeClientError.notConnected
        }

        let data = try encoder.encode(body)
        try await room.localParticipant.publish(
            data: data,
            options: DataPublishOptions(topic: "realtime.client", reliable: true)
        )
    }

    // Handles incoming LiveKit data messages from the server topic.
    private func handleData(_ data: Data, topic: String) {
        guard topic == "realtime.server" else { return }

        do {
            eventHandler?(try decodeServerEvent(data: data))
        } catch {
            print("[LiveKit] Decode error:", error.localizedDescription)
            eventHandler?(.error(code: "DECODE_ERROR", message: error.localizedDescription))
        }
    }

    // Decodes a LiveKit data payload into a typed realtime server event.
    private func decodeServerEvent(data: Data) throws -> RealtimeServerEvent {
        let envelope = try decoder.decode(EventEnvelope.self, from: data)

        switch envelope.type {
        case "session.ready":
            let payload = try decoder.decode(SessionReadyPayload.self, from: data)
            return .sessionReady(sessionId: payload.sessionId)
        case "transcript.final":
            let payload = try decoder.decode(TranscriptFinalPayload.self, from: data)
            return .transcriptFinal(utteranceId: payload.utteranceId, text: payload.text)
        case "assistant.state":
            let payload = try decoder.decode(AssistantStatePayload.self, from: data)
            return .assistantState(payload.state)
        case "assistant.text":
            let payload = try decoder.decode(AssistantTextPayload.self, from: data)
            return .assistantText(messageId: payload.messageId, text: payload.text)
        case "assistant.audio":
            let payload = try decoder.decode(AssistantAudioPayload.self, from: data)
            return .assistantAudio(messageId: payload.messageId)
        case "assistant.interrupted":
            let payload = try decoder.decode(AssistantInterruptedPayload.self, from: data)
            return .assistantInterrupted(messageId: payload.messageId)
        case "pong":
            let payload = try decoder.decode(PongPayload.self, from: data)
            return .pong(ts: payload.ts)
        case "error":
            let payload = try decoder.decode(ErrorPayload.self, from: data)
            return .error(code: payload.code, message: payload.message)
        default:
            throw RealtimeClientError.invalidMessage
        }
    }
}

private final class LiveKitRoomEventBridge: NSObject, RoomDelegate, @unchecked Sendable {
    private let onData: @Sendable (Data, String) -> Void

    // Stores the callback used to forward LiveKit data messages.
    init(onData: @escaping @Sendable (Data, String) -> Void) {
        self.onData = onData
    }

    // Forwards LiveKit room data messages to the client callback.
    func room(
        _ room: Room,
        participant: RemoteParticipant?,
        didReceiveData data: Data,
        forTopic topic: String,
        encryptionType: EncryptionType
    ) {
        onData(data, topic)
    }
}

private struct EventEnvelope: Decodable {
    let type: String
}

private struct SessionReadyPayload: Decodable {
    let type: String
    let sessionId: String
}

private struct TranscriptFinalPayload: Decodable {
    let type: String
    let utteranceId: String
    let text: String
}

private struct AssistantStatePayload: Decodable {
    let type: String
    let state: AssistantState
}

private struct AssistantTextPayload: Decodable {
    let type: String
    let messageId: String
    let text: String
}

private struct AssistantAudioPayload: Decodable {
    let type: String
    let messageId: String
}

private struct AssistantInterruptedPayload: Decodable {
    let type: String
    let messageId: String
}

private struct PongPayload: Decodable {
    let type: String
    let ts: Int
}

private struct ErrorPayload: Decodable {
    let type: String
    let code: String
    let message: String
}
