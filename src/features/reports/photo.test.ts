import { afterEach,describe,it,expect,vi } from "vitest";
import { compressPhoto } from "./photo";
afterEach(()=>vi.restoreAllMocks());
describe("photo preprocessing",()=>{
  it("rejects non-images and oversized input before decoding",async()=>{
    await expect(compressPhoto(new File(["not an image"],"file.txt",{type:"text/plain"}))).rejects.toThrow();
    const image=new File(["x"],"large.jpg",{type:"image/jpeg"});Object.defineProperty(image,"size",{value:26*1024*1024});await expect(compressPhoto(image)).rejects.toThrow();
  });
  it("cleans up object URLs when the browser cannot decode a photo",async()=>{
    const revoke=vi.fn();vi.stubGlobal("URL",{createObjectURL:()=>"blob:test",revokeObjectURL:revoke});
    vi.stubGlobal("Image",class{src="";decode(){return Promise.reject(new Error("unsupported"));}});
    try{await expect(compressPhoto(new File(["x"],"photo.heic",{type:"image/heic"}))).rejects.toThrow("JPG 또는 PNG");expect(revoke).toHaveBeenCalledWith("blob:test");}finally{vi.unstubAllGlobals();}
  });
});
