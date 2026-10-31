$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath '.').Path
$checkRoot=Join-Path $taskRoot '.care-local\room-video-upgrade'
Copy-Item -LiteralPath (Join-Path $checkRoot 'final-v2\家有备_多模态家庭助手.pptx') -Destination (Join-Path $checkRoot 'playback-input.pptx') -Force
$office=New-Object -ComObject PowerPoint.Application
$initial=$office.Presentations.Count
$deck=$null;$window=$null;$results=@()
try{
 $deck=$office.Presentations.Open((Join-Path $checkRoot 'playback-input.pptx'),-1,0,0)
 $deck.SlideShowSettings.ShowType=2
 $window=$deck.SlideShowSettings.Run()
 foreach($number in @(4,7,10)){
  $window.View.GotoSlide($number)
  foreach($shape in $deck.Slides.Item($number).Shapes){
   if($shape.Type -eq 16){$player=$window.View.Player([int]$shape.Id);$player.Play();Start-Sleep -Milliseconds 1200;$start=$player.CurrentPosition;$middle=$null;$ending=$null;if($number -eq 7){$player.CurrentPosition=18000;Start-Sleep -Milliseconds 650;$middle=$player.CurrentPosition;$player.CurrentPosition=35000;Start-Sleep -Milliseconds 650;$ending=$player.CurrentPosition};$results+=[pscustomobject]@{slide=$number;positionMs=$start;middleMs=$middle;endingMs=$ending;state=$player.State;lengthMs=$shape.MediaFormat.Length};$player.Stop()}
  }
 }
 $window.View.Exit();$window=$null
 $results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot '.care-local\room-video-upgrade\ppt-playback-checks.json') -Encoding utf8
 if($results.Count -ne 3 -or @($results | Where-Object {$_.positionMs -le 0}).Count -gt 0){throw 'One or more embedded videos did not advance.'}
 $results | Format-Table
}finally{if($window){try{$window.View.Exit()}catch{}};if($deck){try{$deck.Close()}catch{};try{[Runtime.InteropServices.Marshal]::ReleaseComObject($deck)|Out-Null}catch{}};if($initial -eq 0){try{$office.Quit()}catch{}};try{[Runtime.InteropServices.Marshal]::ReleaseComObject($office)|Out-Null}catch{}}
