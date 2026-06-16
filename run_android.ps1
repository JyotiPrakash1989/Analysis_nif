# Run Flutter on Android using a project-local Gradle cache.
# Use this instead of "flutter run" to avoid:
#   "Could not read workspace metadata from ... metadata.bin"
# Run from project root:  .\run_android.ps1
$androidDir = Join-Path $PSScriptRoot "android"
$env:GRADLE_USER_HOME = Join-Path $androidDir ".gradle-home"
flutter run @args
