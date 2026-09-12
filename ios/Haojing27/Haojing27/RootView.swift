import SwiftUI

private let bg = Color(red: 7/255, green: 17/255, blue: 31/255)
private let panel = Color(red: 13/255, green: 27/255, blue: 45/255)
private let blue = Color(red: 90/255, green: 169/255, blue: 1)
private let green = Color(red: 39/255, green: 209/255, blue: 127/255)
private let yellow = Color(red: 1, green: 192/255, blue: 75/255)
private let red = Color(red: 1, green: 100/255, blue: 117/255)

struct RootView: View {
    @EnvironmentObject private var store: HaojingStore

    var body: some View {
        Group {
            if store.loggedIn {
                TabView {
                    NavigationStack { TodayView() }
                        .tabItem { Label("今日", systemImage: "sportscourt.fill") }
                    NavigationStack { PicksView() }
                        .tabItem { Label("选腿", systemImage: "target") }
                    NavigationStack { HistoryView() }
                        .tabItem { Label("历史", systemImage: "clock.arrow.circlepath") }
                    NavigationStack { SystemView() }
                        .tabItem { Label("系统", systemImage: "shield.lefthalf.filled") }
                }
                .tint(blue)
                .task { if store.rows.isEmpty { await store.refresh() } }
            } else {
                LoginView()
            }
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var store: HaojingStore
    @State private var username = "hao"
    @State private var password = ""

    var body: some View {
        ZStack {
            bg.ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                Image(systemName: "lock.shield.fill").font(.system(size: 48)).foregroundStyle(blue)
                Text("豪·体彩预测模型").font(.title2.bold())
                Text("豪竞2.7 · 私人原生 iOS 客户端").font(.caption).foregroundStyle(.secondary)
                VStack(spacing: 12) {
                    TextField("用户名", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("密码", text: $password)
                    Button {
                        Task { _ = await store.login(username: username, password: password) }
                    } label: {
                        HStack { if store.loading { ProgressView() }; Text("进入控制台").fontWeight(.bold()) }
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(store.loading || username.isEmpty || password.isEmpty)
                }
                .textFieldStyle(.roundedBorder)
                .padding(16)
                .background(panel, in: RoundedRectangle(cornerRadius: 18))
                if let e = store.errorText { Text(e).font(.footnote).foregroundStyle(red).multilineTextAlignment(.center) }
                Spacer()
            }
            .padding(24)
            .frame(maxWidth: 520)
        }
    }
}

struct TodayView: View {
    @EnvironmentObject private var store: HaojingStore

    var body: some View {
        ZStack {
            bg.ignoresSafeArea()
            ScrollView {
                LazyVStack(spacing: 12) {
                    statusCard
                    if let e = store.errorText {
                        Text(e).font(.footnote).foregroundStyle(red).frame(maxWidth: .infinity, alignment: .leading)
                            .padding().background(panel, in: RoundedRectangle(cornerRadius: 14))
                    }
                    ForEach(store.rows) { r in
                        NavigationLink(value: r) { MatchCard(row: r) }.buttonStyle(.plain)
                    }
                    if store.rows.isEmpty && !store.loading {
                        ContentUnavailableView("暂无豪竞数据", systemImage: "soccerball", description: Text("下拉刷新当前销售池"))
                            .padding(.top, 40)
                    }
                }.padding()
            }
            .refreshable { await store.refresh() }
        }
        .navigationTitle("豪竞 2.7")
        .navigationDestination(for: HaoMatch.self) { MatchDetailView(row: $0) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if store.loading { ProgressView() }
                else { Button { Task { await store.refresh() } } label: { Image(systemName: "arrow.clockwise") } }
            }
        }
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("豪·体彩预测模型").font(.headline)
                Spacer()
                Circle().fill(store.rows.isEmpty ? yellow : green).frame(width: 9, height: 9)
            }
            Text(store.run?.poolLabel ?? store.run?.poolDate ?? "等待当前销售池").font(.caption).foregroundStyle(.secondary)
            HStack {
                Label("Run \(store.run?.id.map(String.init) ?? "—")", systemImage: "bolt.fill")
                Spacer()
                Text("\(store.rows.count) 场")
            }.font(.caption2).foregroundStyle(.secondary)
        }
        .padding(16)
        .background(panel, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct MatchCard: View {
    let row: HaoMatch
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(row.matchNo).font(.caption.bold()).foregroundStyle(yellow)
                Text(row.league ?? "").font(.caption2).foregroundStyle(.secondary)
                Spacer()
                if let light = row.sourceStatus?.selectionLight { Text(light).font(.caption2.bold()) }
            }
            Text("\(row.homeTeam ?? "主队")  vs  \(row.awayTeam ?? "客队")").font(.headline)
            HStack(alignment: .firstTextBaseline) {
                Text(row.top1 ?? "未确认").font(.title3.bold()).foregroundStyle(blue)
                if let p = row.sourceStatus?.top1Prob { Text(String(format: "%.1f%%", p * 100)).font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Text(row.confidenceLabel ?? "—").font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 7) {
                risk("HUR", row.hur)
                risk("DTR", row.dtr)
                risk("DLR", row.dlr)
                Text(row.dq ?? "DQ —").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(15)
        .background(panel, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.07)))
    }

    private func risk(_ name: String, _ value: String?) -> some View {
        Text("\(name) \(value ?? "—")").font(.caption2).padding(.horizontal, 7).padding(.vertical, 4)
            .background(Color.white.opacity(0.05), in: Capsule()).foregroundStyle(.secondary)
    }
}

struct MatchDetailView: View {
    let row: HaoMatch
    var body: some View {
        ZStack {
            bg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("\(row.homeTeam ?? "主队") vs \(row.awayTeam ?? "客队")").font(.title2.bold())
                    item("首选 Top1", row.top1)
                    item("信心", row.confidenceLabel)
                    item("出票", row.ticketPick)
                    item("DQ", row.dq)
                    item("HUR / DTR / DLR", [row.hur,row.dtr,row.dlr].map{$0 ?? "—"}.joined(separator: " / "))
                    item("让球", row.officialHandicap.map(String.init))
                    item("让球方向", row.sourceStatus?.handicapFinalPick ?? row.handicapPick)
                    item("让球灯", row.sourceStatus?.handicapLightLabel ?? row.sourceStatus?.handicapLight)
                    if row.resultVerified == true {
                        item("赛果", "\(row.resultHome ?? 0)-\(row.resultAway ?? 0) · \(resultText(row.result1x2))")
                    }
                    Text("William / Asia4 / 体彩SP / Elo / GPT二审详细时间线将在下一阶段继续原生化。")
                        .font(.footnote).foregroundStyle(.secondary).padding(.top, 4)
                }.padding()
            }
        }
        .navigationTitle(row.matchNo).navigationBarTitleDisplayMode(.inline)
    }

    private func item(_ key: String, _ value: String?) -> some View {
        HStack(alignment: .top) { Text(key).foregroundStyle(.secondary); Spacer(); Text(value ?? "未确认").fontWeight(.semibold).multilineTextAlignment(.trailing) }
            .padding().background(panel, in: RoundedRectangle(cornerRadius: 14))
    }
    private func resultText(_ v: String?) -> String { v == "3" ? "主胜" : v == "1" ? "平" : v == "0" ? "客胜" : "未确认" }
}

