# 개발·운영 참고

사용자 안내는 [README 사용자 가이드](../README.md)를 참고하세요. 이 문서는 기존 개발·운영 기록을 분리한 것입니다. 아래 과거 QA 결과와 `qa-mobile-guide.mjs`는 당시 화면 기준이며, 최신 가이드 캡처 절차는 [가이드 생성 안내](user-guide-build.md)를 사용합니다.

## 로컬 실행

Node.js 24 이상과 npm이 필요합니다.

```bash
npm ci
copy .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`에 접속합니다.

### 환경변수

| 이름 | 공개 여부 | 역할 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 공개 | 연결할 Supabase 프로젝트 API 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저 공개 | 로그인과 RLS 범위의 클라이언트 요청에 사용하는 Publishable Key |
| `NEXT_PUBLIC_SITE_URL` | 브라우저 공개 | 기존 비밀번호 복구 콜백을 생성할 앱 기준 주소 |
| `SUPABASE_SECRET_KEY` | 서버 전용 | 서버 관리 작업에 사용하는 Supabase Secret Key |
| `CRON_SECRET` | 서버 전용 | Vercel Cron 정리 API 호출을 인증하는 16자 이상의 무작위 문자열 |

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SECRET_KEY=your-server-only-secret-key
CRON_SECRET=replace-with-a-random-string-at-least-16-characters
```

`.env.local`, DB 비밀번호, Secret Key, 기존 `service_role` 키, 로그인 정보는 Git에 커밋하지 않습니다. 다른 PC에서 작업할 때는 `.env.example`을 복사한 뒤 승인된 별도 채널로 전달받은 실제 값을 다시 설정합니다.

## Supabase 설정

### 마이그레이션

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase migration list --linked
npx supabase db push
```

적용 전 연결된 프로젝트와 미적용 마이그레이션을 반드시 확인합니다.

### Auth URL

운영 전 Google 공급자와 Google 전용 신규가입 훅을 설정하고 URL Configuration을 설정합니다. 상세 순서는 [Google OAuth·앱 초대 운영 적용](../docs/google-oauth-inapp-rollout.md)을 따릅니다.

```text
Site URL: https://flag-edu-prototype.vercel.app
Redirect URL: http://localhost:3000/auth/callback
Redirect URL: http://localhost:3000/**
Redirect URL: https://flag-edu-prototype.vercel.app/auth/callback
Redirect URL: https://flag-edu-prototype.vercel.app/**
```

Vercel Preview에서 인증을 시험한다면 해당 Preview 패턴을 별도로 추가합니다. 허용되지 않은 콜백은 Supabase의 Site URL로 대체되어 초대 링크가 잘못된 화면으로 이동할 수 있습니다.

### 최초 기관과 관리자

초기 마이그레이션 뒤 Supabase Auth 사용자를 만든 다음 기관과 관리자 프로필을 연결합니다. 로컬 서버 환경변수가 준비되어 있으면 다음 명령을 사용할 수 있습니다.

```bash
npm run bootstrap:admin -- <AUTH_USER_UUID>
```

이후 코치는 앱의 `구성원 관리`에서 로그인 이메일을 지정해 초대합니다. 메일을 발송하지 않고 상대방의 `받은 초대`에 표시합니다.

## 검증

2026-10-07 앱 `4ad47c4`의 개발/운영 Chrome·WebKit 각각 43개 조회·차단·미저장 입력 검증은 통과했습니다. 이후 main `cc2d9df`의 추가 운영 실행은 이동 대기 및 사진 요청 실패로 FAIL을 보존했습니다. 서비스 워커 수정 후 두 엔진에서 공개 캐시 경계와 직접 사진 응답 200을 확인했지만, 전체 게이트는 Chrome 요청 대기 timeout·WebKit 미분류 네트워크 오류로 아직 FAIL입니다. 자동 회귀는 50파일 243개입니다. 연결된 Chrome 확장 브라우저는 제어 런타임 초기화 실패로 아직 검증하지 못했습니다. 사용자가 이 미완료 상태를 확인한 뒤 main 반영·배포를 승인했습니다. 이전 성공을 현재 배포의 검증으로 대신하지 않습니다. 상세 실행 범위와 결과는 [QA 검증 기록](../qa/aside/findings.md)을 확인하세요.

