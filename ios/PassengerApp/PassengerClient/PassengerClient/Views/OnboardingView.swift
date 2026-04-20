import SwiftUI

enum OnboardingMode {
    case create
    case edit

    var title: String {
        switch self {
        case .create:
            return "Tune your passenger."
        case .edit:
            return "Update your profile."
        }
    }

    var subtitle: String {
        switch self {
        case .create:
            return "Pick a nickname and a few preferences. Everything else should be one tap."
        case .edit:
            return "Adjust how the assistant talks and what it should lean toward."
        }
    }
}

struct OnboardingView: View {
    @EnvironmentObject private var appViewModel: AppViewModel
    @State private var draft: UserProfile = .empty

    let mode: OnboardingMode

    private let grid = [GridItem(.adaptive(minimum: 120), spacing: 10)]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                SectionTitle(
                    eyebrow: mode == .create ? "Setup" : "Profile",
                    title: mode.title,
                    subtitle: mode.subtitle
                )

                PassengerCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Nickname")
                            .font(.system(size: 16, weight: .semibold, design: .rounded))

                        TextField("What should the AI call you?", text: $draft.nickname)
                            .padding(14)
                            .background(PassengerTheme.canvas)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }

                chipSection(title: "Interests", items: InterestTag.allCases, selection: draft.interests, toggle: toggle)
                pickerSection(title: "Age Range", selection: $draft.ageRange)
                pickerSection(title: "Gender", selection: $draft.gender)
                pickerSection(title: "Occupation", selection: $draft.occupationCategory)
                chipSection(title: "Hobbies", items: HobbyTag.allCases, selection: draft.hobbyTags, toggle: toggle)

                PassengerCard {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Conversation Style")
                            .font(.system(size: 18, weight: .semibold, design: .rounded))

                        Picker("Conversation Style", selection: $draft.conversationStyle) {
                            ForEach(ConversationStyle.allCases) { style in
                                Text(style.title).tag(style)
                            }
                        }
                        .pickerStyle(.segmented)

                        Picker("Response Length", selection: $draft.responseLength) {
                            ForEach(ResponseLength.allCases) { length in
                                Text(length.title).tag(length)
                            }
                        }
                        .pickerStyle(.segmented)

                        Toggle("Let the AI proactively suggest topics", isOn: $draft.proactiveTopicPushing)
                            .tint(PassengerTheme.accent)
                    }
                }

                chipSection(title: "Avoid Topics", items: AvoidTopicTag.allCases, selection: draft.avoidTopicTags, toggle: toggle)

                PassengerPrimaryButton(title: mode == .create ? "Continue" : "Save", isLoading: appViewModel.isBusy) {
                    Task {
                        switch mode {
                        case .create:
                            await appViewModel.completeOnboardingForCreate(with: normalizedDraft)
                        case .edit:
                            await appViewModel.saveProfileChanges(with: normalizedDraft)
                        }
                    }
                }
                .disabled(!isValid)
                .opacity(isValid ? 1 : 0.55)
            }
            .padding(PassengerTheme.pagePadding)
        }
        .onAppear {
            if mode == .edit, let profile = appViewModel.profile {
                draft = profile
            }
        }
    }

    private var isValid: Bool {
        !draft.nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var normalizedDraft: UserProfile {
        var profile = draft
        profile.nickname = profile.nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        return profile
    }

    private func chipSection<T: Identifiable & CaseIterable & Hashable>(
        title: String,
        items: T.AllCases,
        selection: Set<T>,
        toggle: @escaping (T) -> Void
    ) -> some View where T.AllCases: RandomAccessCollection, T: TitleConvertible {
        PassengerCard {
            VStack(alignment: .leading, spacing: 16) {
                Text(title)
                    .font(.system(size: 18, weight: .semibold, design: .rounded))

                LazyVGrid(columns: grid, alignment: .leading, spacing: 10) {
                    ForEach(Array(items)) { item in
                        TagChip(title: item.title, isSelected: selection.contains(item)) {
                            toggle(item)
                        }
                    }
                }
            }
        }
    }

    private func pickerSection<T: Identifiable & CaseIterable>(title: String, selection: Binding<T>) -> some View where T.AllCases: RandomAccessCollection, T: Hashable, T: TitleConvertible {
        PassengerCard {
            VStack(alignment: .leading, spacing: 16) {
                Text(title)
                    .font(.system(size: 18, weight: .semibold, design: .rounded))

                Picker(title, selection: selection) {
                    ForEach(Array(T.allCases)) { value in
                        Text(value.title).tag(value)
                    }
                }
                .pickerStyle(.menu)
            }
        }
    }

    private func toggle(_ item: InterestTag) {
        if draft.interests.contains(item) {
            draft.interests.remove(item)
        } else {
            draft.interests.insert(item)
        }
    }

    private func toggle(_ item: HobbyTag) {
        if draft.hobbyTags.contains(item) {
            draft.hobbyTags.remove(item)
        } else {
            draft.hobbyTags.insert(item)
        }
    }

    private func toggle(_ item: AvoidTopicTag) {
        if draft.avoidTopicTags.contains(item) {
            draft.avoidTopicTags.remove(item)
        } else {
            draft.avoidTopicTags.insert(item)
        }
    }
}

protocol TitleConvertible {
    var title: String { get }
}

extension InterestTag: TitleConvertible { }
extension AgeRange: TitleConvertible { }
extension GenderIdentity: TitleConvertible { }
extension OccupationCategory: TitleConvertible { }
extension HobbyTag: TitleConvertible { }
extension ConversationStyle: TitleConvertible { }
extension ResponseLength: TitleConvertible { }
extension AvoidTopicTag: TitleConvertible { }
