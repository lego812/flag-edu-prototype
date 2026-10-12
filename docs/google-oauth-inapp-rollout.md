# Google OAuth와 앱 내 워크스페이스 초대

새 가입은 Google만 제공한다. 기존 이메일·비밀번호 로그인과 복구는 유지하며 이메일 인증코드 가입·메일 초대는 제공하지 않는다. 소속이 없어도 `/welcome`에서 받은 초대를 수락·거절하거나 자신의 워크스페이스를 만들 수 있다. 이미 참여한 계정은 상단 `받은 초대`에서 같은 화면에 접근한다.

관리자는 로그인 이메일로 초대를 등록한다. 미가입 이메일에도 등록할 수 있으나 Auth 계정이나 멤버십은 만들지 않는다. 해당 이메일의 인증된 계정만 조회·수락할 수 있고, 수락하면 해당 워크스페이스의 코치 멤버십만 추가한다. 다른 워크스페이스 역할과 기존 비밀번호는 유지한다. 초대는 7일 만료, 거절·취소·초대자 관리자 권한 회수 시 수락 불가다. 재초대는 기존 행의 대기 상태·유효기간을 갱신한다. 수락 재시도는 중복을 만들지 않고 비활성화 후 과거 초대로 복원할 수 없다.

## 운영 준비

1. Google Cloud에서 Web application OAuth 클라이언트를 만든다. 필요한 scopes는 `openid`, `email`, `profile`뿐이다. Authorized JavaScript origin은 `https://flag-edu-prototype.vercel.app`, redirect URI는 `https://vhlrmudatjcgspwltdix.supabase.co/auth/v1/callback`으로 설정한다. Google Audience의 테스트/게시 상태와 허용 계정을 확인한다.
2. Supabase Authentication → Providers → Google에 Client ID와 Secret을 직접 등록하고 활성화한다. Secret은 저장소·채팅·브라우저 환경변수에 넣지 않는다. 앱은 기존 Supabase 공개키만 사용한다.
3. 기존 email provider는 비밀번호 로그인을 위해 유지한다. 공개 가입은 Google 최초 가입이 가능하도록 허용하되, 신규 SQL의 `private.google_signup_only`를 **Before User Created** PostgreSQL Auth Hook으로 반드시 연결한다. 이 훅은 Auth의 신뢰된 `app_metadata.provider`로 Google 신규가입만 허용한다. 이메일/OTP 신규 생성과 다른 공급자·누락 provider는 거절하며 기존 로그인에는 적용되지 않는다. 훅 연결 전에는 Google-only 신규가입 제한이 완성된 것이 아니다. 훅 URI는 `pg-functions://postgres/private/google_signup_only`이다.
4. Site URL은 운영 주소, Redirect allow list에는 운영 `/auth/callback`과 승인된 테스트 원점만 등록한다. Google 시작 버튼은 현재 앱 원점의 `/auth/callback?flow=google`을 사용한다. 실제 Google·provider identity 검증은 Supabase가 담당하며 클라이언트에서 이메일로 사용자를 병합하지 않는다.
5. 사용자 운영 승인 후 `20261012011133_google_oauth_inapp_invitations.sql`을 적용하고 신규가입 훅을 연결한 뒤 이 앱을 배포한다. 기존 활성 프로필·멤버십을 유지하며 기존 pending 멤버십은 활성 관리자가 있는 경우 앱 초대로 옮긴다. 즉시 추가·메일 초대 등록·비밀번호 일괄 활성화 RPC는 차단하므로 구버전 구성원 추가 앱을 오래 유지하지 않는다. 기존 pending 계정은 비밀번호 설정만으로 업무 권한을 얻지 않는다.
6. 전용 Google 계정으로 실제 동의·취소·PKCE·기존 같은 이메일의 자동 identity 연결·다른 이메일 격리·가입 전 초대·수락/거절/취소·만료·기존 비밀번호 로그인을 운영에서 확인한다. Google 공급자와 훅이 준비되기 전에는 운영 완료로 표시하지 않는다.

SMTP나 이메일 템플릿 변경은 필요 없다. 기존 비밀번호 복구 메일은 이전 Auth 공급자의 제한을 그대로 따른다. 메일 초대 CLI는 중단했으며 신규 관리자도 Google로 가입 후 자신의 워크스페이스를 만든다. 기존 계정의 임의 이메일 변경·강제 비밀번호 변경·직접 계정 병합은 수행하지 않는다.

공식 문서: [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook).
