export type OcrRegion={text:string;confidence:number;box:{x0:number;y0:number;x1:number;y1:number}};
/** OCR local no navegador. Nenhuma oferta é enviada a um provedor de IA. */
export async function recognizePrices(image:string):Promise<OcrRegion[]>{
 const module=await import('tesseract.js');
 const createWorker=(module.default??module).createWorker;
 const worker=await createWorker('por+eng');
 try{
  const {data}=await worker.recognize(image,{}, {blocks:true});
  const regions:OcrRegion[]=[];
  for(const block of data.blocks??[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){
   if(/\d+[,.]\d{2}|R\$|US\$|\bGs\b/.test(line.text))regions.push({text:line.text.trim(),confidence:line.confidence,box:line.bbox});
  }return regions;
 }finally{await worker.terminate();}
}
