"use client";
import {ReactFlow,Position,type Node,type Edge} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {workflowSteps,type ShowcaseState,workflowProgress} from '@/lib/showcase/engine';
export default function ShowcaseFlow({state}:{state:ShowcaseState}){
 const progress=workflowProgress(state);
 const nodes:Node[]=workflowSteps.map((s,i)=>({id:s.id,position:{x:i*202,y:20},sourcePosition:Position.Right,targetPosition:Position.Left,draggable:false,selectable:false,className:'showcase-flow-node '+(i<progress?'complete':i===progress?'current':''),data:{label:<><span>{String(i+1).padStart(2,'0')}</span><strong>{s.title}</strong><small>{s.subtitle}</small></>}}));
 const edges:Edge[]=workflowSteps.slice(1).map((s,i)=>({id:'edge-'+i,source:workflowSteps[i].id,target:s.id,animated:i<progress,className:i<progress?'active':''}));
 return <div className="showcase-flow" role="img" aria-label={'家庭处理流程：'+workflowSteps.slice(0,progress).map(s=>s.title).join('、')}><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{padding:.05}} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false} proOptions={{hideAttribution:true}}/></div>;
}
