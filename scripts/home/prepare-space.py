"""Reproduce the pinned, localized third-party card without editing its logic."""
import pathlib,urllib.request,hashlib,json
ROOT=pathlib.Path(__file__).resolve().parents[2]
manifest=ROOT/'third_party/ha-diorama/manifest.json';data=json.loads(manifest.read_text('utf-8'))
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
url='https://github.com/CarlesRojas/ha-diorama/releases/download/'+data['release']+'/card.js'
raw=opener.open(url,timeout=120).read()
if hashlib.sha256(raw).hexdigest()!=data['upstreamBundleSha256']:raise RuntimeError('Upstream bundle checksum changed')
text=raw.decode('utf-8')
labels=json.loads((ROOT/'third_party/ha-diorama/zh-CN.json').read_text('utf-8'))
for source,target in labels.items():text=text.replace(json.dumps(source,ensure_ascii=False),json.dumps(target,ensure_ascii=False))
text=text.replace('.split {','.split {\\n  height: 100% !important;\\n  max-height: 100%;')
bundle=ROOT/data['bundle'];bundle.write_text(text,'utf-8')
data['sha256']=hashlib.sha256(bundle.read_bytes()).hexdigest();manifest.write_text(json.dumps(data,indent=2)+'\n','utf-8')
print('Pinned space component prepared:',data['release'])
