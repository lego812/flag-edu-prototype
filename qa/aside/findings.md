# 검토된 발견사항과 수정 이력

현재 실제 Aside 실행으로 검증·등록된 결함은 없음. 이는 결함이 없다는 뜻이 아니다.
원본 실행 결과는 `artifacts/aside/<runId>/`에 보존하고 비밀/개인정보를 제거한 검토 결과만 여기에 옮긴다.

| ID  | 종류 | 요구사항/케이스 | 발견 실행·증거 | 재현·원인 | 상태 | 수정 커밋 | 재검증 실행·결과 |
| --- | ---- | --------------- | -------------- | --------- | ---- | --------- | ---------------- |

상태: REPORTED → REPRODUCED → FIXED_PENDING_RETEST → VERIFIED. 재현 안 됨은 NEEDS_EVIDENCE, 환경 제약은 BLOCKED. 개선 제안은 PROPOSED → APPROVED 뒤에만 구현한다.
결함 ID 예: `<runId>-4-b-B`. 같은 증상의 여러 실행은 별도 결함으로 무한 생성하지 말고 기존 결함에 재현 실행을 연결한다.
코드 수정만으로 VERIFIED 처리하지 않는다. 실제 재검증이 BLOCKED이면 FIXED_PENDING_RETEST 상태를 유지한다.
