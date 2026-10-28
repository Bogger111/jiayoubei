"""Download a predeclared academic pilot subset and extract the RGB view only.

Source: University of Rzeszow, CC BY-NC-SA 4.0; see protocol.json.
No original household footage is used. Raw data stays in ignored test-results/.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request
import cv2
import sys

ROOT = Path(__file__).resolve().parents[2]
HOLDOUT = '--holdout' in sys.argv
OUT = ROOT / 'test-results' / ('urfd-holdout' if HOLDOUT else 'urfd')
OUT.mkdir(parents=True, exist_ok=True)
IDS = [f'{kind}-{i:02d}' for kind in ('fall', 'adl') for i in (range(9, 17) if HOLDOUT else range(1, 9))]
PROTOCOL = {
    'version': 'urfd-sequence-holdout-v1' if HOLDOUT else 'urfd-pilot-v1',
    'selection': 'Sequences 09-16 of fall and ADL, camera 0; rule frozen after developing on 01-08.' if HOLDOUT else 'First eight fall and first eight ADL sequences, camera 0, chosen before inference.',
    'scope': 'Sequence-level holdout, not subject-disjoint; same laboratory and staged falls. Not a field accuracy claim.' if HOLDOUT else 'Exploratory convenience subset. Staged laboratory falls. Not a held-out subject evaluation or field accuracy claim.',
    'source': 'https://fenix.ur.edu.pl/~mkepski/ds/uf.html',
    'license': 'CC BY-NC-SA 4.0; non-commercial academic use',
    'citation': 'Kwolek B, Kepski M. Human fall detection on embedded platform using depth maps and wireless accelerometer. Computer Methods and Programs in Biomedicine 117(3), 489-501 (2014).',
    'samples': IDS,
    'view': 'Right half of official side-by-side preview; RGB only, no depth input.',
    'sampling': 'One actual decoded frame every three frames at 30 fps (10 Hz); no interpolation.',
    'labels': 'Official sequence-level fall / ADL labels; no fabricated event onset annotations.',
    'policy': 'Report all selected clips, including calibration failure and occlusion; freeze detector source before inference.',
}
(OUT / 'protocol.json').write_text(json.dumps(PROTOCOL, ensure_ascii=False, indent=2), encoding='utf-8')

def prepare(clip_id):
    filename = f'{clip_id}-cam0.mp4'
    url = f'https://fenix.ur.edu.pl/~mkepski/ds/data/{filename}'
    target = OUT / filename
    if not target.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Academic prototype evaluation'})
        with urllib.request.urlopen(request, timeout=90) as source:
            content = source.read()
        if len(content) < 1000:
            raise RuntimeError(f'Invalid download: {clip_id}')
        target.write_bytes(content)
    capture = cv2.VideoCapture(str(target))
    fps, width, height = capture.get(cv2.CAP_PROP_FPS), int(capture.get(3)), int(capture.get(4))
    if fps != 30 or width != 640 or height != 240:
        raise RuntimeError(f'Unexpected preview format: {clip_id}, {fps}, {width}x{height}')
    directory = OUT / clip_id
    directory.mkdir(exist_ok=True)
    frames, index = [], 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if index % 3 == 0:
            image = f'{index:05d}.jpg'
            encoded, pixels = cv2.imencode('.jpg', frame[:, width // 2:], [cv2.IMWRITE_JPEG_QUALITY, 95])
            if not encoded:
                raise RuntimeError(f'Cannot encode frame: {clip_id}/{image}')
            (directory / image).write_bytes(pixels.tobytes())
            frames.append({'index': index, 'ms': round(index / fps * 1000, 3), 'image': image})
        index += 1
    capture.release()
    if not frames:
        raise RuntimeError(f'No decoded frames: {clip_id}')
    result = {'id': clip_id, 'label': 'fall' if clip_id.startswith('fall') else 'adl', 'url': url,
              'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'width': width // 2,
              'height': height, 'fps': fps, 'durationMs': round(index / fps * 1000, 3), 'frames': frames}
    (directory / 'manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(f'{clip_id}: {index} decoded frames, {len(frames)} sampled', flush=True)
    return result

with ThreadPoolExecutor(max_workers=3) as pool:
    manifests = list(pool.map(prepare, IDS))
(OUT / 'manifest.json').write_text(json.dumps({'protocol': PROTOCOL, 'clips': manifests}, indent=2), encoding='utf-8')
print('All 16 predeclared clips prepared.', flush=True)
