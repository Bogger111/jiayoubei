$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath '.').Path
$build=Join-Path $taskRoot '.care-local\memory-room-upgrade'
$target=Join-Path $taskRoot 'deliverables\家有备_多模态家庭助手.pptx'
$final=Join-Path $build 'final\家有备_多模态家庭助手.pptx'
$manifest=Get-Content -LiteralPath (Join-Path $build 'source-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
if((Get-FileHash -LiteralPath $target).Hash -ne $manifest.sha256){throw 'The source was edited during this task; preserve and inspect the newer copy first.'}
$backupRoot=Join-Path (Split-Path $taskRoot -Parent) ('家有备备份\记忆与空间更新_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path (Join-Path $backupRoot 'before') -Force | Out-Null
Copy-Item -LiteralPath $target -Destination (Join-Path $backupRoot 'before\家有备_多模态家庭助手.pptx')
Copy-Item -LiteralPath (Join-Path $taskRoot 'deliverables\家有备_静态预览.pdf') -Destination (Join-Path $backupRoot 'before\家有备_静态预览.pdf')
$office=New-Object -ComObject PowerPoint.Application
$openDeck=$null;$reopen=$false
try{
 foreach($deck in $office.Presentations){if($deck.FullName -eq $target){$openDeck=$deck;break}}
 if($openDeck){
  if($openDeck.Saved -ne -1){throw 'The open presentation has unsaved edits; snapshot and rebuild before installation.'}
  $reopen=$true;$openDeck.Close();[Runtime.InteropServices.Marshal]::ReleaseComObject($openDeck)|Out-Null;$openDeck=$null
 }
 Copy-Item -LiteralPath $final -Destination $target -Force
 Copy-Item -LiteralPath (Join-Path $build 'final\家有备_静态预览.pdf') -Destination (Join-Path $taskRoot 'deliverables\家有备_静态预览.pdf') -Force
 if((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $final).Hash){throw 'Installed file checksum mismatch'}
 if($reopen){$openDeck=$office.Presentations.Open($target,0,0,-1);$openDeck.Windows.Item(1).View.GotoSlide(6)}
 [pscustomobject]@{backup=$backupRoot;installed=$target;sha256=(Get-FileHash -LiteralPath $target).Hash;reopened=$reopen;slides=15;memorySlide=6} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $build 'installation.json') -Encoding utf8
 Write-Output 'Installed the validated PPT and PDF; restored the open presentation at its new memory page.'
}finally{if($openDeck){[Runtime.InteropServices.Marshal]::ReleaseComObject($openDeck)|Out-Null};[Runtime.InteropServices.Marshal]::ReleaseComObject($office)|Out-Null}
