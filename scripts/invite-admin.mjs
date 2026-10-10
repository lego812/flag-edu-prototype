// Retired: the old CLI created a pending admin membership before acceptance
// and deleted Auth accounts on failure. Use the scoped application workflow.
throw new Error(
  "관리자 초대 CLI는 이메일 수락 방식으로 대체되었습니다. 앱의 구성원 관리에서 이메일로 초대하고, 수락 후 관리자 역할로 변경하세요. 최초 관리자는 회원가입 후 자신의 워크스페이스를 만들 수 있습니다.",
);
