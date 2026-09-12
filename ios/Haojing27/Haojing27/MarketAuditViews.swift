import SwiftUI

struct MarketAuditSection: View {
    let row: HaoMatch

    private var status: SourceStatus? { row.sourceStatus }
    private var timeline: [MarketTimelineEntry] { status?.marketTimeline ?? [] }

    private var william: MarketTimelineEntry? {
        timeline.first { ($0.source ?? "").localizedCaseInsensitiveContains("William Hill") }
    }

    private var had: MarketTimelineEntry? {
        timeline.first { ($0.source ?? "").contains("竞彩HAD") }
    }

    private var hhad: MarketTimelineEntry? {
        timeline.first { ($0.source ?? "").contains("竞彩HHAD") }
    }

    private var asia: [MarketTimelineEntry] {
        timeline.filter { ($0.source ?? "").contains("亚洲盘") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("市场主链", systemImage: "chart.line.uptrend.xyaxis")
            marketCard(title: "William Hill 欧赔", entry: william)
            marketCard(title: "竞彩 HAD 胜平负 SP", entry: had, footer: spFooter(hhad: false))
            marketCard(title: "竞彩 HHAD 让球胜平负 SP", entry: hhad, footer: spFooter(hhad: true))

            if asia.isEmpty {
                unavailableCard("Asia4 / 亚洲盘", message: "未确认，不猜")
            } else {
                ForEach(asia) { entry in
                    marketCard(title: entry.source ?? "Asia4 / 亚洲盘", entry: entry)
                }
            }

            sectionTitle("实力锚点", systemImage: "scope")
            eloCard

            sectionTitle("GPT-5.6 Sol 二审", systemImage: "brain.head.profile")
            gptCard
        }
    }

    @ViewBuilder
    private func sectionTitle(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.headline)
            .padding(.top, 5)
    }

    @ViewBuilder
    private func marketCard(title: String, entry: MarketTimelineEntry?, footer: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title).font(.subheadline.bold())
            if let entry {
                auditLine("初", entry.initial)
                auditLine("即", entry.current)
                auditLine("临", entry.closing ?? entry.close)
            } else {
                Text("未确认，不猜").font(.footnote).foregroundStyle(.secondary)
            }
            if let footer, !footer.isEmpty {
                Divider().opacity(0.25)
                Text(footer).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private func unavailableCard(_ title: String, message: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline.bold())
            Text(message).font(.footnote).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
    }

    private func auditLine(_ key: String, _ value: String?) -> some View {
        HStack(alignment: .top) {
            Text(key).font(.caption).foregroundStyle(.secondary).frame(width: 24, alignment: .leading)
            Text(nonEmpty(value)).font(.caption.monospacedDigit()).textSelection(.enabled)
            Spacer(minLength: 0)
        }
    }

    private func spFooter(hhad: Bool) -> String {
        let source = hhad ? status?.hhadSourceCode : status?.hadSourceCode
        let state = hhad ? status?.hhadMarketStatus : status?.hadMarketStatus
        let label = hhad ? "HHAD" : "HAD"
        return "\(label)来源：\(sourceLabel(source)) · 状态：\(nonEmpty(state))"
    }

    private var eloCard: some View {
        let e = status?.elo
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Elo 实力评分").font(.subheadline.bold())
                Spacer()
                Text(eloDirection(e?.eloDiff)).font(.caption.bold()).foregroundStyle(.secondary)
            }
            auditLine("主", formatNumber(e?.homeElo))
            auditLine("客", formatNumber(e?.awayElo))
            auditLine("差", formatSigned(e?.eloDiff))
            if e == nil || (e?.eloDiff == nil && e?.homeElo == nil && e?.awayElo == nil) {
                Text("Elo未确认，不猜值").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
    }

    private var gptCard: some View {
        let reviewed = hasGPTReview
        return VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("真实二审闸门").font(.subheadline.bold())
                Spacer()
                Text(reviewed ? "已执行" : "未执行").font(.caption.bold())
                    .foregroundStyle(reviewed ? Color.green : Color.orange)
            }
            auditLine("状态", status?.teacherGReviewStatus ?? status?.teacherGSourceStatus)
            auditLine("动作", gptAction(status?.teacherGPostGateAction))
            auditLine("黄灯", arbitration(status?.teacherGYellowArbitration))
            auditLine("结论", status?.teacherGFinalConclusion)
            auditLine("支持", status?.teacherGSupportEvidence)
            auditLine("反方", status?.teacherGOppositionEvidence)
            auditLine("时间", status?.teacherGReviewedAt)
            if !reviewed {
                Text("没有真实GPT二审记录时保持ABSTAIN；市场、Elo、泊松等一审数据不得冒充二审。")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
    }

    private var hasGPTReview: Bool {
        let fields = [status?.teacherGFinalConclusion, status?.teacherGSupportEvidence, status?.teacherGOppositionEvidence, status?.teacherGReviewedAt]
        return fields.contains { !nonEmpty($0).hasPrefix("未确认") }
    }

    private func nonEmpty(_ value: String?) -> String {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "未确认" }
        return value
    }

    private func formatNumber(_ value: Double?) -> String? {
        guard let value else { return nil }
        return String(format: "%.1f", value)
    }

    private func formatSigned(_ value: Double?) -> String? {
        guard let value else { return nil }
        return String(format: "%+.1f", value)
    }

    private func eloDirection(_ diff: Double?) -> String {
        guard let diff else { return "未确认" }
        if diff > 0 { return "主队占优" }
        if diff < 0 { return "客队占优" }
        return "接近"
    }

    private func sourceLabel(_ value: String?) -> String {
        switch value {
        case "okooo_sp_mirror": return "澳客竞彩赔率"
        case "500_sp_mirror": return "500竞彩赔率"
        case "qiulaile_sp_mirror": return "球来乐竞彩赔率"
        case .some(let v) where !v.isEmpty: return v
        default: return "未确认"
        }
    }

    private func gptAction(_ value: String?) -> String? {
        switch value {
        case "SUPPORT": return "✅ 支持Top1"
        case "REVIEW": return "🟡 反对/要求复核"
        case "STRONG_CONFLICT": return "🔴 强冲突"
        case "NO_ACTION": return "⚪ 不调整"
        default: return value
        }
    }

    private func arbitration(_ value: String?) -> String? {
        let v = value?.uppercased()
        switch v {
        case "RESCUE": return "🟢 可救黄灯"
        case "HOLD": return "🟡 保持黄灯"
        case "BLOCK": return "🔴 禁止救援"
        default: return value
        }
    }
}
