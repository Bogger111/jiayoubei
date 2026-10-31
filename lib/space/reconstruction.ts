export type ScanObject={id:string;name:string;category:string;editable:boolean;center:[number,number,number];size:[number,number,number];vertices:number;triangles:number;confidence?:number};
export type ScanManifest={view?:{position:[number,number,number];target:[number,number,number];up:[number,number,number]};objects:ScanObject[];bounds:[number,number,number];scale:'relative';coordinateSystem:'y-up';photos:number;seconds:number;triangles:number;geometryModel:string;segmentationModel:string};
export type ObjectEdit={name?:string;position:[number,number,number];rotation:[number,number,number];scale:[number,number,number]};
export type ScanEdits={version:number;objects:Record<string,ObjectEdit>;metersPerUnit:number};
export type ScanJob={id:string;status:'preparing'|'queued'|'running'|'saving'|'completed'|'failed';stage:string;progress:number;createdAt:number;updatedAt:number;photoIds:string[];source?:'public_example'|'user_photos';modelUrl?:string;previewUrl?:string;previewMediaId?:string;result?:ScanManifest;error?:string;edits?:ScanEdits};
export function validateScanEdits(input:unknown,manifest:ScanManifest):asserts input is ScanEdits{
  if(!input||typeof input!=='object')throw new Error('家具调整数据无效');
  const data=input as ScanEdits;if(!Number.isInteger(data.version)||data.version<0||!Number.isFinite(data.metersPerUnit)||data.metersPerUnit<=0||data.metersPerUnit>100)throw new Error('比例或版本无效');
  if(!data.objects||typeof data.objects!=='object'||Array.isArray(data.objects)||Object.keys(data.objects).length>300)throw new Error('家具数量过多');
  const allowed=new Set(manifest.objects.filter(o=>o.editable).map(o=>o.id));
  for(const [id,edit]of Object.entries(data.objects)){
    if(!allowed.has(id))throw new Error('家具不属于当前扫描');
    for(const [kind,values]of Object.entries(edit)){
      if(kind==='name'){if(typeof values!=='string'||!values.trim()||values.length>60)throw new Error('家具名称无效');continue;}
      if(!['position','rotation','scale'].includes(kind)||!Array.isArray(values)||values.length!==3||values.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1000))throw new Error('家具参数无效');
      if(kind==='scale'&&values.some(n=>n<.05||n>20))throw new Error('家具缩放超出范围');
    }
    if(!edit.position||!edit.rotation||!edit.scale)throw new Error('请提供完整的家具位置、角度和尺寸');
  }
}
