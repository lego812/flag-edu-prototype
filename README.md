# Flag Edu

코치가 수업별 보고서를 작성하고 관리자가 확인·취합하는 모바일 우선 PWA입니다.
Next.js 애플리케이션은 Vercel에 배포하고, 인증·데이터베이스·파일 저장은
Supabase를 사용합니다.

## 기술 구성

- Next.js App Router, React, TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, Storage
- 설치형 PWA
- Vitest, Testing Library
- Vercel 배포

## 로컬 실행

Node.js 24 이상과 npm이 필요합니다.

```bash
npm install
copy .env.example .env.local
npm run dev
```

`.env.local`에 개발 Supabase 프로젝트 값을 입력합니다.

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SECRET_KEY=your-server-only-secret-key
```

`SUPABASE_SECRET_KEY`는 관리자 초대 API를 위한 서버 전용 값입니다. 절대로
`NEXT_PUBLIC_` 접두사를 붙이지 않습니다. DB 비밀번호, Secret key 및 기존
`service_role` 키는 브라우저 코드나 저장소에 넣지 않습니다.

## 검증

Aside 브라우저 테스트는 `npm run qa:aside`로 실행합니다. 기본은 조회 전용입니다.
설정·데이터 생성 테스트·결과 확인은 [Aside QA 안내](docs/aside-qa.md)를 참고하세요.

```bash
npm run lint
npm test
npm run build
```

환경변수가 없으면 초기 화면에 누락된 변수 이름이 표시됩니다. 실제 Supabase
기능을 호출하려면 `.env.local` 설정이 필요합니다.

## Supabase 마이그레이션

초기 스키마는
`supabase/migrations/202609220001_initial_schema.sql`에 있습니다. Supabase CLI로
개발 프로젝트에 연결한 뒤 적용합니다.

```bash
npx supabase login
npx supabase link --project-ref vhlrmudatjcgspwltdix
npx supabase db push
```

적용 전 `npx supabase db diff --linked` 등으로 대상 프로젝트를 확인하세요. 이
마이그레이션은 아직 원격 개발 DB에 적용하지 않았습니다.

## Vercel 배포

1. 이 GitHub 저장소를 Vercel 프로젝트로 가져옵니다.
2. Production과 Preview 환경에 두 Supabase 환경변수를 등록합니다.
3. 기본 Next.js 빌드 설정으로 배포합니다.
4. HTTPS 배포 주소에서 홈 화면 설치와 카메라 권한을 확인합니다.

서비스 워커는 프로덕션 빌드에서만 등록됩니다. Android에서는 브라우저의 설치
메뉴를, iPhone에서는 Safari의 `공유 → 홈 화면에 추가`를 사용합니다.

## 계정 정책

### 초대 재발송과 검증

- 재발송 오류나 발송 한도 초과가 발생해도 Auth 사용자와 프로필을 삭제하지 않습니다.
- 이메일 인증 전에는 초대 메일, 인증 후 비밀번호 설정 대기 상태에는 비밀번호 설정 메일을 요청합니다.
- 관리자의 같은 기관 활성 구성원에 대해서만 재발송합니다.
- 초대 콜백은 링크의 인증 정보를 한 번만 처리하며, 인증 정보가 없는 링크는 기존 로그인 세션으로 대체하지 않습니다.
- 신규 초대 후 프로필 저장이 실패하면 사용자 삭제 없이 오류를 반환합니다. 운영자는 해당 Auth UID와 기관을 확인해 누락 프로필을 복구해야 합니다.

운영 전 Custom SMTP와 정확한 Site URL/Redirect URL을 설정하고 새 메일로 초대 수락 → 비밀번호 설정 → 로그아웃 → 재로그인을 검증합니다.
자동 테스트는 발송 한도, 기관/관리자 권한, 계정 보존, 콜백 중복 실행 및 만료 오류를 모의 검증합니다. 실제 메일 도착을 보장하지는 않습니다.

MVP는 공개 회원가입을 제공하지 않습니다. 최초 기관·관리자는 관리 절차로
부트스트랩하고, 이후 코치는 관리자가 앱의 구성원 화면에서 이메일로 초대합니다.

### 인증 대시보드 설정

Supabase의 Authentication 설정에서 공개 회원가입을 끄고 URL Configuration에
다음을 등록합니다.

```text
Site URL: 운영 Vercel URL (배포 전에는 http://localhost:3000)
Redirect URL: http://localhost:3000/**
Redirect URL: https://<Vercel 프로젝트 주소>/**
```

초대 메일은 관리자 세션과 `profiles.role = 'admin'`을 확인한 서버 액션만 전송할
수 있습니다. 초대받은 코치는 링크에서 비밀번호를 만든 뒤 로그인합니다.

### 최초 기관과 관리자

초대 기능을 처음 사용하려면 초기 마이그레이션 적용 후 Supabase Dashboard의
`Authentication → Users`에서 최초 사용자 한 명을 생성합니다. 해당 User UID로
SQL Editor에서 기관과 관리자 프로필을 연결합니다.

```sql
begin;

with new_organization as (
  insert into public.organizations (name)
  values ('Flag Edu')
  returning id
)
insert into public.profiles (id, organization_id, name, role, status)
select
  '<AUTH_USER_UUID>'::uuid,
  id,
  '관리자',
  'admin'::public.member_role,
  'active'::public.member_status
from new_organization;

commit;
```

이 부트스트랩 작업 이후의 코치 계정은 앱의 `구성원 관리`에서 초대합니다.
최초 관리자와 초대받은 코치는 첫 로그인 또는 초대 링크 진입 시 새 비밀번호를
설정해야 하며, 완료 전에는 업무 화면에 접근할 수 없습니다.

같은 작업은 로컬의 서버 환경변수를 사용해 다음 명령으로 실행할 수도 있습니다.

```bash
npm run bootstrap:admin -- <AUTH_USER_UUID>
```

기존 프로필과 기관을 확인하므로 명령을 다시 실행해도 중복 생성하지 않습니다.
