import SwiftUI
import WebKit

struct WebDashboardView: NSViewRepresentable {
  let url: URL
  let reloadSignal: Int

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = context.coordinator
    webView.allowsBackForwardNavigationGestures = true
    webView.load(URLRequest(url: url))
    context.coordinator.loadedURL = url
    context.coordinator.reloadSignal = reloadSignal
    return webView
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    if context.coordinator.loadedURL != url {
      webView.load(URLRequest(url: url))
      context.coordinator.loadedURL = url
    }

    if context.coordinator.reloadSignal != reloadSignal {
      webView.reload()
      context.coordinator.reloadSignal = reloadSignal
    }
  }

  final class Coordinator: NSObject, WKNavigationDelegate {
    var loadedURL: URL?
    var reloadSignal = 0
  }
}
