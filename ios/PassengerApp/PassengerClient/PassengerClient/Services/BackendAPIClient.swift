import Foundation

enum BackendAPIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpStatus(Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Backend URL is invalid."
        case .invalidResponse:
            return "Backend returned an invalid response."
        case .httpStatus(let status):
            return "Backend returned HTTP \(status)."
        }
    }
}

final class BackendAPIClient: APIClient {
    private enum Constants {
        static let tokenKey = "yourpassenger.dev.accessToken"
        static let baseURL = "http://localhost:3000/v1"
    }

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let dateFormatter = ISO8601DateFormatter()

    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func bootstrap() async throws -> BootstrapPayload {
        // MVP rule: always land on auth first, regardless of any stored token.
        print("[API] bootstrap: force auth screen for MVP")
        return BootstrapPayload(isAuthenticated: false, profile: nil)
    }

    func signIn(method: AuthMethod) async throws -> BootstrapPayload {
        // MVP rule: do not validate credentials yet; login button always proceeds.
        // Keep a local token so downstream APIs can run as usual.
        storedToken = "dev-local-token"

        let profile: UserProfile?
        do {
            profile = try await requestOptional(path: "/profile", token: storedToken)
        } catch {
            // Profile fetch failure should not block login during MVP.
            print("[API] signIn: profile fetch skipped due error:", error.localizedDescription)
            profile = nil
        }

        switch method {
        case .apple:
            print("[API] signIn bypass: apple")
        case .guest:
            print("[API] signIn bypass: guest")
        }

        return BootstrapPayload(isAuthenticated: true, profile: profile)
    }

    func saveProfile(_ profile: UserProfile) async throws -> UserProfile {
        guard let token = storedToken else {
            throw BackendAPIError.invalidResponse
        }

        let payload = UpdateProfileRequest(from: profile)
        let _: UpdateProfileResponse = try await request(
            path: "/profile",
            method: "PUT",
            body: payload,
            token: token
        )

        let saved: UserProfile? = try await requestOptional(path: "/profile", token: token)
        guard let saved else {
            throw BackendAPIError.invalidResponse
        }

        print("[API] saveProfile:", saved.nickname)
        return saved
    }

    func createSession() async throws -> ChatSession {
        guard let token = storedToken else {
            throw BackendAPIError.invalidResponse
        }

        let response: CreateSessionResponse = try await request(
            path: "/sessions",
            method: "POST",
            body: CreateSessionRequest(source: "manual_start"),
            token: token
        )

        guard let wsURL = URL(string: response.realtime.wsUrl) else {
            throw BackendAPIError.invalidURL
        }

        let startedAt = dateFormatter.date(from: response.session.startedAt) ?? .now
        print("[API] createSession:", response.session.id, response.realtime.wsUrl)

        return ChatSession(
            id: response.session.id,
            startedAt: startedAt,
            wsURL: wsURL,
            realtimeToken: response.realtime.token
        )
    }

    func endSession(id: String) async throws -> SessionSummary {
        guard let token = storedToken else {
            throw BackendAPIError.invalidResponse
        }

        let _: EndSessionResponse = try await request(
            path: "/sessions/\(id)/end",
            method: "POST",
            body: EndSessionRequest(reason: "manual_end"),
            token: token
        )

        let summary: SummaryResponse = try await request(path: "/sessions/\(id)/summary", token: token)
        print("[API] endSession summary:", summary.sessionId)

        return SessionSummary(
            sessionId: summary.sessionId,
            durationMinutes: max(1, summary.durationSeconds / 60),
            summary: summary.summary,
            topics: summary.topics
        )
    }

    private var storedToken: String? {
        get { UserDefaults.standard.string(forKey: Constants.tokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: Constants.tokenKey) }
    }

    private func request<Response: Decodable>(
        path: String,
        method: String = "GET",
        token: String? = nil
    ) async throws -> Response {
        try await request(path: path, method: method, body: Optional<EmptyBody>.none, token: token)
    }

