$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath '.').Path
$build=Join-Path $taskRoot '.care-local\memory-room-upgrade'
$renderRoot=Join-Path $taskRoot 'test-results\memory-room-upgrade\ppt-render'
$sourceRender=Join-Path $build 'source-render'
New-Item -ItemType Directory -Path $renderRoot,$sourceRender -Force | Out-Null
$office=New-Object -ComObject PowerPoint.Application
$initial=$office.Presentations.Count;$deck=$null
try{
 $deck=$office.Presentations.Open((Join-Path $build 'source-current.pptx'),0,0,0)
 $deck.Export($sourceRender,'PNG',1600,900)
 $target=0
 foreach($slide in $deck.Slides){foreach($shape in $slide.Shapes){if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.TextRange.Text -like '*把家庭经历*'){$target=$slide.SlideIndex}}}
 if($target -ne 6 -or $deck.Slides.Count -ne 15){throw 'Source deck structure changed; inspect before replacing'}
 $deck.Slides.Item($target).Delete()
 $count=$deck.Slides.InsertFromFile((Join-Path $build 'memory-slide.pptx'),($target-1),1,1)
 Write-Output ('Insert result: '+$count+'; total slides: '+$deck.Slides.Count)
 if($deck.Slides.Count -ne 15){throw 'Slide replacement count mismatch'}
 foreach($shape in $deck.Slides.Item(15).Shapes){if($shape.HasTextFrame -eq -1 -and $shape.Top -gt 600 -and $shape.TextFrame.TextRange.Text.Trim() -eq '16'){$shape.TextFrame.TextRange.Text='15'}}
 $deck.SaveAs((Join-Path $build 'ppt-candidate.pptx'),24)
 $deck.Export($renderRoot,'PNG',1600,900)
 $deck.SaveAs((Join-Path $build 'ppt-preview.pdf'),32)
 $overflow=@();$media=@()
 foreach($slide in $deck.Slides){foreach($shape in $slide.Shapes){
  if($shape.Type -eq 16){$media+=[pscustomobject]@{slide=$slide.SlideIndex;lengthMs=$shape.MediaFormat.Length}}
  if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1){$t=$shape.TextFrame2.TextRange;if($t.BoundHeight -gt $shape.Height+3 -or $t.BoundWidth -gt $shape.Width+3){$overflow+=[pscustomobject]@{slide=$slide.SlideIndex;text=$t.Text}}}
 }}
 $unchanged=@();$changed=@()
 for($n=1;$n -le 15;$n++){if($n -in @($target,15)){continue};$name='幻灯片'+$n+'.PNG';$a=Join-Path $sourceRender $name;$b=Join-Path $renderRoot $name
  if(!(Test-Path -LiteralPath $a)){$name='Slide'+$n+'.PNG';$a=Join-Path $sourceRender $name;$b=Join-Path $renderRoot $name}
  if((Get-FileHash -LiteralPath $a).Hash -eq (Get-FileHash -LiteralPath $b).Hash){$unchanged+=$n}else{$changed+=$n}
 }
 [pscustomobject]@{slides=$deck.Slides.Count;updatedSlides=@($target,15);overflow=$overflow;media=$media;unchanged=$unchanged;unexpectedlyChanged=$changed} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $build 'ppt-native-checks.json') -Encoding utf8
 if($changed.Count -or $overflow.Count -or $media.Count -ne 2){throw 'Presentation verification found an unexpected change'}
 Write-Output ('Replaced current slide 6 and corrected the final page number; other '+$unchanged.Count+' slides render identically; 2 original videos retained; no text overflow.')
}finally{if($deck){$deck.Close();[Runtime.InteropServices.Marshal]::ReleaseComObject($deck)|Out-Null};if($initial -eq 0){$office.Quit()};[Runtime.InteropServices.Marshal]::ReleaseComObject($office)|Out-Null}
