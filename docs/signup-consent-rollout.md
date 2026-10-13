# 회원가입 필수 동의와 30일 워크스페이스 보관

사용자 결정: 마케팅 동의 제외, 신규 Google 가입에 필수 동의만 제공. 책임자 박다빈, 문의 davin990812@gmail.com. 삭제 워크스페이스는 30일 보관 후 영구 삭제한다. 다른 서비스 문서의 복제본이 아니라 현재 기능과 확정 정보를 바탕으로 작성했다.

## 동의와 접근

- `/terms`·`/privacy`는 공개 문서, `/signup/consent`는 인증된 미완료 계정용이다. Google 인증 후 `/welcome`의 서버 계정 검사에서 미동의 계정을 보낸다. 미동의 계정의 직접 `/dashboard`·server action/API도 공통 검사로 차단한다.
- `ensure_my_profile`은 DB 동의 검사 후에만 새 프로필을 생성하며 이를 호출하는 workspace 생성/초대 수락도 차단한다. Google identity·verified email 검사는 유지한다.
- 두 체크박스는 기본 해제, 각각 문서를 새 창에서 읽을 수 있다. 버전·두 boolean을 서버에서 검증하며 DB RPC는 auth.uid와 now()만 사용한다. 중복 요청은 최초 동의 시각을 유지한다. 직접 테이블 쓰기와 다른 회원 조회는 불가하다.
- `private.signup_existing_accounts`는 migration 실행 시 이미 존재하는 계정의 적용 제외 snapshot이다. 이 행은 동의 증거가 아니다. 신규 계정 metadata로 이 상태를 만들 수 없다. 미래 약관 재동의 기능은 이번 범위에 포함하지 않는다.
- 동일 버전 문구를 임의 덮어쓰지 않는다. 문서 변경 시 새 버전 및 과거 Git 문서 snapshot을 보존하고 고지/재동의 필요성을 검토한다.

## 정리와 복원

- 기존 일일 Vercel cron(UTC 18:15)에 정리를 추가했다. CRON_SECRET와 server-only secret key가 필요하다. `?dryRun=true`는 만료 대상 최대 10개 batch의 건수만 조회한다.
- DB의 now()로 30일 경계를 검사한다. begin은 organization lock 아래 만료를 재검사하고 purge_started_at을 고정한다. 이 시점 이후 deleted_at·purge_started_at을 되돌리는 UPDATE는 거절한다.
- Storage.objects를 읽어 `workspaceUUID/`에 속한 report-images/report-exports 파일을 100개씩 조회한다. orphan 파일도 포함한다. 파일 삭제는 반드시 Storage API로 실행한다. metadata SQL DELETE로 실파일 정리를 대신하지 않는다.
- 파일 목록을 앞에서 반복 조회하므로 offset 이동으로 파일을 건너뛰지 않는다. 35초·workspace별 20 batch·1회 workspace 10개 제한 후 다음 호출에서 이어간다. 파일 실패 시 해당 workspace DB는 남는다. 오류 batch는 cron 500으로 보고하고 다른 대상은 계속한다.
- finish는 만료·purge_started·남은 Storage object 없음·삭제 workspace를 선택 중인 profile 없음 조건을 재검사한다. report graph→일정→수업→양식→organization 순으로 DB transaction에서 삭제한다. 취소 수업·published template의 기존 trigger를 비활성화하지 않는다. Auth 계정·프로필·다른 workspace 파일/레코드는 삭제하지 않는다.
- 복구 요청은 문의 이메일로 접수한다. 운영자가 본인 및 관리자 권한을 검증하고, 30일 미만이며 purge_started_at이 NULL인지 확인한 뒤 삭제 표시와 명시적 membership/선택을 복구한다. 과거 초대는 자동 재발송하거나 재활성화하지 않는다. 복원 UI는 없다.
- 계정 탈퇴는 별도 문의 처리다. 공동 기록의 권리·법적 보관 의무와 개인 식별정보를 구분하고 처리한다. 계정 삭제가 조직 전체 데이터 파기로 이어지지 않도록 한다.

## 적용과 검증

1. 사전 테스트와 빌드를 확인한다. 두 migration을 순서대로 적용하고 이력 버전을 저장소와 맞춘다. 적용 자체는 workspace나 파일을 삭제하지 않는다. 신규 가입 gate가 먼저 적용되므로 곧바로 준비된 코드 배포를 이어간다.
2. 사용자 승인된 main 병합·운영 배포 후 공개 약관 링크, 기존 QA 로그인, cron 무인증 거절과 인증된 dryRun을 확인한다.
3. 운영 DB 검증은 tagged QA 계정에 대한 transaction rollback만 사용한다. 기존 계정 exemption을 transaction 안에서만 제외하여 신규 gate와 동의 저장/중복 방지를 검사한다. 기존 운영 데이터의 만료 날짜를 바꾸거나 실제 파일을 지워 시험하지 않는다.
4. Google 계정 선택/취소·실제 신규 가입 브라우저 E2E와 HTTP·unit/DB 검증은 구분한다. 운영 테스트 로그는 저장소 밖 artifact에 보관한다.

## 참고 자료 및 실제 설정

- 개인정보보호법 제30조: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025127653
- 개인정보보호법 제28조의8: https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334951
- 개인정보 포털 작성지침/표준안 목록: https://www.privacy.go.kr/front/bbs/bbsList.do?bbsNo=BBSMSTR_000000000049
- Supabase 실제 프로젝트 region은 ap-northeast-2 (서울), 2026-10-12 MCP 조회.
- Supabase 운영/지원 국외 처리: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Vercel 개인정보 안내: https://vercel.com/legal/privacy-notice

문서는 앱의 공개 안내이며 법률 검토 완료를 의미하지 않는다. 공급업체의 국가·수탁업체·보존 설정이 바뀌면 공개 고지도 실제 처리와 함께 갱신한다. Google Cloud OAuth Branding의 홈페이지/개인정보처리방침/약관 URL도 운영자가 공개 주소에 맞춰 등록해야 한다.
