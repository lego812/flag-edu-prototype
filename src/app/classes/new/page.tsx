import { ClassForm } from "@/features/classes/class-form";
export const metadata = { title: "수업 등록" };
export default function NewClassPage() {
  return <div className="mx-auto max-w-2xl"><h1 className="mb-6 text-3xl font-bold">수업 등록</h1>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><ClassForm /></section>
  </div>;
}
