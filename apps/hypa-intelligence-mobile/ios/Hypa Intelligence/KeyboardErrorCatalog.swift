import Foundation

enum KeyboardErrorCatalog {
  static let serviceDown = "Service down"
  static let noInternet = "No internet"
  static let timedOut = "Timed out"
  static let cantReachServer = "Can't reach server"
  static let connectionLost = "Connection lost"
  static let invalidRequest = "Invalid request"
  static let signInRequired = "Sign in required"
  static let subscriptionNeeded = "Subscription needed"
  static let accessDenied = "Access denied"
  static let notFound = "Not found"
  static let textTooLong = "Text too long"
  static let tokenLimit = "Token limit"
  static let tooManyRequests = "Too many requests"
  static let serverError = "Server error"
  static let typeOrSelectText = "Type or select text"
  static let noWord = "No word"
  static let noTranslation = "No translation"
  static let noResult = "No result"
  static let noAudio = "No audio"
  static let playbackFailed = "Playback failed"
  static let noVoice = "No voice"
  static let micNeeded = "Mic needed"
  static let recordingFailed = "Recording failed"
  static let noSpeech = "No speech"
  static let pinLimitReached = "5-pin limit reached"
  static let fullAccessNeeded = "Full Access needed"
  static let tryAgain = "Try again"

  static func apiCode(_ code: Int) -> String? {
    switch code {
    case 10014: return tokenLimit
    default: return nil
    }
  }

  static func http(_ code: Int) -> String {
    switch code {
    case 400, 422: return invalidRequest
    case 401: return signInRequired
    case 402: return subscriptionNeeded
    case 403: return accessDenied
    case 404: return notFound
    case 408, 504: return timedOut
    case 413: return textTooLong
    case 429: return tooManyRequests
    case 500: return serverError
    case 502, 503: return serviceDown
    default: return tryAgain
    }
  }

  static func network(_ error: Error) -> String {
    let nsError = error as NSError
    guard nsError.domain == NSURLErrorDomain else { return tryAgain }
    switch nsError.code {
    case NSURLErrorNotConnectedToInternet:
      return noInternet
    case NSURLErrorTimedOut:
      return timedOut
    case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed, NSURLErrorCannotConnectToHost:
      return cantReachServer
    case NSURLErrorNetworkConnectionLost:
      return connectionLost
    case NSURLErrorSecureConnectionFailed,
      NSURLErrorServerCertificateUntrusted,
      NSURLErrorServerCertificateHasBadDate,
      NSURLErrorServerCertificateHasUnknownRoot,
      NSURLErrorServerCertificateNotYetValid,
      NSURLErrorAppTransportSecurityRequiresSecureConnection:
      return cantReachServer
    default:
      return tryAgain
    }
  }
}
