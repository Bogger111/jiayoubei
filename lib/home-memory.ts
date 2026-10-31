export type JournalCategory='activity'|'delivery'|'pet'|'device'|'care'|'note'|'space';
export type JournalEntry={id:string;title:string;description:string;category:JournalCategory;room:string;occurredAt:number;mediaUrl:string;source:string;confirmed:boolean;sample:boolean;createdAt:number;version?:number;updatedAt?:number};
export type MemoryDocument={id:string;title:string;content:string;source:string;occurredAt:number;kind:'journal'|'profile'|'observation';mediaUrl?:string};
export type MemorySearchResult={answer:string;citations:(MemoryDocument&{score:number})[];mode:'hybrid'|'lexical';generation:'local_model'|'extractive';model?:string};
export function isMemoryQuestion(query:string){return !/失联|摔倒|燃气|烟雾|求救|呼吸困难|没回家|没有回应/.test(query)&&/家庭动态|记得|记忆|回顾|发生过|刚才.{0,16}(什么|谁|哪里)|今天.{0,16}(记录|做了什么)|习惯|约定|联系方式|放在(哪|什么)|午休|午睡/.test(query);}

export function memoryTerms(text:string){
  const s=text.toLowerCase().replace(/[\s，。！？、：；,.!?：()（）]/g,'');
  const terms=new Set<string>();
  for(const word of text.toLowerCase().match(/[a-z0-9_]+/g)??[])terms.add(word);
  for(let i=0;i<s.length-1;i++)terms.add(s.slice(i,i+2));
  for(const group of [['快递','包裹','送货'],['猫咪','宠物','小猫'],['妈妈','母亲'],['爸爸','父亲'],['灯光','照明','开灯'],['午休','休息','午睡'],['厨房','做饭','空气炸锅'],['联系人','邻居','王阿姨']])if(group.some(x=>s.includes(x)))group.forEach(x=>terms.add(x));
  return [...terms];
}
export function cosineSimilarity(a:number[],b:number[]){if(a.length!==b.length||!a.length)return 0;let dot=0,na=0,nb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]**2;nb+=b[i]**2;}return na&&nb?dot/Math.sqrt(na*nb):0;}
export function rankMemoryDocuments(query:string,documents:MemoryDocument[],vectors?:{query:number[];documents:Record<string,number[]>},limit=6){
  const terms=memoryTerms(query),tokenized=documents.map(d=>memoryTerms(d.title+' '+d.content));
  const average=tokenized.reduce((s,x)=>s+x.length,0)/Math.max(1,documents.length);
  const df=new Map(terms.map(t=>[t,tokenized.filter(x=>x.includes(t)).length]));
  const ranked=documents.map((d,i)=>{let lexical=0;for(const term of terms)if(tokenized[i].includes(term)){const frequency=(d.title+' '+d.content).split(term).length-1;const idf=Math.log(1+(documents.length-(df.get(term)??0)+.5)/((df.get(term)??0)+.5));lexical+=idf*(frequency*2.2)/(frequency+1.2*(.25+.75*tokenized[i].length/Math.max(1,average)));}const semantic=vectors?.documents[d.id]?cosineSimilarity(vectors.query,vectors.documents[d.id]):0;const hasSemantic=Boolean(vectors?.documents[d.id]);const score=hasSemantic?Math.max(0,semantic-.35)*2.5+lexical/Math.max(3,terms.length):lexical;return {...d,score,semantic,lexical};}).filter(x=>x.lexical>0||x.semantic>.53).sort((a,b)=>b.score-a.score||b.occurredAt-a.occurredAt);
  return ranked.filter(x=>x.score>=Math.max(.12,(ranked[0]?.score??0)*.32)).slice(0,Math.max(1,Math.min(10,limit))).map(({semantic:_s,lexical:_l,...item})=>item);
}
export function extractiveMemoryAnswer(citations:MemoryDocument[]){return citations.length?citations.slice(0,3).map((c,i)=>`${c.content.slice(0,260)} [${i+1}]`).join('\n\n'):'当前家庭记录中没有找到足够的信息。可以补充相关记忆或换一种问法。';}
