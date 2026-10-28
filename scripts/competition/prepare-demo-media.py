"""Crop the RGB half of licensed URFD preview videos; retain real frame timing."""
from pathlib import Path
import os
import subprocess
import cv2

root = Path(__file__).resolve().parents[2]
encoder = Path(os.environ.get('LOCALAPPDATA', '')) / 'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe'
out = root / 'public/evidence/media'
out.mkdir(parents=True, exist_ok=True)
for clip_id in ['fall-06', 'adl-04']:
    capture = cv2.VideoCapture(str(root / f'test-results/urfd/{clip_id}-cam0.mp4'))
    process = subprocess.Popen([str(encoder), '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-r', '30', '-i', 'pipe:0', '-c:v', 'libvpx', '-b:v', '550k', '-an', str(out / f'{clip_id}.webm')], stdin=subprocess.PIPE)
    while True:
        ok, frame = capture.read()
        if not ok: break
        encoded, image = cv2.imencode('.jpg', frame[:, 320:], [cv2.IMWRITE_JPEG_QUALITY, 95])
        if not encoded: raise RuntimeError('Frame encoding failed')
        process.stdin.write(image.tobytes())
    process.stdin.close()
    capture.release()
    if process.wait() != 0: raise RuntimeError(f'Encode failed: {clip_id}')
    print(clip_id, (out / f'{clip_id}.webm').stat().st_size, flush=True)
