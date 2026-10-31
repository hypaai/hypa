package com.margelo.nitro.hypalensocr

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
@Keep
class HybridLensOcrFactory : HybridLensOcrFactorySpec() {
  @DoNotStrip
  @Keep
  override fun createLensOcr(): HybridLensOcrSpec {
    return HybridLensOcr()
  }
}
