import Foundation

struct ChatSession: Equatable {
    let id: String
    let startedAt: Date
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

enum AssistantState: String {
    case idle
    case listening
    case thinking
    case speaking

    var title: String {
        rawValue.capitalized
    }
}
