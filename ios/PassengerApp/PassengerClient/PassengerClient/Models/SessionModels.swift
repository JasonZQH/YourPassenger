import Foundation

struct ChatSession: Equatable {
    let id: String
    let startedAt: Date
    let realtime: RealtimeConnection
}

enum RealtimeConnection: Equatable {
    case websocket(wsURL: URL, token: String)
    case livekit(livekitURL: URL, roomName: String, participantToken: String)
}

struct SessionSummary: Equatable {
    let sessionId: String
    let durationMinutes: Int
    let summary: String
    let topics: [String]
}

struct MessageBubble: Identifiable, Equatable {
    let id: String
    let role: MessageRole
    let text: String
}

enum MessageRole: Equatable {
    case user
    case assistant
}

enum AssistantState: String, Codable {
    case idle
    case listening
    case thinking
    case speaking

    // Returns display text for the assistant state.
    var title: String {
        rawValue.capitalized
    }
}
