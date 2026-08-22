#!/usr/bin/env bash
set -e
npm install
npm run build:all
echo "Web/API/Admin/Author builds completed."
echo "Mobile builds require Flutter/Android Studio/Xcode and signing credentials."