    private func request<Body: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Body?,
        token: String?
    ) async throws -> Response {
        let request = try makeRequest(path: path, method: method, body: body, token: token)
        let (data, response) = try await session.data(for: request)
        try validate(response: response)
        let decoded = try decoder.decode(Response.self, from: data)
        print("[API]", method, path, String(data: data, encoding: .utf8) ?? "<binary>")
        return decoded
    }

    private func requestOptional<Response: Decodable>(
        path: String,
        token: String?
    ) async throws -> Response? {
        let request = try makeRequest(path: path, method: "GET", body: Optional<EmptyBody>.none, token: token)
        let (data, response) = try await session.data(for: request)
        try validate(response: response)

        let payload = data.trimmingCharactersUTF8

        // Backend may return either explicit "null" or an empty body when profile is missing.
        if payload.isEmpty || payload == "null" {
            print("[API] GET", path, payload.isEmpty ? "<empty>" : "null")
            return nil
        }

        let decoded = try decoder.decode(Response.self, from: data)
        print("[API] GET", path, String(data: data, encoding: .utf8) ?? "<binary>")
        return decoded
    }

    private func makeRequest<Body: Encodable>(
        path: String,
        method: String,
        body: Body?,
        token: String?
    ) throws -> URLRequest {
        guard let url = URL(string: Constants.baseURL + path) else {
            throw BackendAPIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try encoder.encode(body)
        }

        return request
    }

    private func validate(response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw BackendAPIError.invalidResponse
        }

        guard (200...299).contains(http.statusCode) else {
            throw BackendAPIError.httpStatus(http.statusCode)
        }
    }
}

private struct EmptyBody: Encodable {}

private struct AppleAuthBody: Encodable {
    let identityToken: String
}

private struct AuthResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let user: MeResponse
}

private struct MeResponse: Decodable {
    let id: String
    let nickname: String
    let profileCompleted: Bool
}

private struct UpdateProfileRequest: Encodable {
    let nickname: String
    let interests: [InterestTag]
    let ageRange: AgeRange
    let gender: GenderIdentity
    let occupationCategory: OccupationCategory
    let hobbyTags: [HobbyTag]
    let preferredLanguage: String
    let conversationStyle: ConversationStyle
    let responseLength: ResponseLength
    let proactiveTopicPushing: Bool
    let avoidTopicTags: [AvoidTopicTag]

    init(from profile: UserProfile) {
        self.nickname = profile.nickname
        self.interests = Array(profile.interests)
        self.ageRange = profile.ageRange
        self.gender = profile.gender
        self.occupationCategory = profile.occupationCategory
        self.hobbyTags = Array(profile.hobbyTags)
        self.preferredLanguage = profile.preferredLanguage
        self.conversationStyle = profile.conversationStyle
        self.responseLength = profile.responseLength
        self.proactiveTopicPushing = profile.proactiveTopicPushing
        self.avoidTopicTags = Array(profile.avoidTopicTags)
    }
}

private struct UpdateProfileResponse: Decodable {
    let success: Bool
    let profileCompleted: Bool
}

private struct CreateSessionRequest: Encodable {
    let source: String
}

private struct CreateSessionResponse: Decodable {
    struct SessionNode: Decodable {
        let id: String
        let status: String
        let startedAt: String
    }

    struct RealtimeNode: Decodable {
        let wsUrl: String
        let token: String
    }

    let session: SessionNode
    let realtime: RealtimeNode
}

private struct EndSessionRequest: Encodable {
    let reason: String
}

private struct EndSessionResponse: Decodable {
    let id: String
    let status: String
    let endedAt: String
}

private struct SummaryResponse: Decodable {
    let sessionId: String
    let durationSeconds: Int
    let summary: String
    let topics: [String]
}

private extension Data {
    var trimmingCharactersUTF8: String {
        String(data: self, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
