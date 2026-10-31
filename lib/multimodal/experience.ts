import examples from './intent-examples.json' with {type:'json'};

export function householdPhrases(deviceName:string){
  return examples.templates.map(s=>s.replace('{device}',deviceName));
}

export const experienceGallery=[
  {id:'timeline',title:'事件时间线',description:'把人物、车辆、到访与宠物动态放在一起。',path:'/integrations/demos/timeline-light.png'},
  {id:'detail',title:'事件详情',description:'点开一条动态，查看描述与对应画面。',path:'/integrations/demos/timeline-popup-light.png'},
  {id:'preview',title:'最近一刻',description:'用一张预览，快速了解最近的家庭变化。',path:'/integrations/demos/preview.png'},
  {id:'overview',title:'组合视图',description:'概览与时间线配合，保留上下文。',path:'/integrations/demos/cards-hero-light.png'},
] as const;
