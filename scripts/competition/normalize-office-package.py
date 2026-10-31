"""Normalize two generator package artifacts, preserving all authored content."""
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

target = Path(sys.argv[1])
with zipfile.ZipFile(target) as archive:
    parts = {name: archive.read(name) for name in archive.namelist()}

# The bundled generator declares one master override per slide, while writing
# only its actual master. Remove declarations whose target does not exist.
content_types = parts['[Content_Types].xml'].decode('utf-8')
content_types = re.sub(r'<Override\b[^>]*PartName="([^"]+)"[^>]*/>', lambda match: match[0] if match[1].lstrip('/') in parts else '', content_types)
parts['[Content_Types].xml'] = content_types.encode('utf-8')
for name, data in list(parts.items()):
    if name.startswith('ppt/slides/slide') and name.endswith('.xml'):
        # Media actions do not require an empty relationship ID.
        parts[name] = data.replace(b' r:id=""', b'')
        root = ET.fromstring(parts[name])
        for node in root.iter():
            for axis in ('cx', 'cy'):
                if axis in node.attrib and int(node.attrib[axis]) < 0:
                    raise ValueError(f'Negative shape extent in {name}')

with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in parts.items():
        archive.writestr(name, data)
print('Office package normalized; all shape extents nonnegative')
