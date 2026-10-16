import { LegalDocument } from "@/features/auth/legal-document";
import { PRIVACY_CONTACT } from "@/features/auth/legal-policy";

export const metadata = { title: "개인정보처리방침" };
export default function PrivacyPage() {
  return (
    <LegalDocument title="개인정보처리방침">
      <p>
        Flag Edu 운영자 박다빈은 회원의 개인정보를 아래와 같이 처리합니다.
        개인정보 보호책임자는 박다빈이며, 열람·정정·삭제·처리정지·동의 철회·회원
        탈퇴 및 고충 문의는{" "}
        <a className="underline" href={`mailto:${PRIVACY_CONTACT}`}>
          {PRIVACY_CONTACT}
        </a>
        로 접수합니다.
      </p>
      <section id="signup-consent" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-bold">
          1. 회원가입 개인정보 수집·이용 동의
        </h2>
        <dl className="space-y-3 rounded-lg border p-4">
          <div>
            <dt className="font-bold">필수 항목</dt>
            <dd>
              이름(표시 이름), 이메일 주소, Google 계정 식별정보, 이메일 인증
              여부, 서비스 회원 식별자, 동의 문서 버전과 동의 시각
            </dd>
          </div>
          <div>
            <dt className="font-bold">이용 목적</dt>
            <dd>
              회원 식별·로그인, 계정 관리, 이메일에 연결된 앱 내 초대 확인,
              워크스페이스 권한 관리, 가입 의사와 동의 내역 확인
            </dd>
          </div>
          <div>
            <dt className="font-bold">보유·이용 기간</dt>
            <dd>
              회원 탈퇴 시까지. 탈퇴 요청을 처리하면 목적을 달성한 계정 정보와
              동의 기록은 지체 없이 파기합니다. 법령상 별도 보존 의무가 있는
              경우 해당 근거와 기간에 따라 분리 보관합니다.
            </dd>
          </div>
          <div>
            <dt className="font-bold">동의 거부 권리와 영향</dt>
            <dd>
              동의를 거부할 수 있으나, 필수 항목에 동의하지 않으면 회원가입을
              완료할 수 없습니다.
            </dd>
          </div>
        </dl>
        <p>
          Google 인증 과정에서 인증 공급자의 기본 프로필 정보(예: 프로필 이미지
          URL)가 인증 시스템에 전달될 수 있습니다. 서비스는 Google 비밀번호를
          받지 않으며, 프로필 이미지를 회원가입 필수 입력으로 요구하지 않습니다.
          인증 후 가입을 완료하기 전에도 인증 계정 정보는 생성될 수 있으며,
          가입을 원하지 않으면 위 이메일로 삭제를 요청할 수 있습니다.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. 서비스 이용 중 처리하는 정보</h2>
        <p>
          워크스페이스 이름·참여자·역할·초대 이메일과 상태, 회원이 입력한
          수업·일정·보고서·답변 및 업로드한 사진·파일 정보를 서비스 제공과 공동
          업무 기록 관리를 위해 처리합니다. 보고서와 사진에 포함할 내용은 회원이
          선택하며, 타인의 정보를 입력할 때에는 적법한 처리 근거를 확보해야
          합니다.
        </p>
        <p>
          로그인 유지·보안·오류 대응을 위해 인증 쿠키, 접속 IP, 접속 시각,
          기기·브라우저 및 오류 정보가 인증·호스팅 제공업체에서 처리될 수
          있습니다. 기존 비밀번호 로그인 계정의 비밀번호는 인증 제공업체에서
          해시 형태로 관리합니다. 마케팅 목적의 정보 수집이나 마케팅 동의는
          운영하지 않습니다.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">고객센터 문의</h2>
        <p>
          고객센터에 직접 등록한 문의 제목·내용·작성 및 수정 시각을 계정에
          연결하여 문의 확인과 이용 지원을 위해 처리합니다. 작성자 본인과
          운영자(master)만 조회하며, 운영자는 작성자의 이름과 이메일을 함께
          확인합니다. 문의글은 워크스페이스와 별도로 계정에 보관하고, 회원
          탈퇴에 따른 계정 삭제 시 함께 삭제합니다.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. 보관과 파기</h2>
        <p>
          워크스페이스의 업무 기록은 서비스 제공 기간 동안 보관합니다.
          나가기·참여 제외·계정 탈퇴만으로 공동 업무 기록 전체가 삭제되지는
          않습니다. 해당 기록 속 개인정보에 대한 삭제 등 요청은 본인 여부와 다른
          참여자의 권리 및 법적 보존 의무를 확인해 처리합니다.
        </p>
        <p>
          워크스페이스를 삭제하면 즉시 접근을 차단하고, 복구 요청 대응을 위해
          관련 수업·보고서·사진을 삭제일로부터 30일간 보관한 뒤 영구 삭제합니다.
          정리 작업은 매일 실행하며, 30일이 지난 기록부터 순차 처리합니다.
          장애로 정리가 지연된 경우 접근 차단을 유지하고 정리 작업을
          재시도합니다.
        </p>
        <p>
          전자 기록은 데이터베이스와 파일 저장소에서 삭제합니다. 제공업체의
          백업·보안 로그는 해당 업체의 보존 주기에 따라 만료되며 정상 서비스
          조회에 사용하지 않습니다. 복구 시에는 이미 접수한 삭제 요청을 다시
          반영합니다. 종이로 출력하여 보관하는 자료가 있다면 분쇄 등 복구할 수
          없는 방법으로 파기합니다.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">4. 공동 이용과 처리 위탁</h2>
        <p>
          참여한 워크스페이스의 다른 참여자와 관리자는 서비스 권한에 따라
          이름·역할·업무 기록을 조회할 수 있고, 관리자는 초대 이메일 및 보고서
          내보내기 기능을 이용할 수 있습니다. 운영자는 별도 동의나 법령상 근거
          없이 회원의 정보를 외부에 판매하거나 마케팅 목적으로 제공하지
          않습니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Supabase Pte. Ltd. 및 인프라 제공업체: 회원 인증, 데이터베이스, 사진
            등 파일 저장 및 보안 운영
          </li>
          <li>
            Vercel Inc. 및 인프라 제공업체: 웹앱 호스팅, 요청 처리, 서비스 전송
            및 오류 대응
          </li>
        </ul>
        <p>
          Google 로그인은 Google의 계정 인증 서비스를 이용합니다. Google 자체
          서비스의 정보 처리는{" "}
          <a className="underline" href="https://policies.google.com/privacy">
            Google 개인정보처리방침
          </a>
          에 따릅니다.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">5. 국외 처리 안내</h2>
        <p>
          서비스 제공 계약의 체결·이행에 필요한 인증·저장·호스팅 처리위탁을 위해
          서비스 이용 시 암호화된 네트워크로 정보가 전달됩니다. 국외 처리 중단을
          원하면 문의 이메일로 요청할 수 있으나, 필수 인증·호스팅 처리가
          중단되면 서비스 이용이 제한되거나 탈퇴 처리가 필요할 수 있습니다.
        </p>
        <ul className="list-disc space-y-3 pl-5">
          <li>
            Supabase Pte. Ltd. / Supabase, Inc.: 기본 데이터베이스·파일 저장
            지역은 대한민국 서울입니다. 운영·지원에 필요한 경우
            싱가포르·미국에서 접근·처리될 수 있습니다. 항목은 인증·회원 정보와
            저장한 업무 기록·사진이며, 인증·보관·운영 지원 목적으로 처리합니다.
            보유기간은 위 보관·파기 기준과 위탁 계약 종료 시 삭제 절차에
            따릅니다. 연락처: privacy@supabase.com.{" "}
            <a
              className="underline"
              href="https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq"
            >
              국외 처리 안내
            </a>
          </li>
          <li>
            Vercel Inc.: 미국을 포함한 글로벌 호스팅·전송 인프라에서 접속
            IP·요청 정보·인증 쿠키 및 요청 처리에 필요한 계정·업무 데이터를
            처리합니다. 웹앱 제공·전송·보안·오류 대응을 위한 처리이며, 요청
            데이터는 처리에 필요한 동안, 운영 로그는 제공업체의 설정·보존 주기에
            따라 보관됩니다. 연락처: privacy@vercel.com. 처리 위치와 수탁업체의
            상세 내용은{" "}
            <a
              className="underline"
              href="https://vercel.com/legal/sub-processors"
            >
              수탁업체 목록
            </a>
            과{" "}
            <a
              className="underline"
              href="https://vercel.com/legal/privacy-notice"
            >
              개인정보 안내
            </a>
            에서 확인할 수 있습니다.
          </li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">6. 권리 행사와 보호 조치</h2>
        <p>
          회원은 문의 이메일을 통해 자신의 개인정보에 관한
          열람·정정·삭제·처리정지·동의 철회 및 탈퇴를 요청할 수 있습니다.
          법정대리인 또는 위임받은 대리인도 증빙을 갖춰 요청할 수 있습니다.
          운영자는 본인 또는 대리인 확인 후 관련 법령에 따라 처리하며, 제한
          사유가 있으면 안내합니다.
        </p>
        <p>
          워크스페이스별 접근 권한, 관리자 권한 제한, 암호화된 통신, 비공개 사진
          저장소 및 접근 시간이 제한된 사진 링크를 사용합니다. 인증 쿠키를
          차단하거나 삭제할 수 있으나 로그인 유지에 제한이 생길 수 있습니다.
        </p>
        <p>
          침해 상담은 개인정보침해 신고센터(국번 없이 118, privacy.kisa.or.kr),
          분쟁 조정은 개인정보분쟁조정위원회(1833-6972, kopico.go.kr)를 이용할
          수 있습니다.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold">7. 방침 변경</h2>
        <p>
          처리방침이 변경되면 변경 내용과 시행일을 서비스 내에서 안내하며, 추가
          동의가 필요한 변경은 별도 동의를 받습니다.
        </p>
      </section>
    </LegalDocument>
  );
}
