import Foundation

struct NodeCommand {
  let executableURL: URL
  let argumentsPrefix: [String]
}

enum NodeExecutableResolver {
  static func resolve() -> NodeCommand? {
    let environment = ProcessInfo.processInfo.environment
    if let explicitPath = environment["CODEX_TOKEN_MONITOR_NODE_PATH"],
       FileManager.default.isExecutableFile(atPath: explicitPath) {
      return NodeCommand(
        executableURL: URL(fileURLWithPath: explicitPath),
        argumentsPrefix: []
      )
    }

    for path in ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"] {
      if FileManager.default.isExecutableFile(atPath: path), isUsableNode(atPath: path) {
        return NodeCommand(
          executableURL: URL(fileURLWithPath: path),
          argumentsPrefix: []
        )
      }
    }

    if FileManager.default.isExecutableFile(atPath: "/usr/bin/env") {
      return NodeCommand(
        executableURL: URL(fileURLWithPath: "/usr/bin/env"),
        argumentsPrefix: ["node"]
      )
    }

    return nil
  }

  private static func isUsableNode(atPath path: String) -> Bool {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: path)
    process.arguments = ["--version"]
    process.standardOutput = Pipe()
    process.standardError = Pipe()

    do {
      try process.run()
      process.waitUntilExit()
      return process.terminationStatus == 0
    } catch {
      return false
    }
  }
}
