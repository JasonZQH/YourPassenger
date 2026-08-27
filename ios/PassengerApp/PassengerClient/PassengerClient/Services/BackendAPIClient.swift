import Foundation

enum BackendAPIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpStatus(Int)

    // Describes backend API failures for UI and debug output.
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
        static let mockAppleIdentityTokenKey = "yourpassenger.dev.mockAppleIdentityToken"
        static let baseURL = "http://localhost:3000/v1"
    }

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let dateFormatter = ISO8601DateFormatter()

    // Initializes the backend client with URL session and JSON coders.
    init(session: URLSession = .shared) {
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    // Restores auth state and fetches profile data when a stored token exists.
    func bootstrap() async throws -> BootstrapPayload {
        guard let token = storedToken else {
            return BootstrapPayload(isAuthenticated: false, profile: nil)
        }

        do {
            let me: MeResponse = try await request(path: "/me", token: token)
            let profile: UserProfile? = try await requestOptional(path: "/profile", token: token)
            print("[API] bootstrap:", me.id, me.nickname)
            return BootstrapPayload(isAuthenticated: true, profile: profile)
        } catch BackendAPIError.httpStatus(let status) where status == 401 {
            storedToken = nil
            print("[API] bootstrap: cleared expired token")
            return BootstrapPayload(isAuthenticated: false, profile: nil)
        }
    }

    // Signs in through the backend and stores the returned access token.
    func signIn(method: AuthMethod) async throws -> BootstrapPayload {
        let response: AuthResponse

        switch method {
        case .apple:
            response = try await request(
                path: "/auth/apple",
                method: "POST",
                body: AppleAuthBody(identityToken: mockAppleIdentityToken),
                token: nil
            )
        case .guest:
            response = try await request(path: "/auth/guest", method: "POST", token: nil)
        }

        storedToken = response.accessToken
        let profile: UserProfile? = try await requestOptional(path: "/profile", token: response.accessToken)
        print("[API] signIn:", response.user.id, response.user.nickname)

        return BootstrapPayload(isAuthenticated: true, profile: profile)
    }

    // Saves profile data and reloads the backend's canonical profile.
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

    // Creates a chat session and resolves its realtime connection details.
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

        let startedAt = dateFormatter.date(from: response.session.startedAt) ?? .now
        let realtime = try response.realtime.toRealtimeConnection()
        print("[API] createSession:", response.session.id, response.realtime.transport ?? "websocket")

        return ChatSession(
            id: response.session.id,
            startedAt: startedAt,
            realtime: realtime
        )
    }

    // Ends a chat session and fetches its generated summary.
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

    // Stores the access token in user defaults.
    private var storedToken: String? {
        get { UserDefaults.standard.string(forKey: Constants.tokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: Constants.tokenKey) }
    }

    // Returns a stable development Apple identity token for local sign-in.
    private var mockAppleIdentityToken: String {
        if let stored = UserDefaults.standard.string(forKey: Constants.mockAppleIdentityTokenKey),
           !stored.isEmpty {
            return stored
        }

        let generated = "ios-dev-apple-\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(generated, forKey: Constants.mockAppleIdentityTokenKey)
        return generated
    }

    // Sends a request without a JSON body and decodes the response.
    private func request<Response: Decodable>(
        path: String,
        method: String = "GET",
        token: String? = nil
    ) async throws -> Response {
        try await request(path: path, method: method, body: Optional<EmptyBody>.none, token: token)
    }

    // Sends a JSON request and decodes the response body.
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

    // Sends a GET request that may return null or an empty body.
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

    // Builds a URLRequest with JSON headers and optional bearer auth.
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

    // Validates that a URL response is a successful HTTP response.
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

    // Converts an app profile model into the backend update payload.
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
        let transport: String?
        let wsUrl: String?
        let token: String?
        let livekitUrl: String?
        let roomName: String?
        let participantToken: String?

        // Converts backend realtime transport fields into the app connection enum.
        func toRealtimeConnection() throws -> RealtimeConnection {
            switch transport ?? "websocket" {
            case "websocket":
                guard
                    let wsUrl,
                    let token,
                    let url = URL(string: wsUrl)
                else {
                    throw BackendAPIError.invalidURL
                }

                return .websocket(wsURL: url, token: token)
            case "livekit":
                guard
                    let livekitUrl,
                    let roomName,
                    let participantToken,
                    let url = URL(string: livekitUrl)
                else {
                    throw BackendAPIError.invalidURL
                }

                return .livekit(
                    livekitURL: url,
                    roomName: roomName,
                    participantToken: participantToken
                )
            default:
                throw BackendAPIError.invalidResponse
            }
        }
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
    // Returns UTF-8 text trimmed of surrounding whitespace.
    var trimmingCharactersUTF8: String {
        String(data: self, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
