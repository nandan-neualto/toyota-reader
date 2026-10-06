import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--port','5182','--inspector-port','0'],{stdio:'inherit',windowsHide:true}),
  spawn(process.execPath,['server/library-server.mjs'],{stdio:'inherit',windowsHide:true,env:{...process.env,PORT:process.env.PORT||'5180',LIBRARY_FRONTEND_URL:'http://127.0.0.1:5182'}}),
];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
for(const child of children){child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>stop(code||0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