struct PicksView: View {
    @EnvironmentObject private var store: HaojingStore
    private var selected: [HaoMatch] { store.rows.filter { !($0.ticketPick ?? "").isEmpty } }
    var body: some View {
        List(selected) { r in
            NavigationLink(value: r) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(r.matchNo)  \(r.ticketPick ?? r.top1 ?? "未确认")").font(.headline)
                    Text("\(r.homeTeam ?? "主队") vs \(r.awayTeam ?? "客队")").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .scrollContentBackground(.hidden).background(bg)
        .navigationTitle("选腿")
        .navigationDestination(for: HaoMatch.self) { MatchDetailView(row: $0) }
        .overlay { if selected.isEmpty { ContentUnavailableView("当前无正式选腿", systemImage: "target") } }
    }
}

struct HistoryView: View {
    var body: some View {
        ZStack { bg.ignoresSafeArea(); ContentUnavailableView("历史模块继续接入", systemImage: "chart.xyaxis.line", description: Text("下一阶段接豪竞赛果、Top1命中率和模拟投注账本")) }
            .navigationTitle("历史")
    }
}

struct SystemView: View {
    @EnvironmentObject private var store: HaojingStore
    var body: some View {
        Form {
            Section("豪竞2.7") {
                LabeledContent("版本", value: "iOS v0.2")
                LabeledContent("Run", value: store.run?.id.map(String.init) ?? "—")
                LabeledContent("销售池", value: store.run?.poolLabel ?? store.run?.poolDate ?? "—")
                LabeledContent("比赛", value: "\(store.rows.count) 场")
            }
            Section("连接") {
                Button("立即刷新") { Task { await store.refresh() } }
                Button("退出登录", role: .destructive) { store.logout() }
            }
            Section("设备") {
                LabeledContent("支持", value: "iPhone + iPad")
                Text("Ad Hoc 安装时再绑定已登记设备 UDID；UDID 不写入公开源码。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .scrollContentBackground(.hidden).background(bg)
        .navigationTitle("系统")
    }
}
