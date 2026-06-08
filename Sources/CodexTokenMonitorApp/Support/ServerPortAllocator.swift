import Darwin
import Foundation

enum ServerPortAllocator {
  static func availablePort(fallback: Int = 4317) -> Int {
    let descriptor = socket(AF_INET, SOCK_STREAM, 0)
    guard descriptor >= 0 else {
      return fallback
    }
    defer {
      close(descriptor)
    }

    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = in_port_t(0).bigEndian
    address.sin_addr = in_addr(s_addr: in_addr_t(INADDR_LOOPBACK).bigEndian)

    let bindResult = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        bind(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }

    guard bindResult == 0 else {
      return fallback
    }

    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let nameResult = withUnsafeMutablePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        getsockname(descriptor, socketAddress, &length)
      }
    }

    guard nameResult == 0 else {
      return fallback
    }

    return Int(UInt16(bigEndian: address.sin_port))
  }
}
