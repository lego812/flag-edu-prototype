// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const m = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), single: vi.fn(), eq: vi.fn(), upload: vi.fn(), rpc: vi.fn(), remove: vi.fn(), sign: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: m.auth }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
const id = "10000000-0000-4000-8000-000000000001";
const field = "20000000-0000-4000-8000-000000000001";
const version = "2026-10-13T00:00:00Z";
function request(count=3, options: { origin?: string; invalid?: boolean; size?: number } = {}) {
  const form=new FormData();form.set("field",field);form.set("version",version);
  for(let i=0;i<count;i++)form.append("file",new File([new Uint8Array(options.size ?? 4).fill(options.invalid ? 0 : 255).map((v,j)=>j===1&&!options.invalid?216:v)],"photo.jpg",{type:"image/jpeg"}));
  return new Request(`https://example.com/api/reports/${id}/photos/batch`,{method:"POST",headers:{origin:options.origin ?? "https://example.com"},body:form});
}
const run=(req=request())=>POST(req,{params:Promise.resolve({id})});
beforeEach(()=>{
  vi.resetAllMocks();
  const q={select:vi.fn(),eq:m.eq,single:m.single};q.select.mockReturnValue(q);m.eq.mockReturnValue(q);m.from.mockReturnValue(q);
  m.single.mockResolvedValueOnce({data:{id,template_version_id:"template",class_sessions:{status:"scheduled"}}}).mockResolvedValueOnce({data:{id:field}});
  m.upload.mockResolvedValue({error:null});m.remove.mockResolvedValue({error:null});
  m.rpc.mockImplementation(async(_name,args)=>({data:{attachment:{id:args.p_attachment.storage_path,field_id:field,storage_path:args.p_attachment.storage_path},version:args.p_version+"x"},error:null}));
  m.sign.mockImplementation(async(paths:string[])=>({data:paths.map(path=>({path,signedUrl:"https://example.com/image"}))}));
  m.auth.mockResolvedValue({profile:{id:"coach",role:"coach",organization_id:"org"},supabase:{from:m.from,rpc:m.rpc,storage:{from:()=>({upload:m.upload,remove:m.remove,createSignedUrls:m.sign})}}});
});
describe("bounded photo batch",()=>{
  it("starts all storage transfers concurrently, then serializes revisions and signs once",async()=>{
    const finish: ((v:{error:null})=>void)[]=[];
    m.upload.mockImplementation(()=>new Promise(resolve=>finish.push(resolve)));
    const pending=run();await vi.waitFor(()=>expect(m.upload).toHaveBeenCalledTimes(3));
    expect(m.rpc).not.toHaveBeenCalled();finish[2]({error:null});finish[0]({error:null});finish[1]({error:null});
    const response=await pending;const body=await response.json();
    expect(response.status).toBe(200);expect(body.attachments.map((a:{clientIndex:number})=>a.clientIndex)).toEqual([0,1,2]);
    expect(m.auth).toHaveBeenCalledOnce();expect(m.from).toHaveBeenCalledTimes(2);expect(m.eq).toHaveBeenCalledWith("author_id","coach");
    expect(m.rpc.mock.calls.map(call=>call[1].p_version)).toEqual([version,version+"x",version+"xx"]);
    expect(body.version).toBe(version+"xxx");expect(m.sign).toHaveBeenCalledOnce();expect(m.remove).not.toHaveBeenCalled();expect(m.refresh).toHaveBeenCalledOnce();
  });
  it.each([0,4])("rejects %i files before any storage work",async n=>{expect((await run(request(n))).status).toBe(400);expect(m.upload).not.toHaveBeenCalled();});
  it("rejects cross-origin, invalid JPEG and oversized images",async()=>{
    expect((await run(request(1,{origin:"https://evil.example"}))).status).toBe(403);
    expect((await run(request(1,{invalid:true}))).status).toBe(400);
    expect((await run(request(1,{size:1048577}))).status).toBe(400);expect(m.upload).not.toHaveBeenCalled();
  });
  it("rejects missing access and cancellation before file transfer",async()=>{
    m.single.mockReset().mockResolvedValueOnce({data:null});expect((await run()).status).toBe(403);
    m.single.mockResolvedValueOnce({data:{id,class_sessions:{status:"cancelled"}}});expect((await run()).status).toBe(409);expect(m.upload).not.toHaveBeenCalled();
  });
  it("keeps other successes when one transfer fails and reports original input indices",async()=>{
    m.upload.mockResolvedValueOnce({error:null}).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({error:null});
    const body=await (await run()).json();expect(body.attachments.map((a:{clientIndex:number})=>a.clientIndex)).toEqual([0,2]);expect(body.error).toContain("실패");
    expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.remove.mock.calls[0][0]).toEqual([m.upload.mock.calls[1][0]]);
  });
  it("stops on a stale revision, preserves earlier commits and only cleans uncommitted files",async()=>{
    m.rpc.mockResolvedValueOnce({data:{attachment:{id:"first",storage_path:"first"},version:"own-version"}}).mockResolvedValueOnce({error:{code:"PT409"}});
    const body=await (await run()).json();expect(body.version).toBe("own-version");expect(body.attachments).toHaveLength(1);expect(body.error).toContain("변경됐습니다");
    expect(m.rpc).toHaveBeenCalledTimes(2);expect(m.remove.mock.calls[0][0]).toEqual(m.upload.mock.calls.slice(1).map(c=>c[0]));
  });
  it("returns 409 without a revision when the first DB write conflicts",async()=>{
    m.rpc.mockResolvedValue({error:{code:"PT409"}});const response=await run();expect(response.status).toBe(409);expect(await response.json()).not.toHaveProperty("version");expect(m.remove.mock.calls[0][0]).toHaveLength(3);
  });
  it("does not delete a file whose RPC outcome is unknown",async()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    m.rpc.mockResolvedValue({error:{code:"",message:"network"}});const response=await run();expect(response.status).toBe(400);expect((await response.json()).error).toContain("저장 결과");expect(m.remove.mock.calls[0][0]).toEqual(m.upload.mock.calls.slice(1).map(c=>c[0]));log.mockRestore();
  });
  it("keeps successful mutations visible even when signing fails",async()=>{
    m.sign.mockRejectedValue(new Error("offline"));const response=await run();expect(response.status).toBe(200);expect((await response.json()).attachments).toHaveLength(3);expect(m.remove).not.toHaveBeenCalled();
  });
});
