// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "CodexTokenMonitorMac",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(
      name: "CodexTokenMonitor",
      targets: ["CodexTokenMonitorApp"]
    )
  ],
  targets: [
    .executableTarget(
      name: "CodexTokenMonitorApp",
      path: "Sources/CodexTokenMonitorApp"
    )
  ]
)
