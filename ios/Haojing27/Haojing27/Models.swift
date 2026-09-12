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

    enum CodingKeys: String, CodingKey {
        case top1Prob = "top1_prob"
        case gap
        case handicapFinalPick = "handicap_final_pick"
        case handicapLight = "handicap_light"
        case handicapLightLabel = "handicap_light_label"
        case selectionLight = "selection_light"
    }
}

struct LoginResponse: Decodable {
    let token: String?
    let error: String?
}
