import type {OcrRegion} from './ocr';
export type Rect={x:number;y:number;w:number;h:number};
export const OCR_MIN_CONFIDENCE=70;
export const DEFAULT_LABEL_COLOR='#14583e';
/** Melhor região de preço do OCR já escalada para o canvas; null quando nenhuma tem confiança suficiente. */
export function pickOcrRegion(regions:OcrRegion[],scale:number):Rect|null{
 const best=regions.filter(r=>r.confidence>=OCR_MIN_CONFIDENCE).sort((a,b)=>b.confidence-a.confidence)[0];
 if(!best)return null;
 return {x:best.box.x0*scale,y:best.box.y0*scale,w:(best.box.x1-best.box.x0)*scale,h:(best.box.y1-best.box.y0)*scale};
}
/** Região final da etiqueta: cobre o preço detectado (com margem) ou usa o canto inferior esquerdo acima da faixa de contatos. */
export function priceLabelRegion(ocr:Rect|null,width:number,height:number,band:number):Rect{
 if(ocr){
  const pad=Math.max(6,Math.round(ocr.h*.3));
  const x=Math.max(0,ocr.x-pad),y=Math.max(0,ocr.y-pad);
  return {x,y,w:Math.min(width-x,ocr.w+pad*2),h:Math.min(height-y,ocr.h+pad*2)};
 }
 const h=Math.round(height*.12),w=Math.round(width*.5);
 return {x:Math.round(width*.04),y:Math.round(height-band-h-height*.03),w,h};
}
const PRICE_WORDS=/por|apenas|preço|preco|valor/i;
/** Candidato a preço: exige ao menos um separador, então 50", 128GB e 12x nunca casam. */
const PRICE_CANDIDATE=/(?:(?:R\$|US\$|₲|Gs\.?|BRL|USD|PYG|EUR)\s?)?\d+(?:[.,]\d+)+/gi;
function candidateValue(match:string):number{
 const n=match.replace(/R\$|US\$|₲|Gs\.?|BRL|USD|PYG|EUR/gi,'').trim();
 const comma=n.lastIndexOf(','),dot=n.lastIndexOf('.');
 let norm:string;
 if(comma>dot)norm=n.replace(/\./g,'').replace(',','.');
 else if(dot>comma)norm=/^\d{1,3}(\.\d{3})+$/.test(n)?n.replace(/\./g,''):n;
 else norm=n;
 return Number(norm)||0;
}
/** Atualiza o preço dentro do texto da publicação: substitui o valor antigo ou o preço do fornecedor; sem preço no texto, acrescenta a linha. Nunca duplica. */
export function applyPriceToText(text:string,oldPrice:string,newPrice:string):string{
 if(!newPrice||oldPrice===newPrice)return text;
 if(oldPrice&&text.includes(oldPrice))return text.replace(oldPrice,newPrice);
 if(text.includes(newPrice))return text;
 const found=[...text.matchAll(PRICE_CANDIDATE)];
 if(found.length){
  const scored=found.map(m=>{const i=m.index??0;return{m,near:PRICE_WORDS.test(text.slice(Math.max(0,i-25),i)),value:candidateValue(m[0])};});
  scored.sort((a,b)=>Number(b.near)-Number(a.near)||b.value-a.value);
  const pick=scored[0]?.m;
  if(!pick)return text;
  const i=pick.index??0;
  return text.slice(0,i)+newPrice+text.slice(i+pick[0].length);
 }
 const line=`💰 Por apenas ${newPrice}`;
 return text.trim()?`${text}\n${line}`:line;
}
