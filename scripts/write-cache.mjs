import{readdirSync,readFileSync,writeFileSync}from"node:fs";import{join,relative}from"node:path";import{createHash}from"node:crypto";
const root="dist/client",files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.name.startsWith("."))continue;if(e.isDirectory())walk(p);else if(!["sw.js","offline-assets.json","_headers"].includes(e.name))files.push(p);}}walk(root);files.sort();const hash=createHash("sha256");for(const p of files)hash.update(readFileSync(p));const revision=hash.digest("hex").slice(0,14);
writeFileSync(join(root,"offline-assets.json"),JSON.stringify({revision,urls:["/",...files.map(p=>"/"+relative(root,p).replaceAll("\\","/"))]}));
console.log("Offline cache manifest: "+files.length+" assets, revision "+revision);
writeFileSync(join(root,"sw.js"),readFileSync("public/sw.js","utf8").replace("__BUILD_REVISION__",revision));

