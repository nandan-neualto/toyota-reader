import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
mkdirSync("public/vendor", { recursive: true });
for (const name of ["pdf.worker.mjs"]) cpSync("node_modules/pdfjs-dist/build/"+name,"public/vendor/"+name);
for (const name of ["cmaps", "standard_fonts", "wasm"]) {
 const source = "node_modules/pdfjs-dist/"+name;
 if(existsSync(source))cpSync(source,"public/vendor/"+name,{recursive:true});
}
mkdirSync("public/licenses",{recursive:true});
cpSync("node_modules/pdfjs-dist/LICENSE","public/licenses/pdfjs.txt");
cpSync("node_modules/epubjs/license","public/licenses/epubjs.txt");
console.log("Reader assets and open-source licenses prepared.");

