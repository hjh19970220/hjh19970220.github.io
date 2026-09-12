import Foundation

struct HaoConsoleResponse: Decodable {
    let ok: Bool?
    let serverTime: String?
    let hj: HaoSection?

    enum CodingKeys: String, CodingKey {
        case ok, hj
        case serverTime = "server_time"
    }
}

struct HaoSection: Decodable {
    let run: HaoRun?
    let rows: [HaoMatch]?
}

struct HaoRun: Decodable {
    let id: Int?
    let status: String?
    let poolDate: String?
    let poolLabel: String?
    let runTime: String?
    let totalMatches: Int?

    enum CodingKeys: String, CodingKey {
        case id, status
        case poolDate = "pool_date"
        case poolLabel = "pool_label"
        case runTime = "run_time"
        case totalMatches = "total_matches"
    }
}

struct HaoMatch: Decodable, Identifiable, Hashable {
    var id: String { matchNo }
    let matchNo: String
    let league: String?
    let homeTeam: String?
    let awayTeam: String?
    let top1: String?
    let secondPick: String?
    let confidenceLabel: String?
    let hur: String?
    let dtr: String?
    let dlr: String?
    let dq: String?
    let ticketPick: String?
    let officialHandicap: Int?
    let handicapPick: String?
    let resultVerified: Bool?
    let resultHome: Int?
    let resultAway: Int?
    let result1x2: String?
    let sourceStatus: SourceStatus?

    enum CodingKeys: String, CodingKey {
        case matchNo = "match_no"
        case league
        case homeTeam = "home_team"
        case awayTeam = "away_team"
        case top1
        case secondPick = "second_pick"
        case confidenceLabel = "confidence_label"
        case hur, dtr, dlr, dq
        case ticketPick = "ticket_pick"
        case officialHandicap = "official_handicap"
        case handicapPick = "handicap_pick"
        case resultVerified = "result_verified"
        case resultHome = "result_home"
        case resultAway = "result_away"
        case result1x2 = "result_1x2"
        case sourceStatus = "source_status"
    }

    static func == (lhs: HaoMatch, rhs: HaoMatch) -> Bool { lhs.matchNo == rhs.matchNo }
    func hash(into hasher: inout Hasher) { hasher.combine(matchNo) }
}

struct SourceStatus: Decodable {
    let top1Prob: Double?
    let gap: Double?
    let handicapFinalPick: String?
    let handicapLight: String?
    let handicapLightLabel: String?
    let selectionLight: String?

    let marketTimeline: [MarketTimelineEntry]?
    let hadSourceCode: String?
    let hhadSourceCode: String?
    let hadMarketStatus: String?
    let hhadMarketStatus: String?
    let spTop1: String?

    let elo: EloSnapshot?

    let teacherGReviewStatus: String?
    let teacherGSourceStatus: String?
    let teacherGPostGateAction: String?
    let teacherGYellowArbitration: String?
    let teacherGFinalConclusion: String?
    let teacherGSupportEvidence: String?
    let teacherGOppositionEvidence: String?
    let teacherGReviewedAt: String?

    enum CodingKeys: String, CodingKey {
        case top1Prob = "top1_prob"
        case gap
        case handicapFinalPick = "handicap_final_pick"
        case handicapLight = "handicap_light"
        case handicapLightLabel = "handicap_light_label"
        case selectionLight = "selection_light"
        case marketTimeline = "market_timeline"
        case hadSourceCode = "had_source_code"
        case hhadSourceCode = "hhad_source_code"
        case hadMarketStatus = "had_market_status"
        case hhadMarketStatus = "hhad_market_status"
        case spTop1 = "sp_top1"
        case elo
        case teacherGReviewStatus = "teacher_g_review_status"
        case teacherGSourceStatus = "teacher_g_source_status"
        case teacherGPostGateAction = "teacher_g_post_gate_action"
        case teacherGYellowArbitration = "teacher_g_yellow_arbitration"
        case teacherGFinalConclusion = "teacher_g_final_conclusion"
        case teacherGSupportEvidence = "teacher_g_support_evidence"
        case teacherGOppositionEvidence = "teacher_g_opposition_evidence"
        case teacherGReviewedAt = "teacher_g_reviewed_at"
    }
}

struct MarketTimelineEntry: Decodable, Identifiable {
    var id: String { [source ?? "source", initial ?? "", current ?? "", closing ?? close ?? ""].joined(separator: "|") }
    let source: String?
    let initial: String?
    let current: String?
    let closing: String?
    let close: String?
}

struct EloSnapshot: Decodable {
    let eloDiff: Double?
    let homeElo: Double?
    let awayElo: Double?
    let direction: String?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case eloDiff = "elo_diff"
        case homeElo = "home_elo"
        case awayElo = "away_elo"
        case direction, status
    }
}

struct LoginResponse: Decodable {
    let token: String?
    let error: String?
}
