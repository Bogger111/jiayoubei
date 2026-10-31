"""Multi-view geometry plus instance masks, exported as movable GLB objects.

DA3 supplies observed geometry. Mask2Former separates supported furniture
classes. Unobserved geometry is never filled with an invented house model.
"""
from __future__ import annotations
import gc
import json
import time
from pathlib import Path
import numpy as np
import torch
import trimesh
from PIL import Image

FURNITURE = {"chair": "椅子", "couch": "沙发", "sofa": "沙发", "bed": "床", "dining table": "餐桌",
             "tv": "电视", "refrigerator": "冰箱", "oven": "烤箱", "sink": "水槽", "potted plant": "绿植"}


def reconstruct_scene(paths: list[Path], directory: Path, models: Path, device: str, progress):
    started = time.time()
    from depth_anything_3.api import DepthAnything3
    model_name = "DA3-BASE" if (models / "DA3-BASE/config.json").exists() else "DA3-SMALL"
    depth_model = DepthAnything3.from_pretrained(str(models / model_name)).to(device).eval()
    try:
        prediction = depth_model.inference([str(p) for p in paths], process_res=504,
                                          process_res_method="upper_bound_resize")
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        prediction = depth_model.inference([str(p) for p in paths], process_res=336,
                                          process_res_method="upper_bound_resize")
    del depth_model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()
    depth = prediction.depth
    images = prediction.processed_images
    confidence = prediction.conf
    extrinsics = prediction.extrinsics
    intrinsics = prediction.intrinsics
    flip = np.diag([1, -1, -1])
    ups = np.array([np.array([0., -1., 0.]) @ pose[:3, :3] @ flip for pose in extrinsics])
    up = np.median(ups, axis=0);up /= max(np.linalg.norm(up), 1e-8)
    upright = trimesh.geometry.align_vectors(up, [0., 1., 0.])[:3, :3]
    orientation = flip @ upright.T
    np.savez_compressed(directory / "geometry.npz", depth=depth, confidence=confidence,
                        extrinsics=extrinsics, intrinsics=intrinsics)
    progress(42, "正在分离照片中的家具")

    from transformers import AutoImageProcessor, Mask2FormerForUniversalSegmentation
    processor = AutoImageProcessor.from_pretrained(str(models / "mask2former-swin-small-coco-instance"),
                                                  local_files_only=True)
    segmenter = Mask2FormerForUniversalSegmentation.from_pretrained(
        str(models / "mask2former-swin-small-coco-instance"), local_files_only=True).to(device).eval()
    semantic = []
    for i, image in enumerate(images):
        inputs = processor(images=Image.fromarray(image), return_tensors="pt",
                           size={"shortest_edge": 384, "longest_edge": 512}).to(device)
        with torch.inference_mode():
            output = segmenter(**inputs)
        result = processor.post_process_instance_segmentation(
            output, threshold=.55, mask_threshold=.5, target_sizes=[image.shape[:2]])[0]
        semantic.append((result["segmentation"].cpu().numpy(), result["segments_info"]))
        progress(43 + int(24 * (i + 1) / len(images)), f"正在整理第 {i + 1} 张照片中的家具")
    del segmenter
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()

    progress(70, "正在合并空间与家具表面")
    frames = []
    all_points = []
    stride = 3
    for i in range(len(images)):
        h, w = depth[i].shape
        ys, xs = np.mgrid[0:h:stride, 0:w:stride]
        z = depth[i][ys, xs]
        pixels = np.stack([xs, ys, np.ones_like(xs)], axis=-1)
        camera_points = (pixels @ np.linalg.inv(intrinsics[i]).T) * z[..., None]
        world = (camera_points - extrinsics[i][:3, 3]) @ extrinsics[i][:3, :3]
        world = world @ orientation
        good = np.isfinite(world).all(axis=-1) & (z > 0)
        if confidence is not None:
            good &= confidence[i][ys, xs] >= np.nanpercentile(confidence, 45)
        colors = images[i][ys, xs]
        mask, info = semantic[i]
        labels = mask[ys, xs]
        frames.append((world, colors, good, labels, info, z))
        all_points.append(world[good])
    merged = np.concatenate(all_points)
    if len(merged) < 100:
        raise RuntimeError("有效空间点不足，请增加有重叠、清晰的照片")
    low, high = np.percentile(merged, [1, 99], axis=0)
    center = np.array([(low[0] + high[0]) / 2, low[1], (low[2] + high[2]) / 2])
    diagonal = max(float(np.linalg.norm(high - low)), .001)
    objects = []
    parts: dict[str, list] = {"room_surface": []}

    for view_index, (world, colors, good, labels, info, z) in enumerate(frames):
        # Exclude isolated depth spikes before meshing and camera framing.
        good &= (world >= low - (high-low)*.08).all(axis=-1) & (world <= high + (high-low)*.08).all(axis=-1)
        world = world - center
        gh, gw = good.shape
        ids = np.full((gh, gw), "room_surface", dtype=object)
        for segment in info:
            label = segmenter_label(models, int(segment["label_id"]))
            if label not in FURNITURE:
                continue
            selected = (labels == int(segment["id"])) & good
            if selected.sum() < 12:
                continue
            points = world[selected]
            middle = np.median(points, axis=0)
            minimum, maximum = points.min(axis=0), points.max(axis=0)
            def same_object(o):
                if o["category"] != label:return False
                a,b=np.array(o["minimum"]),np.array(o["maximum"])
                overlap=np.maximum(0,np.minimum(b,maximum)-np.maximum(a,minimum)).prod()
                small=min(np.maximum(b-a,1e-5).prod(),np.maximum(maximum-minimum,1e-5).prod())
                return overlap/max(small,1e-9)>.2 or np.linalg.norm(np.array(o["center"])-middle)<diagonal*.085
            match = next((o for o in objects if same_object(o)), None)
            if match is None:
                oid = "furniture_" + str(len(objects) + 1)
                match = {"id": oid, "name": FURNITURE[label] + " " + str(len(objects) + 1),
                         "category": label, "center": middle.tolist(), "confidence": float(segment["score"]),
                         "editable": True,"minimum":minimum.tolist(),"maximum":maximum.tolist()}
                objects.append(match)
                parts[oid] = []
            else:
                match["minimum"]=np.minimum(match["minimum"],minimum).tolist()
                match["maximum"]=np.maximum(match["maximum"],maximum).tolist()
                match["center"]=((np.array(match["minimum"])+np.array(match["maximum"]))/2).tolist()
            ids[selected] = match["id"]
        a = np.arange((gh - 1) * gw).reshape(gh - 1, gw)[:, :-1].ravel()
        triangles = np.concatenate([np.stack([a, a + gw, a + 1], axis=1),
                                    np.stack([a + 1, a + gw, a + gw + 1], axis=1)])
        flat_good, flat_ids, flat_z = good.ravel(), ids.ravel(), z.ravel()
        valid = flat_good[triangles].all(axis=1)
        relative_jump = np.ptp(flat_z[triangles], axis=1) / np.maximum(np.mean(flat_z[triangles], axis=1), 1e-6)
        valid &= relative_jump < .12
        valid &= (flat_ids[triangles[:, 0]] == flat_ids[triangles[:, 1]]) & (flat_ids[triangles[:, 0]] == flat_ids[triangles[:, 2]])
        triangles = triangles[valid]
        if not len(triangles):
            continue
        flat_world, flat_colors = world.reshape(-1, 3), colors.reshape(-1, 3)
        for oid in np.unique(flat_ids[triangles[:, 0]]):
            faces = triangles[flat_ids[triangles[:, 0]] == oid]
            vertices, inverse = np.unique(faces.ravel(), return_inverse=True)
            parts[str(oid)].append(trimesh.Trimesh(vertices=flat_world[vertices], faces=inverse.reshape(-1, 3),
                                                vertex_colors=flat_colors[vertices], process=False))

    scene = trimesh.Scene()
    exported = []
    for oid, meshes in parts.items():
        if not meshes:
            continue
        mesh = trimesh.util.concatenate(meshes)
        if not len(mesh.faces):
            continue
        if oid != "room_surface" and len(mesh.faces)<120:
            # Tiny uncertain fragments stay part of the observed background.
            scene.add_geometry(mesh,node_name=oid+"_fragment",geom_name=oid+"_fragment")
            continue
        object_center = mesh.bounding_box.centroid
        mesh.apply_translation(-object_center)
        transform = trimesh.transformations.translation_matrix(object_center)
        scene.add_geometry(mesh, node_name=oid, geom_name=oid, transform=transform)
        original = next((o for o in objects if o["id"] == oid), None)
        exported.append({**({k:v for k,v in original.items() if k not in {"minimum","maximum"}} if original else {"id": oid, "name": "房间表面", "category": "background", "editable": False}),
                         "center": object_center.tolist(), "size": mesh.extents.tolist(),
                         "vertices": len(mesh.vertices), "triangles": len(mesh.faces)})
    if not exported:
        raise RuntimeError("没有生成可查看的表面，请补充重叠照片")
    progress(90, "正在保存可编辑的家庭扫描")
    scene.export(str(directory / "scene.glb"))
    # A point cloud remains available for inspection and future reconstruction.
    cloud = trimesh.points.PointCloud(merged[::max(1, len(merged) // 200000)] - center)
    cloud.export(str(directory / "cloud.ply"))
    Image.fromarray(images[0]).save(directory / "preview.jpg", quality=88)
    camera_position=(-extrinsics[0][:3,3] @ extrinsics[0][:3,:3]) @ orientation - center
    camera_forward=np.array([0.,0.,1.]) @ extrinsics[0][:3,:3] @ orientation
    camera_up=np.array([0.,-1.,0.]) @ extrinsics[0][:3,:3] @ orientation
    manifest = {"objects": exported, "bounds": (high - low).tolist(), "coordinateSystem": "y-up",
                "view":{"position":camera_position.tolist(),"target":(camera_position+camera_forward*diagonal*.5).tolist(),"up":camera_up.tolist()},
                "scale": "relative", "photos": len(paths), "seconds": round(time.time() - started, 2),
                "geometryModel": "depth-anything/" + model_name, "segmentationModel": "facebook/mask2former-swin-small-coco-instance",
                "triangles": sum(o["triangles"] for o in exported)}
    (directory / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


_LABELS = None
def segmenter_label(models: Path, label: int):
    global _LABELS
    if _LABELS is None:
        _LABELS = json.loads((models / "mask2former-swin-small-coco-instance/config.json").read_text())["id2label"]
    return _LABELS.get(str(label), "unknown")
