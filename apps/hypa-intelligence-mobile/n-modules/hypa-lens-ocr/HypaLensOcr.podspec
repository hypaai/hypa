require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "HypaLensOcr"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/hypaai/hypa.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{swift}",
    "ios/**/*.{m,mm}",
  ]
  s.frameworks = ["AVFoundation", "Vision"]

  autolinking = File.join(__dir__, "nitrogen/generated/ios/HypaLensOcr+autolinking.rb")
  system("npx", "--no-install", "nitrogen", chdir: __dir__) unless File.exist?(autolinking)
  load autolinking
  add_nitrogen_files(s)

  s.dependency 'VisionCamera'
  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
