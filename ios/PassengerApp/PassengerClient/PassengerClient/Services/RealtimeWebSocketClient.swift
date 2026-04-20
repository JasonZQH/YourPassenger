import Foundation

enum RealtimeClientError: LocalizedError {
    case notConnected
    case invalidMessage

    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Realtime socket is not connected."
        case .invalidMessage:
            return "Realtime message could not be decoded."
        }
    }
}

enum RealtimeServerEvent {
    case sessionReady(sessionId: String)
    case transcriptFinal(utteranceId: String, text: String)
    case assistantState(AssistantState)
    case assistantText(messageId: String, text: String)
    case assistantAudio(messageId: String)
    case assistantInterrupted(messageId: String)
    case pong(ts: Int)
    case error(code: String, message: String)
}

final class RealtimeWebSocketClient {
    private let url: URL
    private let token: String
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private var task: URLSessionWebSocketTask?
    private var eventHandler: ((RealtimeServerEvent) -> Void)?

    init(url: URL, token: String, session: URLSession = .shared) {
        self.url = url
        self.token = token
        self.session = session
    }

    func connect(onEvent: @escaping (RealtimeServerEvent) -> Void) async throws {
        var request = URLRequest(url: url)
        if !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let task = session.webSocketTask(with: request)
        self.task = task
        self.eventHandler = onEvent
        task.resume()
        receiveNext()
    }

    func disconnect() {
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
    }

    func sendAudioCommit(text: String) async throws {
        struct AudioCommitRequest: Encodable {
            let type = "audio.commit"
            let text: String
        }

        try await send(AudioCommitRequest(text: text))
    }

    func sendInterrupt() async throws {
        struct InterruptRequest: Encodable {
            let type = "assistant.interrupt"
        }

        try await send(InterruptRequest())
    }

    private func send<Body: Encodable>(_ body: Body) async throws {
        guard let task else {
            throw RealtimeClientError.notConnected
        }

        let data = try encoder.encode(body)
        let text = String(decoding: data, as: UTF8.self)
        try await task.send(.string(text))
    }

    private func receiveNext() {
        task?.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                do {
                    let event = try self.decode(message: message)
                    self.eventHandler?(event)
                    self.receiveNext()
                } catch {
                    print("[WS] Decode error:", error.localizedDescription)
                    self.eventHandler?(.error(code: "DECODE_ERROR", message: error.localizedDescription))
                    self.receiveNext()
                }
            case .failure(let error):
                print("[WS] Receive error:", error.localizedDescription)
                self.eventHandler?(.error(code: "SOCKET_ERROR", message: error.localizedDescription))
            }
        }
    }

    private func decode(message: URLSessionWebSocketTask.Message) throws -> RealtimeServerEvent {
        let data: Data

        switch message {
        case .data(let rawData):
            data = rawData
        case .string(let text):
            data = Data(text.utf8)
        @unknown default:
            throw RealtimeClientError.invalidMessage
        }

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
