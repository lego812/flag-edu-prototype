import { requireTemplateWorkspace } from "@/features/templates/workspace";
import { templatePath } from "@/features/templates/paths";
import Link from "@/components/feedback-link";
import { TemplateEditor } from "@/features/templates/editor";
export default async function NewTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireTemplateWorkspace(id);
  return (
    <>
      <Link href={templatePath(id)} className="text-sm underline">보고서 양식 목록</Link>
      <p className="break-words text-sm text-neutral-600">워크스페이스: {workspace.name}</p>
      <h1 className="text-2xl font-bold">새 보고서 양식</h1>
      <TemplateEditor workspaceId={id} />
    </>
  );
}
