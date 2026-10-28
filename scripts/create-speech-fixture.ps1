# Local synthetic speech only: no microphone, playback or external provider.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$fixtureRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'cache/offline-validation'
New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
        16000,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    $synthesizer.SetOutputToWaveFile((Join-Path $fixtureRoot 'speech.wav'), $format)
    $synthesizer.Speak('The project team will review the delivery schedule tomorrow morning. Please confirm the next meeting time.')
} finally {
    $synthesizer.Dispose()
}
