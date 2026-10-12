// Calendar dates have no timezone: a target stays on the selected day on every device.
export function isGoalDate(value){
 if(typeof value!=='string')return false;
 if(value==='')return true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 if(year<1||year>9999||month<1||month>12)return false;
 const leap=year%4===0&&(year%100!==0||year%400===0);
 return day>=1&&day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
export function cleanReadingPlan(input){
 const plan={};
 if(input.readLater!==undefined){if(typeof input.readLater!=='boolean')throw new Error('Choose a valid Read later setting.');plan.readLater=input.readLater;}
 if(input.goalDate!==undefined){if(!isGoalDate(input.goalDate))throw new Error('Choose a valid reading target date.');plan.goalDate=input.goalDate;}
 return plan;
}
