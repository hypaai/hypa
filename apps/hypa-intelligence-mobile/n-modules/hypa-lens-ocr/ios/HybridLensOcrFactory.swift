import NitroModules

class HybridLensOcrFactory: HybridLensOcrFactorySpec {
  func createLensOcr() throws -> any HybridLensOcrSpec {
    return HybridLensOcr()
  }
}
