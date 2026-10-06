import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath,['server/library-server.mjs'],{stdio:'inherit',windowsHide:true,env:{...process.env,PORT:'5181'}}),
  spawn(process.execPath,['scripts/run-framework.mjs','dev','--port','5180',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true}),
];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
for(const child of children){child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>stop(code||0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
