# 사용자 가이드 생성·검수

README가 사용자 가이드의 원본입니다. PDF는 같은 네 장과 이미지를 읽어 생성합니다. 개발·운영 자료는 `development.md`로 분리했습니다. README의 `<!-- USER_GUIDE_END -->` 이후 성능 개선 기록은 PDF에서 제외합니다. 이 부록만 변경했을 때는 사용자 가이드 PDF를 다시 생성할 필요가 없습니다.

## 캡처 범위

- 운영 `f4faf04d3bbf65a1e900d7534a573d311e060eae`의 익명 로그인, 전용 QA 코치·관리자·소속 없는 계정 화면.
- Chromium, 402×874 CSS px, DPR 3, 한국 시간. 실제 iOS/Android 기기 인증이 아닙니다.
- 프록시 CA를 신뢰하는 Node의 fetch가 운영 응답을 그대로 Chromium에 전달합니다. TLS 검증을 끄거나 화면 데이터를 모킹하지 않습니다. 서비스워커는 캡처 세션에서 차단합니다.
- 이름·이메일·워크스페이스 식별정보만 임시 DOM에서 문서용 예시로 익명화합니다. 양식 예시는 저장하지 않은 입력입니다.
- 업무 POST/DELETE는 차단하며, 읽기 전용 초대 목록 RPC만 허용합니다. 초대 발송·수락, 보고서 저장, 역할 변경, 워크스페이스 삭제와 다운로드 생성은 실행하지 않습니다.
- 신규 Google 인증·동의는 설명으로 안내합니다. 로그인 화면을 캡처하기 위해 실제 Google 계정의 인증을 실행하지 않습니다. 보고서 상세·사진은 취소된 QA 일정의 조회 예시입니다.
- 사용자의 화면 포함 README/PDF 요청에 따라 익명화한 문서 이미지와 생성 PDF를 버전 관리합니다. 원본 로그·세션·인증정보는 커밋하지 않습니다.

## 화면 다시 캡처

설치된 Playwright와 Chromium, 승인된 전용 QA 세션이 필요합니다. `GUIDE_SESSION_FILE`은 저장소 밖의 권한 0600 파일이어야 합니다. 이 파일은 `admin`, `coach`, `unaffiliated`별 Supabase 세션·프로필, QA `workspace`, `courses`, `reports`, 사진 보고서 `photoReportId`를 담습니다. 실제 사용자 세션을 넣지 마세요. 세션 준비와 종료는 별도 승인된 QA 인증 절차를 따르며 캡처 후 생성한 세션만 로그아웃합니다.

```bash
GUIDE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
GUIDE_SESSION_FILE=/outside/repository/qa-sessions.json \
GUIDE_SOURCE_COMMIT=<40자리 운영 커밋> \
NODE_USE_ENV_PROXY=1 node scripts/capture-user-guide.mjs
```

`GUIDE_CHROMIUM`으로 Chromium 실행 파일 경로를 지정할 수 있습니다. 생성된 이미지의 SHA-256, 화면 크기와 앱 커밋은 `docs/images/guide-manifest.json`에 기록합니다. 기존 `qa-mobile-guide.mjs`는 과거 기능 기준의 QA 실행기이므로 최신 문서 캡처를 덮어쓰는 데 사용하지 않습니다.

## PDF 만들기

Python 3, `Markdown==3.8.2`, Node.js 24, Playwright와 Chromium이 필요합니다. 앱의 런타임 의존성은 바꾸지 않습니다. PDF의 한글 폰트는 저장소의 NanumGothic을 포함합니다. 폰트 라이선스는 `assets/fonts/NanumGothic-OFL.txt`에 있습니다.

```bash
python -m pip install --target /tmp/flag-guide-python 'Markdown==3.8.2'
PYTHONPATH=/tmp/flag-guide-python \
GUIDE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
python scripts/export-user-guide.py
npx vitest run scripts/readme-guide.test.mjs
```

출력: `docs/Flag-Edu-User-Guide.pdf`. 생성기는 임시 HTML에 폰트·이미지를 포함한 후 외부 요청 없이 PDF를 만듭니다. 네 장의 순서와 페이지 넘침을 검사합니다. 이미지가 바뀌면 PDF도 다시 생성하세요. 최종 검수는 PDF 페이지 수·한글 텍스트 추출·렌더링 이미지·목차 링크·README 상대경로를 확인합니다.
