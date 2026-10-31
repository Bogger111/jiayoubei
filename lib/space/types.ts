export type SpaceRoom = { id: string; name?: string; points: [number, number][]; [key: string]: unknown };
export type SpaceDecoration = { id: string; kind: string; room: string; position: [number, number]; rotation?: number; params?: Record<string, number>; [key: string]: unknown };
export type SpaceConfig = { type?: string; rooms: SpaceRoom[]; decorations?: SpaceDecoration[]; devices?: {entity_id: string; room: string; position: [number, number]; [key:string]:unknown}[]; models?: Record<string, unknown>; [key:string]:unknown };
export type SpaceEntity = { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string; last_updated: string };
export type SpaceWorkspace = { version: number; updatedAt: number | null; config: SpaceConfig; states: Record<string, SpaceEntity>; areas: Record<string, unknown>; entities: Record<string, unknown>; sample: boolean };

export function validateSpaceConfig(value: unknown): asserts value is SpaceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('空间布局格式不正确');
  if (JSON.stringify(value).length > 750_000) throw new Error('布局过大，请将大型扫描模型保存在照片重建中');
  const c=value as SpaceConfig;
  if(!Array.isArray(c.rooms)||c.rooms.length>40)throw new Error('房间数量或格式不正确');
  const ids=new Set<string>();
  for(const r of c.rooms){
    if(typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id)||!Array.isArray(r.points)||r.points.length<3||r.points.length>160)throw new Error('请检查房间名称和轮廓');
    ids.add(r.id);
    if(r.name!==undefined&&(typeof r.name!=='string'||r.name.length>100))throw new Error('房间名称过长');
    if(r.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>200)))throw new Error('房间坐标超出范围');
  }
  if(c.decorations!==undefined&&(!Array.isArray(c.decorations)||c.decorations.length>1000))throw new Error('家具数量过多');
  const objects=new Set<string>();
  for(const d of c.decorations??[]){
    if(typeof d.id!=='string'||objects.has(d.id)||typeof d.kind!=='string'||!ids.has(d.room)||!Array.isArray(d.position)||d.position.length!==2||d.position.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>200))throw new Error('家具的位置或所属房间无效');
    objects.add(d.id);
    if(d.rotation!==undefined&&(!Number.isFinite(d.rotation)||Math.abs(d.rotation)>36000))throw new Error('家具角度无效');
  }
  for(const model of Object.values(c.models??{})){
    if(!model||typeof model!=='object')throw new Error('模型格式不正确');
    const u=(model as {url?:unknown}).url;
    if(u!==undefined&&(typeof u!=='string'||!/^\/api\/home-media\/[a-zA-Z0-9_-]+$/.test(u)))throw new Error('请使用本家庭上传的模型文件');
  }
}
