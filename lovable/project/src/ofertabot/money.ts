const digits=(currency:string)=>currency==='PYG'?0:2;
export function parseMoney(value:string,currency:string):string|null {
 if(!value.trim())return null;
 const d=digits(currency),input=value.trim();
 const pattern=d===0?/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/:/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
 if(!pattern.test(input))throw new Error(d?'Use um valor como 1.299,90, sem símbolo de moeda.':'PYG não utiliza casas decimais.');
 const [integer,fraction='']=input.replace(/\./g,'').split(',');
 if(!integer)throw new Error('Preço inválido');
 return (BigInt(integer)*10n**BigInt(d)+BigInt(fraction.padEnd(d,'0')||'0')).toString();
}
export function decimalMoney(minor:string|null,currency:string){if(minor===null)return '';const d=digits(currency),s=minor.padStart(d+1,'0');return d?s.slice(0,-d)+','+s.slice(-d):s;}
export function formatMoney(minor:string|null,currency:string){return minor===null?'Sem preço definido':`${currency} ${decimalMoney(minor,currency)}`;}

