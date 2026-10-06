import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEmployeeCsv} from '../lib/employee-csv.mjs';
test('imports BOM, CRLF, Unicode names, quoted commas and escaped quotes',()=>{
 const result=parseEmployeeCsv('\uFEFFemployeeId,name,pin,role\r\nEMP-1,"Tanaka, 日本語",secret123,employee\r\nEMP-2,"ಸುಧಾ ""Team""",another123,admin\r\n');
 assert.equal(result.length,2);assert.equal(result[0].name,'Tanaka, 日本語');assert.equal(result[1].name,'ಸುಧಾ "Team"');assert.equal(result[1].role,'admin');
});
test('rejects wrong headers, malformed quotes and mismatched columns',()=>{
 assert.throws(()=>parseEmployeeCsv('id,name,password\n1,Alice,secret'),/columns/);
 assert.throws(()=>parseEmployeeCsv('employeeId,name,pin\n1,"Alice,secret'),/quote/);
 assert.throws(()=>parseEmployeeCsv('employeeId,name,pin\n1,Alice,secret,extra'),/columns/);
});
