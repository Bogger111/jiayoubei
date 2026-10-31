"""Refuse to replace a presentation if its open content changed since the snapshot."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root = Path('.care-local/room-video-upgrade')
expected = json.loads((root / 'source-manifest.json').read_text(encoding='utf-8-sig'))['contentHashes']
with zipfile.ZipFile(root / 'source-check.pptx') as archive:
    current = {name: hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist()
               if not name.endswith('/') and name not in ('docProps/core.xml', 'docProps/app.xml', 'ppt/viewProps.xml')}
changed = sorted(name for name in set(expected) | set(current) if expected.get(name) != current.get(name))
(root / 'source-check-results.json').write_text(json.dumps({'changedParts': changed}, indent=2), encoding='utf-8')
if changed:
    print('Source content changed:', ', '.join(changed))
    sys.exit(1)
print('Open source content still matches the preserved snapshot, including prior unsaved edits.')
