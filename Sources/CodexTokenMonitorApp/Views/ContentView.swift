import SwiftUI

struct ContentView: View {
  @ObservedObject var server: NodeServerManager
  @State private var reloadSignal = 0

  var body: some View {
    ZStack {
      switch server.state {
      case .idle, .starting:
        StartupView(message: "Starting local dashboard server...")

      case .running(let url):
        WebDashboardView(url: url, reloadSignal: reloadSignal)

      case .failed(let message):
        FailureView(message: message) {
          Task {
            await server.restart()
          }
        }

      case .stopped:
        FailureView(message: "The local dashboard server has stopped.") {
          Task {
            await server.restart()
          }
        }
      }
    }
    .toolbar {
      ToolbarItemGroup {
        Button {
          reloadSignal += 1
        } label: {
          Label("Reload Dashboard", systemImage: "arrow.clockwise")
        }
        .disabled(server.runningURL == nil)

        Button {
          Task {
            await server.restart()
          }
        } label: {
          Label("Restart Server", systemImage: "power")
        }
      }
    }
  }
}

private struct StartupView: View {
  let message: String

  var body: some View {
    VStack(spacing: 14) {
      ProgressView()
        .controlSize(.large)
      Text(message)
        .font(.headline)
      Text("The app runs the existing Node helper locally and keeps Codex session data on this Mac.")
        .foregroundStyle(.secondary)
    }
    .padding(32)
  }
}

private struct FailureView: View {
  let message: String
  let retry: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Label("Dashboard server could not start", systemImage: "exclamationmark.triangle")
        .font(.title3.weight(.semibold))

      Text(message)
        .foregroundStyle(.secondary)
        .textSelection(.enabled)

      Button(action: retry) {
        Label("Retry", systemImage: "arrow.clockwise")
      }
      .keyboardShortcut(.defaultAction)
    }
    .frame(maxWidth: 560, alignment: .leading)
    .padding(32)
  }
}
