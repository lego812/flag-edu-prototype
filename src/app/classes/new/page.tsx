import { ClassForm } from "@/features/classes/class-form";
export const metadata = { title: "수업 등록" };
export default function NewClassPage() {
  return <div className="mx-auto max-w-2xl"><h1 className="mb-6 text-3xl font-bold">수업 등록</h1>
    <section className="max-w-2xl border-t border-neutral-200 py-6"><ClassForm /></section>
  </div>;
}
