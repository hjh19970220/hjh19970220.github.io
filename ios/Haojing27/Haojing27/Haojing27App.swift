import SwiftUI

@main
struct Haojing27App: App {
    @StateObject private var store = HaojingStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
        }
    }
}
