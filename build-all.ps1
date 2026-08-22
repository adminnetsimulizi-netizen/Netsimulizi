$ErrorActionPreference = "Stop"
npm install
npm run build:all
Write-Host "Web/API/Admin/Author builds completed."
Write-Host "Mobile builds require Flutter/Android Studio/Xcode and signing credentials."
