import Foundation
import Security

private let endpoint = URL(string: "https://tqlibowvnwfkaseqqvvp.supabase.co/functions/v1/hao-console-v1")!

struct HaoAPIClient {
    func login(username: String, password: String) async throws -> String {
        var c = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "login", value: "1")]
        var req = URLRequest(url: c.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["username": username, "password": password])
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw HaoAPIError.invalidResponse }
        let payload = try JSONDecoder().decode(LoginResponse.self, from: data)
        guard (200..<300).contains(http.statusCode), let token = payload.token, !token.isEmpty else {
            throw HaoAPIError.message(payload.error ?? "账号或密码不正确")
        }
        return token
    }

    func load(token: String) async throws -> HaoConsoleResponse {
        var c = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
        c.queryItems = [
            URLQueryItem(name: "api", value: "1"),
            URLQueryItem(name: "t", value: String(Int(Date().timeIntervalSince1970 * 1000)))
        ]
        var req = URLRequest(url: c.url!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw HaoAPIError.invalidResponse }
        if http.statusCode == 401 { throw HaoAPIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else { throw HaoAPIError.http(http.statusCode) }
        do { return try JSONDecoder().decode(HaoConsoleResponse.self, from: data) }
        catch { throw HaoAPIError.decoding(error.localizedDescription) }
    }
}

enum HaoAPIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case http(Int)
    case decoding(String)
    case message(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "服务器返回异常"
        case .unauthorized: return "登录已失效，请重新登录"
        case .http(let code): return "接口错误 HTTP \(code)"
        case .decoding(let text): return "数据结构解析失败：\(text)"
        case .message(let text): return text
        }
    }
}

enum TokenVault {
    private static let service = "com.hao.haojing27"
    private static let account = "hao_console_token"

    static func save(_ token: String) {
        delete()
        let data = Data(token.utf8)
        SecItemAdd([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ] as CFDictionary, nil)
    }

    static func read() -> String? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ] as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete() {
        SecItemDelete([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ] as CFDictionary)
    }
}

@MainActor
final class HaojingStore: ObservableObject {
    @Published var token: String? = TokenVault.read()
    @Published var rows: [HaoMatch] = []
    @Published var run: HaoRun?
    @Published var serverTime: String?
    @Published var loading = false
    @Published var errorText: String?

    var loggedIn: Bool { !(token ?? "").isEmpty }

    func login(username: String, password: String) async -> Bool {
        loading = true
        defer { loading = false }
        do {
            let value = try await HaoAPIClient().login(username: username, password: password)
            TokenVault.save(value)
            token = value
            errorText = nil
            await refresh()
            return true
        } catch {
            errorText = error.localizedDescription
            return false
        }
    }

    func refresh() async {
        guard let token, !token.isEmpty else { return }
        loading = true
        defer { loading = false }
        do {
            let p = try await HaoAPIClient().load(token: token)
            rows = p.hj?.rows ?? []
            run = p.hj?.run
            serverTime = p.serverTime
            errorText = nil
        } catch HaoAPIError.unauthorized {
            logout()
            errorText = HaoAPIError.unauthorized.localizedDescription
        } catch {
            errorText = error.localizedDescription
        }
    }

    func logout() {
        TokenVault.delete()
        token = nil
        rows = []
        run = nil
    }
}
