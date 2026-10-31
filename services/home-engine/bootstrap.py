"""Install an isolated, pinned local model runtime; never print credentials."""
from __future__ import annotations
import argparse, hashlib, io, json, os, pathlib, re, secrets, shutil, subprocess, sys, urllib.request, zipfile

ROOT=pathlib.Path(__file__).resolve().parents[2]
STATE=ROOT/'.care-local/home-upgrade'
VENV=STATE/'engine-venv'
PYTHON=VENV/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
LOCK=json.loads((pathlib.Path(__file__).parent/'models.lock.json').read_text('utf-8'))
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))
CHILD_ENV={k:v for k,v in os.environ.items() if k.lower() not in {'http_proxy','https_proxy','all_proxy'}}
CHILD_ENV['PYTHONUTF8']='1'

def run(args):subprocess.run([str(x) for x in args],cwd=ROOT,env=CHILD_ENV,check=True)
def download(url,target,expected=None):
    if target.exists() and (not expected or hashlib.file_digest(target.open('rb'),'sha256').hexdigest()==expected):return
    target.parent.mkdir(parents=True,exist_ok=True)
    partial=target.with_name(target.name+'.partial')
    for attempt in range(3):
        try:
            with OPENER.open(urllib.request.Request(url,headers={'User-Agent':'JiaYouBei-Local-Setup'}),timeout=120) as response,partial.open('wb') as output:shutil.copyfileobj(response,output,1024*1024)
            if expected and hashlib.file_digest(partial.open('rb'),'sha256').hexdigest()!=expected:raise ValueError('Downloaded model checksum does not match the pinned manifest')
            partial.replace(target);return
        except Exception:
            if attempt==2:raise

def configure():
    STATE.mkdir(parents=True,exist_ok=True)
    path=STATE/'engine-config.json'
    if not path.exists():path.write_text(json.dumps({'token':secrets.token_urlsafe(40),'port':8766}),'utf-8')
    config=json.loads(path.read_text('utf-8'));path=ROOT/'.dev.vars'
    content=path.read_text('utf-8-sig') if path.exists() else ''
    for key,value in {'HOME_ENGINE_URL':f"http://127.0.0.1:{config['port']}",'HOME_ENGINE_TOKEN':config['token']}.items():
        content=re.sub(r'^'+key+r'=.*$',key+'='+value,content,flags=re.M) if re.search(r'^'+key+r'=',content,flags=re.M) else content.rstrip()+'\n'+key+'='+value+'\n'
    path.write_text(content.lstrip('\n'),'utf-8')
    print('Local connection configured. Credentials remain in ignored local files.')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--verify',action='store_true');parser.add_argument('--configure',action='store_true');parser.add_argument('--api-only',action='store_true');args=parser.parse_args()
    if args.configure:configure();return
    if args.verify:
        if not PYTHON.exists():raise RuntimeError('Run bootstrap.py without --verify first')
        run([PYTHON,'-c',"import torch; x=torch.ones((128,128),device='cuda' if torch.cuda.is_available() else 'cpu'); print('Runtime:',torch.__version__,'device:',x.device,'real matmul:',float((x@x).sum()))"])
        for model in LOCK['models']:
            for file in model['files']:
                p=STATE/'models'/model['directory']/file['name']
                if not p.exists() or hashlib.file_digest(p.open('rb'),'sha256').hexdigest()!=file['sha256']:raise RuntimeError('Missing or changed model file: '+str(p))
        print('Pinned model files verified.');return
    uv=shutil.which('uv')
    if not uv:
        candidate=pathlib.Path(os.environ.get('LOCALAPPDATA',''))/'hermes/bin/uv.exe'
        if candidate.exists():uv=str(candidate)
    if not uv:raise RuntimeError('Install uv, then run this setup again')
    STATE.mkdir(parents=True,exist_ok=True)
    if not PYTHON.exists():run([uv,'venv','--python','3.12',VENV])
    if args.api_only:
        run([uv,'pip','install','--python',PYTHON,'-r',pathlib.Path(__file__).parent/'requirements-api.txt']);configure();print('Photo-to-layout API runtime ready. No GPU models were downloaded.');return
    run([uv,'pip','install','--python',PYTHON,'torch==2.8.0','torchvision==0.23.0','--index-url','https://download.pytorch.org/whl/cu128'])
    run([uv,'pip','install','--python',PYTHON,'-r',pathlib.Path(__file__).parent/'requirements.txt'])
    source=STATE/'vendor/Depth-Anything-3';revision=LOCK['geometrySource']['revision']
    if not (source/'src/depth_anything_3/api.py').exists():
        data=OPENER.open('https://codeload.github.com/ByteDance-Seed/Depth-Anything-3/zip/'+revision,timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for info in archive.infolist():
                relative=pathlib.PurePosixPath(*pathlib.PurePosixPath(info.filename).parts[1:])
                if info.is_dir() or '..' in relative.parts or not (str(relative).startswith('src/') or str(relative) in {'LICENSE','README.md','pyproject.toml'}):continue
                target=source/pathlib.Path(relative);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(info))
    (source/'source.json').write_text(json.dumps(LOCK['geometrySource'],indent=2),'utf-8')
    for model in LOCK['models']:
        folder=STATE/'models'/model['directory']
        print('Preparing',model['repository'],flush=True)
        for file in model['files']:download('https://huggingface.co/'+model['repository']+'/resolve/'+model['revision']+'/'+file['name']+'?download=true',folder/file['name'],file['sha256'])
        (folder/'source.json').write_text(json.dumps({k:model[k] for k in ['repository','revision','license']},indent=2),'utf-8')
    configure();print('Setup complete. Run scripts/home/start.ps1.')

if __name__=='__main__':main()