개발 모드의 React Server Component 음수 시간 계측 결함([React #37561](https://github.com/react/react/issues/37561))은 Next 16.3.8에 맞춘 제한적 소스 패치로 보완합니다. `npm ci`/`npm install` 후 자동 적용되며, `npm run dev` 시작 전에도 확인합니다. 계산되지 않은 aborted/errored 계측만 정상 렌더 계측과 동일한 조건으로 건너뛰며 실제 예외·오류 화면·정상 성능 측정은 유지합니다. 전역 `performance.measure` 재정의나 오류 숨김은 사용하지 않습니다.

패치는 개발용 Flight 클라이언트 6개에만 적용하고 운영 번들은 변경하지 않습니다. Next 버전·원본 SHA-256이 다르면 설치를 실패시켜 검토를 요구합니다. Next를 업데이트할 때 공식 수정 포함 여부를 확인한 후 [패치 스크립트](../scripts/patch-next-rsc-performance.mjs)와 `postinstall`/`predev`를 함께 제거하거나 갱신하세요. `--ignore-scripts` 설치 후에는 개발 서버 시작 또는 패치 스크립트를 직접 실행해야 합니다.

모바일 하단 홈 메뉴를 가리는 개발 배지는 `devIndicators: false`로 비활성화했습니다. 컴파일·런타임 오류 표시는 그대로 유지됩니다. 실제 메뉴/touch 비교 검증은 `scripts/qa-native-menu.mjs`를 사용하고, 로컬 빌드의 요청 취소 분석은 `node scripts/qa-local-server.mjs 3001`로 실행합니다. 이 서버 보조 도구의 요청 추적은 개발 앱·Vercel 운영에는 적용하지 않습니다.

오류 표시 보존은 `scripts/qa-dev-error-reporting.mjs http://localhost:3000 <Playwright 모듈 경로>`로 별도 검증합니다. 익명 로그인 페이지의 테스트 브라우저에 의도적인 예외 1개를 발생시켜 오류 배지와 상세 오버레이가 표시되는지 확인하므로, 다른 통합 테스트와 동시에 실행하지 마세요. 정상 통합 테스트의 오류 수에는 이 의도적 검증을 합치지 않습니다.

개발(`http://localhost:3000`)과 운영 앱은 현재 같은 Supabase를 사용합니다. 테스트 업무 데이터는 별도 QA 워크스페이스에 격리하고 실사용자의 계정·권한·업무 데이터는 변경하지 않습니다. 환경별 Supabase 분리는 별도 운영 과제입니다.

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Aside 브라우저 QA는 기본 조회 전용입니다.

```bash
npm run qa:aside
```

- [Aside QA 실행 안내](../docs/aside-qa.md)
- [QA 피드백 루프](../docs/qa-feedback-loop.md)

설치된 Playwright를 사용한 모바일 통합 검증·문서 캡처는 다음과 같이 실행합니다. 미리 승인된 `qa_fixture: true` 계정과 픽스처가 필요하며, 실제 이메일·비밀번호·세션 파일은 Git에 넣지 않습니다.

```powershell
node --env-file=.env.local scripts/qa-mobile-guide.mjs http://localhost:3000 <설치된-playwright-index.mjs-경로>
node --env-file=.env.local scripts/qa-mobile-guide.mjs https://flag-edu-prototype.vercel.app <설치된-playwright-index.mjs-경로>
```

이 실행기는 로그인, 관리자·코치 화면/차단, 필터 초기화, 날짜별 캘린더·보기 유지, 미저장 일정 미리보기·선택지 편집, 기존 사진 디코딩을 검증합니다. 성공하는 업무 등록·수정·제출·삭제, 권한 변경, 초대 메일, 내보내기 생성은 실행하지 않습니다. CRUD·실제 메일 E2E는 별도 쓰기 승인을 받아 수행하며, 과거 실행의 성공을 현재 환경의 성공으로 대신하지 않습니다.

기본 엔진은 WebKit이며 `QA_BROWSER=chromium`으로 설치된 Chrome 대조 실행도 가능합니다. WebKit의 native 요청 취소와 실제 예외는 별도로 기록하며, 같은 요청의 취소 증거가 없는 오류는 실패로 유지합니다. 문서 사진의 완성 여부와 브라우저 오류 게이트 통과 여부도 매니페스트에서 구분합니다. 최신 실행 범위·관찰 사항은 [QA 검증 기록](../qa/aside/findings.md)을 확인하세요.

화면 이동 검증은 현재 화면을 불필요하게 다시 로드하지 않고, 화면에 해당 링크가 있으면 실제 터치로 이동합니다. 링크가 없는 상세 주소와 코치의 관리자 주소 차단은 직접 주소로도 확인합니다. SPA 이동에서는 이전 문서의 `networkidle` 상태만 믿지 않고, 새 GET 요청이 끝난 뒤 1초간 조용한 구간을 별도로 기다립니다. 30초 안에 끝나지 않으면 실패합니다. 강제 문서 재로딩에 따른 prefetch 취소 관찰은 실제 메뉴 이동 결과와 분리해 보존하며, 실패 로그를 지우거나 오류 필터를 넓혀 통과시키지 않습니다.

개발 모드와 빌드 모드의 차이를 확인할 때는 `npm run build` 후 `npm run start -- --port 3001`로 별도의 로컬 서버를 열고 위 실행기에 `http://localhost:3001`을 전달할 수 있습니다. 이는 운영 배포 검증이 아니며 문서용 사진을 교체하지 않습니다.

서비스 워커는 공개 `manifest.webmanifest`와 `icon.svg`만 처리합니다. 로그인·HTML·API·보고서·사진·RSC·다른 원점 요청은 가로채거나 캐시하지 않으며, 업무 화면은 온라인 연결이 필요합니다. 업데이트 시 이 앱의 이전 shell 캐시만 정리하고 로그인 세션이나 다른 앱 캐시는 삭제하지 않습니다. 로컬 production 빌드 또는 운영 검증에 `QA_VERIFY_PUBLIC_WORKER=1`을 추가하면 두 역할의 실제 활성 워커·공개 캐시와 서비스 워커를 경유하지 않는 기존 사진 로딩까지 검사합니다. 실기기 PWA 설치 검증과는 구분합니다.

문서 캡처는 명시적으로 `QA_CAPTURE_DOCS=1`을 설정한 경우에만 `docs/images/`의 문서용 JPEG와 매니페스트를 갱신합니다. `QA_FIXTURE_RUN`은 승인된 픽스처 실행명, `QA_SOURCE_COMMIT`은 검증하는 앱 커밋입니다. 원본 로그·다운로드·세션은 Git 제외 `artifacts/aside/`에만 둡니다. 새 문서 사진의 존재·정확한 크기·해시·대체 텍스트는 자동 회귀로 검사합니다.

## 데모 데이터 교체

계정·프로필·기관은 보존하면서 수업, 보고서, 양식, 사진, 내보내기 이력을 현실적인 데모 시나리오로 교체할 수 있습니다. 기본 실행은 조회 전용 dry-run이며 현재 삭제 대상 건수만 보여 줍니다.

```bash
npm run seed:demo -- --admin-email=<관리자 이메일> --coach-email=<코치 이메일>
```

출력된 기관과 계정 역할, 삭제 대상 건수를 확인한 뒤에만 실제 교체 확인 문자열을 추가합니다.

```bash
npm run seed:demo -- --admin-email=<관리자 이메일> --coach-email=<코치 이메일> --confirm=REPLACE-DEMO-DATA
```

- 관리자 계정은 `admin/active`, 코치 계정은 `coach/active`로 맞춥니다.
- 다른 Auth 사용자와 모든 프로필·기관 정보는 삭제하지 않습니다.
- 기존 업무 데이터와 `report-images`, `report-exports` 객체는 제거합니다.
- 주간 기초반, 방문형 수업, 체험 수업, 시간 미정 워크숍, 우천 취소 일정과 제출·임시저장 보고서, 합성 활동 사진, XLSX 이력을 생성합니다.
- 서버 전용 `SUPABASE_SECRET_KEY`가 필요하며 실행 결과나 키를 커밋하지 않습니다.

## Vercel 배포

1. GitHub 저장소를 Vercel 프로젝트에 연결합니다.
2. Production과 Preview에 필요한 환경변수를 각각 등록합니다.
3. `main`을 배포하고 운영 주소에서 로그인·권한·초대 콜백을 확인합니다.
4. 설치형 PWA와 모바일 카메라 선택은 HTTPS 실기기에서 최종 확인합니다.

일일 운영 작업은 [vercel.json](../vercel.json)의 UTC cron 식으로 실행됩니다. 종료된 일정을 완료 처리하고 과거 방식으로 남은 내보내기 파일을 정리합니다. 실행 시간을 바꾸려면 `crons[].schedule`을 수정하고 재배포합니다. 현재 `15 18 * * *`는 매일 UTC 18:15, 한국 시간 다음 날 03:15입니다.

Android 설치형 앱 소스와 빌드/서명/기기 검증 안내는 [android/README.md](../android/README.md)에 있습니다.

메뉴·카드·필터의 상단 이동·조회 상태 배지는 제거했습니다. 상단 진행선과 버튼별 처리 피드백은 유지하고, 페이지 대기에는 스켈레톤을 제공합니다. 비동기 버튼은 처리 상태를 보여주고 중복 제출을 막으며, 실패하면 입력을 보존해 다시 시도할 수 있습니다. 모션 감소 설정에서는 로딩 애니메이션을 멈춥니다.

사진 추가에서는 여러 장을 한 번에 선택할 수 있습니다. 남은 첨부 한도 안에서 순서대로 업로드하며, 중간에 실패해도 성공한 사진은 유지됩니다.


받은 초대는 시작 화면뿐 아니라 상단 워크스페이스 팝업과 `/workspaces`에서도 수락·거절할 수 있습니다. 코치에게도 자신의 워크스페이스와 받은 초대 화면을 제공합니다.


### 회원가입 동의와 보관 정책

공개 문서는 `/terms`, `/privacy`에 있으며 Google 신규 가입 후 `/signup/consent`에서 필수 두 항목을 받습니다. 기존 회원은 재가입을 요구하지 않습니다. 정책 변경 시 문서와 `SIGNUP_POLICY_VERSION`, DB의 허용 버전을 함께 검토하고 과거 동의 문서의 Git 버전을 보존합니다.

기존 일일 cron(`/api/cron/exports`, 한국 시간 03:15)은 삭제 후 30일이 지난 워크스페이스도 정리합니다. `CRON_SECRET`를 사용한 Authorization 헤더 인증이 필수이며 `?dryRun=true`는 쓰기 없이 만료 대상 batch 건수만 확인합니다. 운영 절차는 `docs/signup-consent-rollout.md`를 참조하세요.
