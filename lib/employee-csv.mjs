export function parseEmployeeCsv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i+1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i+1] === '\n') i++; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quote.');
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map(v=>v.toLowerCase().replace(/[ _-]/g,''));
  if (!header || !['employeeid','name','pin'].every(v=>header.includes(v))) throw new Error('CSV needs employeeId,name,pin columns. An optional role column accepts employee or admin.');
  if (rows.length > 200) throw new Error('Import up to 200 employees per CSV.');
  return rows.map((r,index)=>{if(r.length!==header.length)throw new Error(`CSV row ${index+2} has the wrong number of columns.`);return {employeeId:r[header.indexOf('employeeid')],name:r[header.indexOf('name')],pin:r[header.indexOf('pin')],role:header.includes('role')?r[header.indexOf('role')]:'employee'};});
}
