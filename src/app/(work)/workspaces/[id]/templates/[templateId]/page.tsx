import { notFound } from "next/navigation";
import { requireTemplateWorkspace } from "@/features/templates/workspace";
import { templatePath } from "@/features/templates/paths";
import Link from "@/components/feedback-link";
import { getTemplate } from "@/features/reports/repository";
import { TemplateEditor } from "@/features/templates/editor";
import { isUuid } from "@/features/classes/model";
export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id, templateId } = await params;
  const { workspace, supabase } = await requireTemplateWorkspace(id);
  if (!isUuid(templateId)) notFound();
  const template = await getTemplate(supabase, templateId, id);
  return (
    <>
      <Link href={templatePath(id)} className="text-sm underline">보고서 양식 목록</Link>
      <p className="break-words text-sm text-neutral-600">워크스페이스: {workspace.name}</p>
      <h1 className="text-2xl font-bold">
        {template.name}
        {template.status !== "draft" ? " · 수정" : " · 수정 중"}
      </h1>
      <TemplateEditor template={template} workspaceId={id} />
    </>
  );
}
