param([string]$ValidatedDirectory='final-v2')
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath '.').Path
$build=Join-Path $taskRoot '.care-local\room-video-upgrade'
$target=Join-Path $taskRoot 'deliverables\家有备_多模态家庭助手.pptx'
$final=Join-Path (Join-Path $build $ValidatedDirectory) '家有备_多模态家庭助手.pptx'
if(!(Test-Path -LiteralPath $final)){throw 'The validated presentation is missing'}
$office=New-Object -ComObject PowerPoint.Application
$openDeck=$null;$reopen=$false
try{
 foreach($deck in $office.Presentations){if($deck.FullName -eq $target){$openDeck=$deck;break}}
 if($openDeck){$openDeck.SaveCopyAs((Join-Path $build 'source-check.pptx'),24)}else{Copy-Item -LiteralPath $target -Destination (Join-Path $build 'source-check.pptx') -Force}
 & 'C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/design/check-open-room-source.py
 if($LASTEXITCODE -ne 0){throw 'Preserve and incorporate the new user edits before installing'}
 $backupRoot=Join-Path (Split-Path $taskRoot -Parent) ('家有备备份\房间录屏与语音配图_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
 New-Item -ItemType Directory -Path (Join-Path $backupRoot 'before') -Force | Out-Null
 Copy-Item -LiteralPath $target -Destination (Join-Path $backupRoot 'before\原磁盘文件.pptx')
 Copy-Item -LiteralPath (Join-Path $build 'source-current.pptx') -Destination (Join-Path $backupRoot 'before\包含原未保存编辑的快照.pptx')
 Copy-Item -LiteralPath (Join-Path $taskRoot 'deliverables\家有备_静态预览.pdf') -Destination (Join-Path $backupRoot 'before\家有备_静态预览.pdf')
 if($openDeck){$reopen=$true;$openDeck.Saved=-1;$openDeck.Close();[Runtime.InteropServices.Marshal]::ReleaseComObject($openDeck)|Out-Null;$openDeck=$null}
 Copy-Item -LiteralPath $final -Destination $target -Force
 Copy-Item -LiteralPath (Join-Path (Split-Path $final -Parent) '家有备_静态预览.pdf') -Destination (Join-Path $taskRoot 'deliverables\家有备_静态预览.pdf') -Force
 Copy-Item -LiteralPath (Join-Path $taskRoot 'test-results\room-video-upgrade\照片生成与家具编辑.mp4') -Destination (Join-Path $taskRoot 'deliverables\照片生成与家具编辑.mp4') -Force
 if((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $final).Hash){throw 'Installed file differs from the validated result'}
 if($reopen){$openDeck=$office.Presentations.Open($target,0,0,-1);$openDeck.Windows.Item(1).View.GotoSlide(7)}
 [pscustomobject]@{backup=$backupRoot;installed=$target;sha256=(Get-FileHash -LiteralPath $target).Hash;slides=16;voiceSlide=5;roomVideoSlide=7;preservedPriorUnsavedEdits=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $build 'installation.json') -Encoding utf8
 Write-Output 'Installed the validated presentation, PDF and standalone video; preserved prior open edits and backups.'
}finally{if($openDeck){[Runtime.InteropServices.Marshal]::ReleaseComObject($openDeck)|Out-Null};[Runtime.InteropServices.Marshal]::ReleaseComObject($office)|Out-Null}
