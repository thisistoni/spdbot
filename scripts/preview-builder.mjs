import { readFileSync } from "node:fs";
import { parse } from "yaml";
const base = parse(readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8"));
export default function previewBuilderConfig() {
  return { ...base, files:[{filter:base.files}], appId:"de.spdlabs.spdbot.preview", productName:"SPDBot Preview",
    artifactName:"SPDBot-Preview-${version}-${arch}.${ext}",
    extraMetadata:{name:"spdbot-preview",version:"0.1.116-preview.20261108.2"},
    directories:{...base.directories,output:"release-preview"}, publish:null,
    protocols:[{name:"SPDBot Preview",schemes:["spdbot-preview"]}],
    nsis:{...base.nsis,include:"build/installer-preview.nsh",shortcutName:"SPDBot Preview",uninstallDisplayName:"SPDBot Preview ${version}",artifactName:"SPDBot-Preview-${version}-setup.${ext}"},
    win:{...base.win,target:[{target:"nsis",arch:["x64"]}]},
  };
}
