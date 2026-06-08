import Foundation

enum ServerRootResolver {
  static func resolve() -> URL? {
    let environment = ProcessInfo.processInfo.environment
    if let explicitPath = environment["CODEX_TOKEN_MONITOR_SERVER_ROOT"] {
      let explicitURL = URL(fileURLWithPath: explicitPath)
      if containsBuiltServer(explicitURL) {
        return explicitURL
      }
    }

    if let resourceURL = Bundle.main.resourceURL {
      let packagedServer = resourceURL.appendingPathComponent("server")
      if containsBuiltServer(packagedServer) {
        return packagedServer
      }
    }

    let currentDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    return firstAncestorContainingBuiltServer(from: currentDirectory)
  }

  private static func firstAncestorContainingBuiltServer(from startURL: URL) -> URL? {
    var candidate = startURL.standardizedFileURL

    while true {
      if containsBuiltServer(candidate) {
        return candidate
      }

      let parent = candidate.deletingLastPathComponent()
      if parent.path == candidate.path {
        return nil
      }
      candidate = parent
    }
  }

  private static func containsBuiltServer(_ url: URL) -> Bool {
    let serverEntrypoint = url
      .appendingPathComponent("dist-server")
      .appendingPathComponent("server")
      .appendingPathComponent("index.js")
    let clientEntrypoint = url
      .appendingPathComponent("dist")
      .appendingPathComponent("index.html")

    return FileManager.default.fileExists(atPath: serverEntrypoint.path)
      && FileManager.default.fileExists(atPath: clientEntrypoint.path)
  }
}
