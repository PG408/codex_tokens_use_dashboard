import Foundation

enum NodeServerState: Equatable {
  case idle
  case starting
  case running(URL)
  case failed(String)
  case stopped
}

@MainActor
final class NodeServerManager: ObservableObject {
  static let shared = NodeServerManager()

  @Published private(set) var state: NodeServerState = .idle

  private var process: Process?
  private var logs: [String] = []
  private var intentionalStop = false

  var runningURL: URL? {
    if case .running(let url) = state {
      return url
    }
    return nil
  }

  func start() async {
    guard process == nil else {
      return
    }

    state = .starting
    logs = []

    guard let serverRoot = ServerRootResolver.resolve() else {
      state = .failed(
        "Could not find the built dashboard server. Run npm run build from the project root, or package the app with script/build_macos_app.sh."
      )
      return
    }

    let entrypoint = serverRoot
      .appendingPathComponent("dist-server")
      .appendingPathComponent("server")
      .appendingPathComponent("index.js")

    guard FileManager.default.fileExists(atPath: entrypoint.path) else {
      state = .failed("Missing Node helper entrypoint at \(entrypoint.path). Run npm run build and try again.")
      return
    }

    guard let nodeCommand = NodeExecutableResolver.resolve() else {
      state = .failed(
        "Node.js was not found. Install Node.js LTS, or set CODEX_TOKEN_MONITOR_NODE_PATH to the node executable path."
      )
      return
    }

    let port = ServerPortAllocator.availablePort()
    let url = URL(string: "http://127.0.0.1:\(port)")!
    let helper = Process()
    helper.executableURL = nodeCommand.executableURL
    helper.arguments = nodeCommand.argumentsPrefix + [entrypoint.path]
    helper.currentDirectoryURL = serverRoot
    helper.environment = helperEnvironment(port: port)

    let outputPipe = Pipe()
    let errorPipe = Pipe()
    helper.standardOutput = outputPipe
    helper.standardError = errorPipe
    attachLogReader(outputPipe)
    attachLogReader(errorPipe)

    intentionalStop = false
    helper.terminationHandler = { [weak self] process in
      Task { @MainActor in
        guard let self else {
          return
        }

        self.process = nil
        if self.intentionalStop {
          self.state = .stopped
          return
        }

        self.state = .failed(
          "Node helper exited with status \(process.terminationStatus).\n\n\(self.recentLogs)"
        )
      }
    }

    do {
      try helper.run()
      process = helper
    } catch {
      state = .failed("Failed to launch Node helper: \(error.localizedDescription)")
      return
    }

    if await waitForServer(at: url) {
      state = .running(url)
    } else {
      stop()
      state = .failed("Timed out waiting for the local dashboard at \(url.absoluteString).\n\n\(recentLogs)")
    }
  }

  func restart() async {
    stop()
    await start()
  }

  func stop() {
    intentionalStop = true
    process?.terminate()
    process = nil
  }

  private var recentLogs: String {
    logs.suffix(12).joined(separator: "\n")
  }

  private func helperEnvironment(port: Int) -> [String: String] {
    var environment = ProcessInfo.processInfo.environment
    environment["NODE_ENV"] = "production"
    environment["CODEX_TOKEN_DASHBOARD_HOST"] = "127.0.0.1"
    environment["CODEX_TOKEN_DASHBOARD_PORT"] = "\(port)"
    return environment
  }

  private func attachLogReader(_ pipe: Pipe) {
    pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else {
        return
      }

      Task { @MainActor in
        self?.logs.append(text.trimmingCharacters(in: .whitespacesAndNewlines))
        if let count = self?.logs.count, count > 40 {
          self?.logs.removeFirst(count - 40)
        }
      }
    }
  }

  private func waitForServer(at url: URL) async -> Bool {
    var request = URLRequest(url: url)
    request.timeoutInterval = 0.5

    for _ in 0..<60 {
      do {
        let (_, response) = try await URLSession.shared.data(for: request)
        if let statusCode = (response as? HTTPURLResponse)?.statusCode, statusCode < 500 {
          return true
        }
      } catch {
        try? await Task.sleep(nanoseconds: 150_000_000)
      }
    }

    return false
  }
}
