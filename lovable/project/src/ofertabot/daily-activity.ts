import {DateTime} from 'luxon';

export type ActivityDay={date:string;label:string;received:number;sent:number};
export function activityPeriod(days:number,timezone:string,now:DateTime=DateTime.now()) {
 const end=now.setZone(timezone).endOf('day');
 const start=end.startOf('day').minus({days:days-1});
 return {start,end};
}
export function dailyActivity(days:number,timezone:string,received:string[],sent:string[],now:DateTime=DateTime.now()):ActivityDay[] {
 const {start}=activityPeriod(days,timezone,now);
 const rows:ActivityDay[]=Array.from({length:days},(_,i)=>{
  const day=start.plus({days:i});
  return {date:day.toFormat('yyyy-MM-dd'),label:day.toFormat('dd/MM'),received:0,sent:0};
 });
 const byDay=new Map(rows.map(row=>[row.date,row]));
 for(const [kind,dates] of [['received',received],['sent',sent]] as const){
  for(const date of dates){
   const day=DateTime.fromISO(date,{zone:timezone});
   if(!day.isValid)continue;
   const row=byDay.get(day.toFormat('yyyy-MM-dd'));
   if(row)row[kind]++;
  }
 }
 return rows;
}
// Comparação com ontem: só há base quando ontem teve registros reais.
export function dayDelta(rows:ActivityDay[],key:'received'|'sent'):{today:number;yesterday:number;change:number|null} {
 const today=rows.at(-1)?.[key]??0,yesterday=rows.at(-2)?.[key]??0;
 return {today,yesterday,change:yesterday>0?(today-yesterday)/yesterday:null};
}
