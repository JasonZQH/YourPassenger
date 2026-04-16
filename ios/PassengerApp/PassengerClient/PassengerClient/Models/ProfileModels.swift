import Foundation

struct UserProfile: Equatable, Codable {
    var nickname: String
    var interests: Set<InterestTag>
    var ageRange: AgeRange
    var gender: GenderIdentity
    var occupationCategory: OccupationCategory
    var hobbyTags: Set<HobbyTag>
    var preferredLanguage: String
    var conversationStyle: ConversationStyle
    var responseLength: ResponseLength
    var proactiveTopicPushing: Bool
    var avoidTopicTags: Set<AvoidTopicTag>

    static let empty = UserProfile(
        nickname: "",
        interests: [.history, .travel],
        ageRange: .twentyFiveToThirtyFour,
        gender: .preferNotToSay,
        occupationCategory: .tech,
        hobbyTags: [.reading, .podcasts],
        preferredLanguage: "en",
        conversationStyle: .curious,
        responseLength: .short,
        proactiveTopicPushing: true,
        avoidTopicTags: []
    )
}

enum InterestTag: String, CaseIterable, Identifiable, Codable {
    case history
    case internationalNews = "international_news"
    case sports
    case travel
    case gaming
    case technology
    case finance
    case movies
    case music

    var id: String { rawValue }

    var title: String {
        switch self {
        case .internationalNews:
            return "International News"
        default:
            return rawValue.capitalized
        }
    }
}

enum AgeRange: String, CaseIterable, Identifiable, Codable {
    case under18 = "under_18"
    case eighteenToTwentyFour = "18_24"
    case twentyFiveToThirtyFour = "25_34"
    case thirtyFiveToFortyFour = "35_44"
    case fortyFiveToFiftyFour = "45_54"
    case fiftyFivePlus = "55_plus"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .under18: return "Under 18"
        case .eighteenToTwentyFour: return "18-24"
        case .twentyFiveToThirtyFour: return "25-34"
        case .thirtyFiveToFortyFour: return "35-44"
        case .fortyFiveToFiftyFour: return "45-54"
        case .fiftyFivePlus: return "55+"
        }
    }
}

enum GenderIdentity: String, CaseIterable, Identifiable, Codable {
    case female
    case male
    case nonbinary
    case preferNotToSay = "prefer_not_to_say"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .nonbinary:
            return "Nonbinary"
        case .preferNotToSay:
            return "Prefer Not To Say"
        default:
            return rawValue.capitalized
        }
    }
}

enum OccupationCategory: String, CaseIterable, Identifiable, Codable {
    case student
    case tech
    case finance
    case healthcare
    case education
    case creative
    case business
    case service
    case logistics
    case other

    var id: String { rawValue }

    var title: String {
        rawValue.capitalized
    }
}

enum HobbyTag: String, CaseIterable, Identifiable, Codable {
    case reading
    case fitness
    case cooking
    case photography
    case music
    case movies
    case hiking
    case cars
    case podcasts
    case design

    var id: String { rawValue }

    var title: String {
        rawValue.capitalized
    }
}

enum ConversationStyle: String, CaseIterable, Identifiable, Codable {
    case relaxed
    case curious
    case analytical

    var id: String { rawValue }

    var title: String {
        rawValue.capitalized
    }
}

enum ResponseLength: String, CaseIterable, Identifiable, Codable {
    case short
    case medium

    var id: String { rawValue }

    var title: String {
        rawValue.capitalized
    }
}

enum AvoidTopicTag: String, CaseIterable, Identifiable, Codable {
    case politics
    case religion
    case graphicViolence = "graphic_violence"
    case personalFinance = "personal_finance"
    case dating

    var id: String { rawValue }

    var title: String {
        switch self {
        case .graphicViolence:
            return "Graphic Violence"
        case .personalFinance:
            return "Personal Finance"
        default:
            return rawValue.capitalized
        }
    }
}
