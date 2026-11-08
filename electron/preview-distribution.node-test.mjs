import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import {PURCHASE_AUTHORITY,validateAuthority,purchaseProtocol} from "./purchase-authority.mjs";
import {callback} from "./purchase-wire.mjs";
import {configureProductIdentity} from "./product-identity.mjs";
import builder from "../scripts/preview-builder.mjs";
const preview=JSON.parse(readFileSync(new URL("../build/preview-authority.json",import.meta.url),"utf8"));
test("the preview uses real pinned public keys while the production release guard stays closed",()=>{
  validateAuthority(preview);
  assert.equal(PURCHASE_AUTHORITY.environment,"production");
  assert.throws(()=>validateAuthority(),/access_unavailable/);
  for(const key of [...preview.onlineKeys,...preview.leaseKeys])assert.equal(Object.hasOwn(key,"d"),false);
});
test("preview and production callbacks cannot be exchanged",()=>{
  const query=`?request_id=11111111-1111-4111-8111-111111111111&code=${"A".repeat(43)}&state=${"A".repeat(43)}`;
  for(const [authority,wrong] of [[preview,"spdbot:"],[PURCHASE_AUTHORITY,"spdbot-preview:"]]){
    assert.equal(callback(`${purchaseProtocol(authority)}//auth/callback${query}`,purchaseProtocol(authority)).code,"A".repeat(43));
    assert.throws(()=>callback(`${wrong}//auth/callback${query}`,purchaseProtocol(authority)),/invalid_callback/);
  }
});
test("preview credentials, session profile and Windows app identity remain separate",()=>{
  const paths={appData:path.resolve("fixture"),userData:""};const calls=[];
  const app={getPath:k=>paths[k],setPath:(k,v)=>{paths[k]=v;},setName:v=>calls.push(v),setAppUserModelId:v=>calls.push(v)};
  configureProductIdentity(app,"win32",[],preview);
  assert.equal(paths.userData,path.join(paths.appData,"SPDBot Preview"));
  assert.equal(paths.sessionData,paths.userData);
  assert.deepEqual(calls,["SPDBot Preview","de.spdlabs.spdbot.preview"]);
});
test("preview installer has its own install identity and protocol and publishes no stable updater feed",()=>{
  const config=builder();assert.equal(config.appId,"de.spdlabs.spdbot.preview");
  assert.equal(config.extraMetadata.name,"spdbot-preview");assert.equal(config.publish,null);
  assert.deepEqual(config.protocols,[{name:"SPDBot Preview",schemes:["spdbot-preview"]}]);
  assert.equal(config.nsis.shortcutName,"SPDBot Preview");
});
