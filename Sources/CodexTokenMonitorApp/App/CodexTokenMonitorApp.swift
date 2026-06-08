import AppKit
import SwiftUI

@main
struct CodexTokenMonitorApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var server = NodeServerManager.shared

  var body: some Scene {
    WindowGroup {
      ContentView(server: server)
        .frame(minWidth: 1120, minHeight: 760)
        .task {
          await server.start()
        }
    }
    .commands {
      CommandGroup(after: .appInfo) {
        Button("Restart Local Server") {
          Task {
            await server.restart()
          }
        }
        .keyboardShortcut("r", modifiers: [.command, .shift])
      }
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationWillTerminate(_ notification: Notification) {
    NodeServerManager.shared.stop()
  }
}
