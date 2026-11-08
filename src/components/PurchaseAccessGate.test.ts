import {describe,it,expect,vi,beforeEach} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement as h} from "react";
import type {PurchaseAccessState} from "../../shared/purchase-access";
const fixture=vi.hoisted(()=>({access:null as PurchaseAccessState|null,bridge:{} as object|undefined}));
vi.mock("@/lib/purchase-access",()=>({usePurchaseAccess:()=>({...fixture,setAccess:()=>{}})}));
import {PurchaseAccessGate} from "./PurchaseAccessGate";
describe("purchase-first desktop entry",()=>{
  beforeEach(()=>{fixture.access=null;fixture.bridge={};});
  it("does not mount the workspace or onboarding while checking, unpaid, connecting or revoked",()=>{
    for(const state of [null,{allowed:false,state:"restricted",connected:false,expiresAt:null,issue:null},{allowed:false,state:"connecting",connected:true,expiresAt:null,issue:null},{allowed:false,state:"restricted",connected:true,expiresAt:null,issue:"access_revoked"}] as (PurchaseAccessState|null)[]){
      let mounted=0;const Workspace=()=>{mounted++;return h('p',null,'Workspace and onboarding');};fixture.access=state;
      const html=renderToStaticMarkup(h(PurchaseAccessGate,null,h(Workspace)));
      expect(mounted).toBe(0);expect(html).not.toContain("Workspace and onboarding");
    }
  });
  it("mounts the workspace only after verified active access, and hides it again on denial",()=>{
    fixture.access={allowed:true,state:"active",connected:true,expiresAt:123,issue:null};
    expect(renderToStaticMarkup(h(PurchaseAccessGate,null,h('p',null,'Workspace')))).toContain("Workspace");
    fixture.access={...fixture.access,allowed:false,state:"restricted"};
    expect(renderToStaticMarkup(h(PurchaseAccessGate,null,h('p',null,'Workspace')))).not.toContain("Workspace");
  });
  it("preserves independently authenticated browser and remote-client entry",()=>{
    fixture.bridge=undefined;
    expect(renderToStaticMarkup(h(PurchaseAccessGate,null,h('p',null,'Paired remote')))).toContain("Paired remote");
  });
});
