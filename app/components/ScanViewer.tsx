"use client";
import {forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import type {ObjectEdit,ScanEdits,ScanManifest} from '@/lib/space/reconstruction';

export type ScanViewerHandle={exportGlb:()=>Promise<void>};
type Props={url:string;manifest:ScanManifest;edits:ScanEdits;selectedId?:string;mode?:'translate'|'rotate'|'scale';readOnly?:boolean;onSelect?:(id:string)=>void;onChange?:(id:string,edit:ObjectEdit)=>void};
const ScanViewer=forwardRef<ScanViewerHandle,Props>(function ScanViewer({url,manifest,edits,selectedId,mode='translate',readOnly=false,onSelect,onChange},ref){
  const holder=useRef<HTMLDivElement>(null),root=useRef<THREE.Group|undefined>(undefined),nodes=useRef(new Map<string,THREE.Object3D>()),transform=useRef<TransformControls|undefined>(undefined),highlight=useRef<THREE.BoxHelper|undefined>(undefined),orbit=useRef<OrbitControls|undefined>(undefined);
  const latest=useRef({onSelect,onChange,readOnly,edits});useLayoutEffect(()=>{latest.current={onSelect,onChange,readOnly,edits};},[onSelect,onChange,readOnly,edits]);
  const [loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const cameraViews=useRef<{home:()=>void;photo:()=>void}|undefined>(undefined);
  useImperativeHandle(ref,()=>({exportGlb:async()=>{if(!root.current)return;const exporter=new GLTFExporter();const data=await exporter.parseAsync(root.current,{binary:true});const blob=new Blob([data as ArrayBuffer],{type:'model/gltf-binary'});const link=URL.createObjectURL(blob);const a=document.createElement('a');a.href=link;a.download='家有备-家庭扫描.glb';a.click();setTimeout(()=>URL.revokeObjectURL(link),1000);}}),[]);
  useEffect(()=>{
    if(!holder.current)return;let active=true,frame=0;const el=holder.current,nodeMap=nodes.current;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:false});}catch{setError('浏览器暂时无法启用三维显示，请尝试其他浏览器');return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
    el.replaceChildren(renderer.domElement);renderer.domElement.setAttribute('aria-label','照片重建的可编辑家庭扫描');
    const scene=new THREE.Scene();scene.background=new THREE.Color('#242732');
    const camera=new THREE.PerspectiveCamera(45,1,.001,10000);
    scene.add(new THREE.HemisphereLight(0xffffff,0x7d8395,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(4,8,6);scene.add(light);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;orbit.current=controls;
    const gizmo=new TransformControls(camera,renderer.domElement);transform.current=gizmo;gizmo.setSize(.8);scene.add(gizmo.getHelper());
    const box=new THREE.BoxHelper(new THREE.Object3D(),0xb8c9ee);box.visible=false;scene.add(box);highlight.current=box;
    gizmo.addEventListener('dragging-changed',e=>{controls.enabled=!e.value;});
    gizmo.addEventListener('objectChange',()=>{const object=gizmo.object;if(!object||latest.current.readOnly)return;box.setFromObject(object);latest.current.onChange?.(object.name,{position:object.position.toArray() as [number,number,number],rotation:[THREE.MathUtils.radToDeg(object.rotation.x),THREE.MathUtils.radToDeg(object.rotation.y),THREE.MathUtils.radToDeg(object.rotation.z)],scale:object.scale.toArray() as [number,number,number]});});
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    const editable=new Set(manifest.objects.filter(o=>o.editable).map(o=>o.id));
    const loader=new GLTFLoader();loader.load(url,gltf=>{
      if(!active)return;root.current=gltf.scene;nodes.current.clear();
      gltf.scene.traverse(object=>{if(editable.has(object.name))nodes.current.set(object.name,object);if(object instanceof THREE.Mesh){object.castShadow=false;object.receiveShadow=false;const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>{material.side=THREE.DoubleSide;if('roughness'in material)(material as THREE.MeshStandardMaterial).roughness=1;});}});
      scene.add(gltf.scene);gltf.scene.scale.setScalar(latest.current.edits.metersPerUnit);
      for(const[id,edit]of Object.entries(latest.current.edits.objects)){const n=nodes.current.get(id);if(n){n.position.fromArray(edit.position);n.rotation.set(...edit.rotation.map(THREE.MathUtils.degToRad) as [number,number,number]);n.scale.fromArray(edit.scale);}}
      const bounds=new THREE.Box3().setFromObject(gltf.scene),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const distance=Math.max(size.x,size.y,size.z)*1.45;
      const home=()=>{camera.up.set(0,1,0);camera.position.copy(center).add(new THREE.Vector3(distance*.65,distance*.48,distance*.7));controls.target.copy(center);controls.update();};
      const photo=()=>{if(!manifest.view){home();return;}camera.position.fromArray(manifest.view.position).multiplyScalar(latest.current.edits.metersPerUnit);camera.up.fromArray(manifest.view.up);controls.target.fromArray(manifest.view.target).multiplyScalar(latest.current.edits.metersPerUnit);controls.update();};
      cameraViews.current={home,photo};camera.near=Math.max(.0001,distance/1000);camera.far=Math.max(100,distance*50);camera.updateProjectionMatrix();controls.minDistance=distance*.02;controls.maxDistance=distance*8;home();setLoaded(true);
    },undefined,()=>{if(active)setError('扫描暂时无法读取，请刷新后重试');});
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let start:[number,number]=[0,0];
    const down=(e:PointerEvent)=>{start=[e.clientX,e.clientY]};
    const up=(e:PointerEvent)=>{if(latest.current.readOnly||gizmo.dragging||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5||!root.current)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);for(const hit of ray.intersectObject(root.current,true)){let n:THREE.Object3D|null=hit.object;while(n&&!editable.has(n.name))n=n.parent;if(n){latest.current.onSelect?.(n.name);break;}}};
    renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
    let last=0;const render=(time:number)=>{frame=requestAnimationFrame(render);if(document.hidden||time-last<28)return;last=time;controls.update();if(box.visible&&gizmo.object)box.setFromObject(gizmo.object);renderer.render(scene,camera);};frame=requestAnimationFrame(render);
    return()=>{active=false;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);gizmo.dispose();controls.dispose();scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>m.dispose())}});renderer.dispose();renderer.domElement.remove();root.current=undefined;nodeMap.clear();transform.current=undefined;highlight.current=undefined;};
  },[url,manifest]);
  useEffect(()=>{const control=transform.current,object=selectedId?nodes.current.get(selectedId):undefined;if(!control)return;control.setMode(mode);if(object&&!readOnly){control.attach(object);highlight.current?.setFromObject(object);if(highlight.current)highlight.current.visible=true;}else{control.detach();if(highlight.current)highlight.current.visible=false;}},[selectedId,mode,readOnly,loaded]);
  useEffect(()=>{if(!root.current)return;root.current.scale.setScalar(edits.metersPerUnit);for(const[id,edit]of Object.entries(edits.objects)){const object=nodes.current.get(id);if(object){object.position.fromArray(edit.position);object.rotation.set(...edit.rotation.map(THREE.MathUtils.degToRad) as [number,number,number]);object.scale.fromArray(edit.scale);}}},[edits]);
  return <div className="scan-viewer"><div ref={holder} className="scan-webgl"/>{loaded&&<div className="scan-view-switch"><button onClick={()=>cameraViews.current?.home()}>空间全貌</button>{manifest.view&&<button onClick={()=>cameraViews.current?.photo()}>拍摄视角</button>}</div>}{!loaded&&!error&&<div className="space-loading" role="status"><span className="space-loader"/>正在打开家庭扫描</div>}{error&&<div className="space-loading" role="alert">{error}</div>}</div>;
});
export default ScanViewer;
