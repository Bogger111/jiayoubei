import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source='third_party/ha-diorama/',cache={};
function load(name){
 if(cache[name])return cache[name];const exports={};
 const code=ts.transpileModule(fs.readFileSync(source+name+'.ts.source','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const require=path=>{if(path==='#/decoration/models.ts')return {};const name=path==='#/theme.ts'?'theme':path==='#/constants.ts'?'constants':path==='#/scene/decor/sofaSpecs.ts'?'sofaSpecs':undefined;if(!name)throw new Error('Unexpected source dependency: '+path);return load(name);};
 vm.runInNewContext('(function(require,exports){'+code+'})',{},{timeout:5000})(require,exports);cache[name]=exports;return exports;
}
const labels=JSON.parse(fs.readFileSync(source+'zh-CN.json','utf8'));
const exclude=['stairs','pergola','pool','gate','awning','garage','printer','litter','solar','patio','pond','lounger'];
const selected=load('catalog').DECORATION_KINDS.filter(k=>!exclude.some(s=>k.id.includes(s))).map(k=>({id:k.id,name:labels[k.label]??k.label,mount:k.mount,params:k.params.map(p=>({id:p.id,default:p.default,min:p.min,max:p.max})),colors:k.colors,variants:(k.variants??[]).map(v=>({id:v.id,name:labels[v.label]??v.label}))}));
fs.writeFileSync('lib/space/furniture-catalog.json',JSON.stringify(selected,null,2));console.log('Pinned furniture definitions:',selected.length);
