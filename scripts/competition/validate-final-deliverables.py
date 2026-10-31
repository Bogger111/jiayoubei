import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from pypdf import PdfReader

root = Path.cwd()
out = root / 'deliverables'
required = ['家有备_创客大赛_终版.pptx', '家有备_创客大赛_终版.pdf', 'demo.mp4', '演示启动指南.md', '路演讲稿.md', '答辩问题准备.md', '开源组件与许可证.md', 'demo/index.html', 'demo/showcase.js', 'demo/showcase.css']
for name in required:
    assert (out / name).is_file() and (out / name).stat().st_size > 0, name
assert len(list((out / 'demo_screenshots').glob('*.png'))) >= 5
ns = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
forbidden = re.compile(r'MediaPipe|PptxGenJS|React Flow|xyflow|GitHub|URFD|LLM.?Vision|Xiao.?Zhi|小智|Home Assistant|valentinfrlch', re.I)
native_text, tables = 0, 0
with zipfile.ZipFile(out / required[0]) as archive:
    slides = sorted(name for name in archive.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', name))
    assert len(slides) == 14
    for name in slides:
        xml = ET.fromstring(archive.read(name))
        texts = list(xml.iterfind('.//a:t', ns))
        native_text += len(texts)
        assert not forbidden.search(' '.join(t.text or '' for t in texts)), name
        tables += len(list(xml.iterfind('.//a:tbl', ns)))
        for node in xml.iter():
            if node.tag.endswith('}ext'):
                for dimension in ['cx', 'cy']:
                    if dimension in node.attrib:
                        assert int(node.attrib[dimension]) >= 0
    for name in archive.namelist():
        if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml', name):
            content = ' '.join(node.text or '' for node in ET.fromstring(archive.read(name)).iterfind('.//a:t', ns))
            assert not forbidden.search(content), name
    media = [name for name in archive.namelist() if name.endswith('.mp4')]
    assert len(media) == 1
    assert hashlib.sha256(archive.read(media[0])).hexdigest() == hashlib.sha256((out / 'demo.mp4').read_bytes()).hexdigest()
    links = archive.read('ppt/slides/_rels/slide9.xml.rels').decode()
    assert 'Target="demo/index.html"' in links and 'Target="demo.mp4"' in links
assert native_text > 180 and tables >= 1
pdf = PdfReader(out / required[1])
assert len(pdf.pages) == 14
for index, page in enumerate(pdf.pages, 1):
    text = page.extract_text()
    assert '家有备' in text, index
    assert not forbidden.search(text), index
    assert abs(float(page.mediabox.width) / float(page.mediabox.height) - 16 / 9) < .005
office = json.loads((root / 'test-results/final-sprint/powerpoint-render.json').read_text(encoding='utf-8-sig'))
assert not office['textOverflow']
assert office['media'][0]['slide'] == 9 and office['media'][0]['lengthMs'] > 60000
video = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', str(out / 'demo.mp4')]))
assert 60 <= float(video['format']['duration']) <= 120
report = {'slides': 14, 'pdfPages': 14, 'editableTextRuns': native_text, 'nativeTables': tables, 'powerPointOpened': True, 'textOverflow': 0, 'videoEmbedded': True, 'videoSeconds': float(video['format']['duration']), 'projectNamesInSlidesOrNotes': False, 'requiredFiles': required}
(root / 'test-results/final-sprint/delivery-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=True))
