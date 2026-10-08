# Flag Edu Android APK

운영 웹앱 `https://flag-edu-prototype.vercel.app/`을 Google Android Browser Helper의 Trusted Web Activity(TWA)로 여는 Android 앱입니다. 앱 이름은 Flag Edu, 패키지는 `kr.flagedu.app`입니다. 웹 화면과 로그인은 브라우저에서 실행하며 서버의 기존 권한을 사용합니다. 앱에 로그인 계정·Supabase/Vercel 시크릿을 넣지 않습니다. 웹 화면 변경은 APK 재설치 없이 반영됩니다.

Android 6.0(API 23) 이상과 최신 Chrome 등 TWA 지원 브라우저가 필요합니다. 도메인 검증이 성공하면 주소창 없이 실행됩니다. 지원 브라우저가 없거나 검증이 실패하면 브라우저 화면으로 열릴 수 있습니다. 사진 선택과 다운로드는 브라우저의 기존 기능을 사용합니다. 푸시 알림·오프라인 업무·Play 스토어 등록은 이 APK의 추가 기능이 아닙니다.

## 빌드

JDK 17 이상, Android SDK Platform 36, Android Build Tools 35.0.0, Gradle 8.11.1을 사용합니다. `ANDROID_HOME` 또는 `local.properties`의 `sdk.dir`을 설정합니다. Gradle wrapper는 배포 SHA-256을 검증합니다.

서명키는 저장소 밖에 보관합니다. 아래 환경변수를 설정하고 암호를 로그나 셸 명령 이력에 남기지 않습니다.

- `FLAG_ANDROID_KEYSTORE`: 키스토어 절대 경로
- `FLAG_ANDROID_STORE_PASSWORD`: 키스토어/개인키 암호
- 키 별칭: `flag-edu`

```sh
cd android
./gradlew assembleRelease lintRelease
```

산출물: `app/build/outputs/apk/release/app-release.apk`. 새 APK 업데이트에는 같은 패키지·서명키를 유지하고 `versionCode`를 올립니다. 최초 생성된 키와 암호는 `/workspace/flag-android-private/`에 있으며, 이 작업 공간은 영구 보관소가 아니므로 소유자가 두 파일을 안전한 영구 보관소에 백업해야 합니다. 개인키와 암호는 git에 넣거나 웹에 공개하지 않습니다.

사이트의 `public/.well-known/assetlinks.json`에는 이 APK의 공개 서명 지문을 등록합니다. 다른 서명키로 만들거나 Play App Signing을 사용하면 실제 설치 APK의 인증서 지문으로 함께 갱신합니다.

## 검증 범위

빌드·Android lint·APK 서명과 패키지/권한·공개 도메인 연결 JSON을 확인합니다. 웹 브라우저의 기존 테스트와 APK의 Android 실행 확인은 서로 다른 검증입니다. 실제 Android 기기에 설치해 실행, Chrome/TWA 전체 화면, 관리자·코치 로그인, 뒤로 가기, 사진 선택과 PDF/XLSX 다운로드를 확인해야 기기 검증이 완료됩니다. 이 환경에는 연결된 휴대폰과 가속 가능한 Android 에뮬레이터가 없습니다.
