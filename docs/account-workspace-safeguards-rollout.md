# 계정·보고서·참여 상태·운영 기록 보완

사용자는 미저장 내용 보호, 오류 로그, 무소속 계정 관리, 버튼 통일을 승인했다. Google 신규 가입은 사용자가 정상 동작을 확인했으며 자동 E2E 실행으로 대신하지 않는다. 내보내기와 비활성은 별도 상태로 구분한다.

## 보고서 이동 보호

root NavigationGuardProvider와 보고서 등록을 통해 메뉴 링크(Next Link onNavigate), 앱 상단 뒤로가기, 워크스페이스 전환 form을 보호한다. 계속 작성/팝업 취소는 이동 없이 입력을 유지하고, 명시적 이동만 실행한다. 워크스페이스 변경은 확인 전에 Server Action을 실행하지 않으며 submitter 값을 보존한다. 답변·사진 저장 중에는 이동을 막는다. 성공한 저장 payload에서 dirty를 해제하고 실패는 유지한다. layout effect로 저장 상태와 guard를 paint 전에 맞춘다.

새로고침/탭 종료 beforeunload를 유지한다. 새 탭·외부 링크·다운로드는 Next onNavigate의 적용 대상과 구분한다. 브라우저 자체 뒤로가기·모바일 뒤로가기 제스처는 별도 실기기 검증 대상이며 앱의 BackButton 확인 결과를 그 경로의 PASS로 보고하지 않는다. 다른 탭의 권한/워크스페이스 변화는 기존 서버 재검사·강제 동기화 정책을 유지하며 이전 입력을 새 workspace로 자동 저장하지 않는다.

## 계정 접근

`/manage/account` URL을 유지하면서 활성 workspace가 필요한 route group 밖으로 옮긴다. 가입 완료·인증 계정은 소속 0개여도 본인 계정·로그아웃·약관·개인정보/탈퇴 문의를 조회한다. 소속 없는 시작 화면에 링크를 제공한다. 활성 workspace가 있으면 기존 app header를 사용한다. 업무 페이지는 requireCurrentProfile의 활성 멤버십 검사를 유지한다. 계정/회원 삭제 API를 추가하지 않는다.

## 참여 상태

- active: 정상 참여와 업무 접근.
- inactive: 일시 접근 중지. 관리자 directory에서 표시하고 권한 form으로 재활성화한다. 코치는 active directory만 조회한다. 본인 비활성과 마지막 활성 관리자 보호를 유지한다.
- removed: 내보내기/나가기/전체 workspace 삭제에 따른 참여 종료. directory에서 숨기고 일반 role/status 요청으로 재활성화하지 않는다. 본인이 새 초대를 수락하면 다시 참여할 수 있다.

기존 inactive에는 해제 이유가 없어 사용자가 모두 removed로 이전하기로 선택했다. 사전 운영 조회 결과 해당 멤버십은 1개이고 즉시 영구 삭제 대상은 0개다. 계정·프로필·보고서는 삭제하지 않는다. 임시 inactive 대상의 오래된 초대 수락은 재활성화 우회가 되므로 거절한다. 비활성 인원도 관리자 내보내기가 가능하다.

적용은 enum migration을 별도로 commit한 후 참여 상태 migration을 적용한다. 같은 transaction에서 새 enum 값을 참조하지 않는다. 기존 권한/마지막 관리자/선택 scope/lock 순서를 유지한다. 코드 rollback 전에 DB의 removed 상태를 무작정 inactive로 되돌리지 않는다. 직접 멤버십 복구는 명시적 운영 판단이 필요하다.

## 운영 로그와 정리

private.maintenance_failures에 실행 UUID·시각·stage·workspace UUID·안전한 error code만 저장한다. 클라이언트는 표를 읽거나 RPC를 실행할 수 없고 service role만 기록한다. 원본 exception message, 파일 경로/이름, 보고서 답변, 이메일, 토큰은 기록하지 않는다. 로그 DB 저장 실패 자체는 안전한 서버 로그로 남긴다. 실행 ID로 Vercel 서버 로그와 DB 기록을 연결한다.

export 정리와 일정 완료는 각자의 try/catch로 병렬 실행하여 한 작업 오류가 retention을 건너뛰게 하지 않는다. cron 전용 SDK 요청 timeout은 5초이며 기존 다른 server-only client는 timeout 설정을 바꾸지 않는다. retention은 35초/1회 최대 10workspace/각 최대 20batch를 유지한다. 시도한 workspace의 purge_last_attempt_at을 갱신하고 미시도/오래된 시도를 우선하여 반복 실패가 새 대상을 막지 않도록 한다. 실패와 시간/batch 제한 deferred를 구분해 응답한다. 파일 먼저, 업무 DB 마지막 원칙과 재시도/삭제 시점 검사를 유지한다.

## 검증 및 운영 적용

1. 전체 regression/lint/TypeScript·build, 미저장 취소/확정·저장 중·실패/성공·메뉴/앱 뒤로가기·switch action, 무소속 account, 상태/접근/재가입/legacy 이전, log 권한/안전성/재시도 순서를 로컬 fixture에서 검사한다.
2. enum → 상태 → 로그 migration 순서로 운영 DB 적용하고 이력 version을 저장소에 맞춘다. 이 단계는 membership 분류만 변경하고 workspace/실파일을 삭제하지 않는다.
3. 승인된 main 병합·Vercel Production 성공을 확인한다.
4. tagged QA 계정만의 조회/transaction rollback으로 상태 변화·로그·권한을 점검한다. 기존 사용자 계정·업무 데이터를 정지/삭제해 시험하지 않는다. 실제 Storage 파일은 지우지 않는다.
5. HTTP 검증은 tagged QA의 본인 session만 생성하고 종료한다. 무소속 fixture가 가입 완료·verified 상태인지 확인한다. cron은 인증된 dryRun만 호출한다. 실제 browser interaction·Google auth·실기기 검증과 HTTP/DOM 결과를 구분한다.

자동 로그 알림/제품 내 알림은 추가하지 않는다. 운영자가 오류 기록을 조회해 대응하며 알림 기능은 이전 보류 결정을 유지한다.

운영 오류 조회는 Supabase SQL Editor에서 다음 읽기 쿼리로 확인한다. 애플리케이션의 일반 관리자에게 전체 workspace 오류 접근 권한을 부여하지 않는다.

```sql
select occurred_at, stage, workspace_id, error_code, run_id
from private.maintenance_failures
order by occurred_at desc
limit 100;
```

실제 Chromium 검증은 로컬 production build에서 수행했다. 무소속 tagged QA 계정의 정보/로그아웃 취소/버튼을 확인했고, 수정 가능한 운영 QA 보고서가 없어 disposable 로컬 예제에 실제 ReportEditor·Next Link·BackButton·GuardedNavigationForm을 연결하여 메뉴/뒤로가기 Escape/전환 취소/확정 이동을 확인했다. 예제 route는 제거하고 일반 production build를 다시 수행했으며 운영 보고서는 저장하지 않았다. 이미지 요청은 해당 navigation 검증에서 비활성화했고 사진/실기기 검증 PASS로 해석하지 않는다.
