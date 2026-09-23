# Aside CLI로 브라우저 QA 실행

## 준비

1. Node.js 24 이상과 Aside CLI를 설치한다. `aside --help`로 확인한다.
2. Aside 브라우저에서 테스트 계정으로 앱에 직접 로그인한다. 비밀번호는 명령줄이나 시나리오 파일에 넣지 않는다.
3. 별도 터미널에서 `npm run dev`를 실행한다.
4. 로그인한 브라우저와 같은 컴퓨터에서 아래 명령을 실행한다. 스크립트는 `--host local --permission guard`를 사용한다.

로컬 앱도 `.env.local`에 연결된 **원격 Supabase를 사용**한다. 실사용 데이터가 없는 개발 DB와 테스트 계정을 권장한다. 이 스크립트는 환경변수를 읽거나 DB를 초기화하지 않는다.

## 명령

```bash
# 시나리오와 프롬프트만 준비. CLI·네트워크 실행 없음
npm run qa:aside -- --dry-run

# 기본: 조회 전용 smoke 테스트
npm run qa:aside

# 수업/보고서 생성·임시저장·제출·내보내기
npm run qa:aside -- --scenario workflow --allow-writes

# 다른 포트에서 실행 중인 앱
npm run qa:aside -- --url http://localhost:3001

# 제한 시간 변경 (초, 기본 900, 최대 3600)
npm run qa:aside -- --timeout 600
```

Git Bash와 PowerShell 모두 같은 npm 명령을 쓴다. 실행 중 권한 확인이 필요하면 Aside/터미널에서 확인한다. 로그인이나 필수 테스트 데이터가 없으면 `BLOCKED`로 보고하도록 지시한다. 사람 없이 동작하는 CI 도구가 아니다.

CLI가 PATH에 없으면 Windows 표준 설치 경로 `%LOCALAPPDATA%\Aside\CLI\current\aside.exe`도 확인한다. 비표준 설치는 `ASIDE_CLI` 환경변수에 실행 파일의 절대 경로를 지정한다. 쉘 명령이나 옵션을 함께 넣지 않는다.

## 저장된 시나리오

- `qa/aside/smoke.md`: 로고·뒤로가기, 수업/보고서 조회, 읽기 전용, 수업명 필터와 배치
- `qa/aside/workflow.md`: 실행별 `QA-<실행ID>` 데이터 생성, 반복 수업, 인원 휠, 임시저장·제출, 문서 다운로드

시나리오를 수정하면 다음 실행부터 반영된다. 쓰기 테스트는 `--allow-writes` 없이는 시작하지 않는다. 이는 실행 전 보호 장치이며 브라우저 자체의 읽기 전용 권한을 강제하는 것은 아니다. AI의 실제 행동은 지켜보고 범위를 벗어나면 중지한다.

## 결과 읽기

매번 `artifacts/aside/<실행ID>/`에 다음을 저장한다. 이 폴더는 Git에서 제외된다.

- `prompt.md`: 실제로 전달한 대상·규칙·시나리오
- `stdout.log`, `stderr.log`: Aside CLI 출력. 실행 전 실패나 dry-run에는 없을 수 있다.
- `run.json`: 실행 시각, 대상, CLI 종료 코드, timeout/interrupted/completed 등 **실행 상태**

Aside에는 최종 응답에 항목별 `PASS / FAIL / BLOCKED`, 실제 결과와 재현 순서를 남기도록 요청한다. 스크린샷과 다운로드는 Aside가 확보했을 때 경로를 보고하도록 할 뿐, 생성/복사를 보장하지 않는다.

**종료 코드 0은 CLI 완료이지 테스트 통과가 아니다.** 완료 실행의 `verdict`는 항상 `REVIEW_REQUIRED`이다. 로그에서 누락 항목, BLOCKED, 잘못된 판정을 사람이 확인한다. 자동 배포의 통과 조건으로 사용하지 않는다. 로그는 각각 마지막 약 4MiB를 유지하며 잘리면 `logsTruncated`가 true가 된다.

출력이나 화면 증거에 업무 데이터가 포함될 수 있으므로 외부 공유 전 검토한다. 암호·키를 복사하지 않는다. 생성된 QA 데이터는 결과 목록을 확인한 뒤 별도 승인 하에 정리한다. 이 스크립트는 자동 삭제하지 않는다.

## 중단·실패

- 서버에 접속하지 못하면 `npm run dev`와 포트를 확인한다.
- CLI 설치 여부는 `aside --help`로 확인한다.
- `Ctrl+C` 또는 제한 시간 초과 시 CLI 대기를 중단한다. **Aside의 원격/백그라운드 작업까지 중지된다는 뜻은 아니다.**
- `aside session list`에서 해당 실행 ID/프롬프트에 해당하는 세션만 찾고 `aside session stop <id>`로 중지한다. 다른 작업을 중지하지 않는다.
- 테스트 결과를 확인하기 전에 같은 workflow를 재실행하지 않는다. 실행마다 새 접두사를 쓰므로 데이터가 추가로 생성된다.

## 검증 범위

옵션 검증, 쓰기 차단, 프롬프트 구성, CLI 성공/실패/미설치/시간 초과 처리를 가짜 Node 프로세스로 테스트한다. `--dry-run`으로 파일 준비도 확인한다. 실제 Aside 에이전트의 테스트 성공 여부는 별도 실행이 필요하다.

설치된 Aside CLI의 `--help`, `exec --help`, `guide` 기준으로 구현했다. 공식 참고: https://docs.aside.com/help/developers
