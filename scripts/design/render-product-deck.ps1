$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath '.').Path
$build=Join-Path $taskRoot '.care-local\visual-upgrade'
$mediaRoot=Join-Path $taskRoot 'test-results\visual-upgrade\product'
$renderRoot=Join-Path $taskRoot 'test-results\visual-upgrade\ppt-render'
New-Item -ItemType Directory -Path $renderRoot -Force | Out-Null
$scope=Get-Content -LiteralPath (Join-Path $build 'ppt-edit-scope.json') -Raw -Encoding utf8 | ConvertFrom-Json
$office=New-Object -ComObject PowerPoint.Application
$initial=$office.Presentations.Count
$deck=$null
try{
 $deck=$office.Presentations.Open((Join-Path $build 'ppt-draft.pptx'),0,0,0)
 foreach($entry in $scope.media){
  $slide=$deck.Slides.Item([int]$entry.slide)
  $poster=$null
  foreach($shape in $slide.Shapes){if($shape.AlternativeText -eq $entry.alt){$poster=$shape;break}}
  if(!$poster){
   $matches=@($slide.Shapes | Where-Object {$_.Type -eq 13 -and $_.Left -gt 400 -and $_.Width -gt 400})
   if($matches.Count -eq 1){$poster=$matches[0]}
  }
  if(!$poster){throw ('Missing media placeholder: '+$entry.alt)}
  $x=$poster.Left;$y=$poster.Top;$w=$poster.Width;$h=$poster.Height
  $poster.Delete()
  $video=$slide.Shapes.AddMediaObject2((Join-Path $mediaRoot $entry.file),0,-1,$x,$y,$w,$h)
  $video.Name='家有备_当前产品_'+$entry.alt
  $video.AlternativeText=$entry.alt
  $video.MediaFormat.SetDisplayPictureFromFile((Join-Path $mediaRoot $entry.poster))
  $video.AnimationSettings.PlaySettings.PlayOnEntry=0
  $video.AnimationSettings.PlaySettings.RewindMovie=-1
  $video.AnimationSettings.PlaySettings.LoopUntilStopped=0
 }
 $deck.SaveAs((Join-Path $build 'ppt-candidate.pptx'),24)
 $deck.Export($renderRoot,'PNG',1600,900)
 $deck.SaveAs((Join-Path $build 'ppt-preview.pdf'),32)
 $overflow=@();$media=@();$textCount=0
 foreach($slide in $deck.Slides){
  foreach($shape in $slide.Shapes){
   if($shape.Type -eq 16){$media+=[pscustomobject]@{slide=$slide.SlideIndex;name=$shape.Name;lengthMs=$shape.MediaFormat.Length;width=$shape.Width;height=$shape.Height}}
   if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1){
    $textCount++;$t=$shape.TextFrame2.TextRange
    if($t.BoundHeight -gt $shape.Height+3 -or $t.BoundWidth -gt $shape.Width+3){$overflow+=[pscustomobject]@{slide=$slide.SlideIndex;text=$t.Text;boxWidth=$shape.Width;boxHeight=$shape.Height;textWidth=$t.BoundWidth;textHeight=$t.BoundHeight}}
   }
  }
 }
 [pscustomobject]@{slides=$deck.Slides.Count;width=$deck.PageSetup.SlideWidth;height=$deck.PageSetup.SlideHeight;editableText=$textCount;overflow=$overflow;media=$media} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $build 'ppt-native-checks.json') -Encoding utf8
 Write-Output ('Rendered '+$deck.Slides.Count+' slides, '+$textCount+' editable text shapes, '+$media.Count+' embedded videos, '+$overflow.Count+' text overflow findings.')
}finally{if($deck){$deck.Close();[Runtime.InteropServices.Marshal]::ReleaseComObject($deck)|Out-Null};if($initial -eq 0){$office.Quit()};[Runtime.InteropServices.Marshal]::ReleaseComObject($office)|Out-Null}
