import SwiftUI

struct PassengerPrimaryButton: View {
    let title: String
    let isLoading: Bool
    let action: () -> Void

    // Renders the app's primary full-width action button.
    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                }

                Text(title)
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(PassengerTheme.ink)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct PassengerCard<Content: View>: View {
    let content: Content

    // Captures caller-provided card content.
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    // Renders a reusable bordered panel container.
    var body: some View {
        content
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PassengerTheme.panel)
            .clipShape(RoundedRectangle(cornerRadius: PassengerTheme.cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: PassengerTheme.cornerRadius, style: .continuous)
                    .stroke(PassengerTheme.line, lineWidth: 1)
            }
    }
}

struct TagChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    // Renders a selectable tag chip button.
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(isSelected ? PassengerTheme.ink : PassengerTheme.secondaryInk)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(isSelected ? PassengerTheme.accentSoft : PassengerTheme.panel)
                .clipShape(Capsule())
                .overlay {
                    Capsule()
                        .stroke(isSelected ? PassengerTheme.accent : PassengerTheme.line, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }
}

struct AvatarButton: View {
    let label: String
    let action: () -> Void

    // Renders the circular avatar navigation button.
    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(PassengerTheme.accentSoft)
                    .frame(width: 48, height: 48)

                Text(label)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(PassengerTheme.ink)
            }
        }
        .buttonStyle(.plain)
    }
}

struct SectionTitle: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    // Renders the standard section header block.
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased())
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .tracking(1.4)
                .foregroundStyle(PassengerTheme.accent)

            Text(title)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(PassengerTheme.ink)

            Text(subtitle)
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundStyle(PassengerTheme.secondaryInk)
        }
    }
}

struct WaveformView: View {
    let isAnimating: Bool

    // Renders the animated voice waveform bars.
    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<5) { index in
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(index.isMultiple(of: 2) ? PassengerTheme.accent : PassengerTheme.ink.opacity(0.8))
                    .frame(width: 10, height: heights[index])
                    .scaleEffect(y: isAnimating ? 1 : 0.55, anchor: .center)
                    .animation(
                        .easeInOut(duration: 0.7).repeatForever().delay(Double(index) * 0.08),
                        value: isAnimating
                    )
            }
        }
    }

    private let heights: [CGFloat] = [18, 44, 30, 52, 24]
}
