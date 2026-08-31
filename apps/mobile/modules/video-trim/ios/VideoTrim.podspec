Pod::Spec.new do |s|
  s.name           = 'VideoTrim'
  s.version        = '1.0.0'
  s.summary        = 'Trims a window out of a local video file'
  s.description    = 'Local Expo module that exports a [start, end] window of a video into a new MP4 file.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
