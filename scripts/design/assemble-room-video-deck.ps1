$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath '.').Path
$build=Join-Path $taskRoot '.care-local\room-video-upgrade'
$assets=Join-Path $taskRoot 'test-results\room-video-upgrade'
$render=Join-Path $assets 'ppt-render'
$sourceRender=Join-Path $build 'source-render'
New-Item -ItemType Directory -Path $render,$sourceRender -Force | Out-Null
$office=New-Object -ComObject PowerPoint.Application
$initial=$office.Presentations.Count;$deck=$null
try{
 $deck=$office.Presentations.Open((Join-Path $build 'source-current.pptx'),0,0,0)
 if($deck.Slides.Count -ne 15){throw 'Inspect the updated source slide order before proceeding'}
 $deck.Export($sourceRender,'PNG',1600,900)
 $voice=$deck.Slides.Item(5)
 $image=$voice.Shapes.AddPicture((Join-Path $assets 'voice-interface.png'),0,-1,457.5,150,682.5,399)
 $image.Name='家有备_当前助手语音入口';$image.AlternativeText='当前家有备助手界面，底部提供麦克风输入入口'
 $caption=$voice.Shapes.AddTextbox(1,465,573.75,675,27)
 $caption.TextFrame.MarginLeft=0;$caption.TextFrame.MarginRight=0;$caption.TextFrame.MarginTop=0;$caption.TextFrame.MarginBottom=0
 $caption.TextFrame.TextRange.Text='说出需求，继续对话'
 $caption.TextFrame.TextRange.Font.Name='Microsoft YaHei';$caption.TextFrame.TextRange.Font.Size=16.5;$caption.TextFrame.TextRange.Font.Color.RGB=6055474
 $inserted=$deck.Slides.InsertFromFile((Join-Path $build 'room-slide.pptx'),6,1,1)
 if($inserted -ne 1 -or $deck.Slides.Count -ne 16){throw 'New room slide insertion failed'}
 $slide=$deck.Slides.Item(7)
 $posters=@($slide.Shapes | Where-Object {$_.Type -eq 13 -and $_.Left -gt 400 -and $_.Width -gt 500})
 if($posters.Count -ne 1){throw 'Missing room-video poster'}
 $poster=$posters[0];$x=$poster.Left;$y=$poster.Top;$w=$poster.Width;$h=$poster.Height;$poster.Delete()
 $video=$slide.Shapes.AddMediaObject2((Join-Path $assets '照片生成与家具编辑.mp4'),0,-1,$x,$y,$w,$h)
 $video.Name='家有备_照片生成到家具微调保存_实际录屏';$video.AlternativeText='从六张房间照片生成布局，调整办公椅宽度和角度，保存并刷新查看'
 $video.MediaFormat.SetDisplayPictureFromFile((Join-Path $assets 'saved-room-canvas.png'))
 $video.AnimationSettings.PlaySettings.PlayOnEntry=0;$video.AnimationSettings.PlaySettings.RewindMovie=-1;$video.AnimationSettings.PlaySettings.LoopUntilStopped=0
 foreach($slide in $deck.Slides){foreach($shape in $slide.Shapes){
  if($shape.HasTextFrame -eq -1 -and $shape.Top -gt 600 -and $shape.Left -gt 1000 -and $shape.TextFrame.TextRange.Text.Trim() -match '^\d{1,2}$'){$shape.TextFrame.TextRange.Text=$slide.SlideIndex.ToString('00')}
 }}
 $deck.SaveAs((Join-Path $build 'ppt-candidate.pptx'),24)
 $deck.Export($render,'PNG',1600,900)
 $deck.SaveAs((Join-Path $build 'ppt-preview.pdf'),32)
 $overflow=@();$media=@()
 foreach($slide in $deck.Slides){foreach($shape in $slide.Shapes){
  if($shape.Type -eq 16){$media+=[pscustomobject]@{slide=$slide.SlideIndex;lengthMs=$shape.MediaFormat.Length;name=$shape.Name;width=$shape.Width;height=$shape.Height}}
  if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1){$t=$shape.TextFrame2.TextRange;if($t.BoundHeight -gt $shape.Height+3 -or $t.BoundWidth -gt $shape.Width+3){$overflow+=[pscustomobject]@{slide=$slide.SlideIndex;text=$t.Text}}}
 }}
 [pscustomobject]@{slides=$deck.Slides.Count;imageAddedTo=5;insertedSlide=7;overflow=$overflow;media=$media} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $build 'ppt-native-checks.json') -Encoding utf8
 if($overflow.Count -or $media.Count -ne 3){throw 'Native layout or media verification failed'}
 Write-Output ('Rendered 16 pages; voice image added; 3 embedded videos including the new actual room recording; no text overflow.')
}finally{if($deck){$deck.Close();[Runtime.InteropServices.Marshal]::ReleaseComObject($deck)|Out-Null};if($initial -eq 0){$office.Quit()};[Runtime.InteropServices.Marshal]::ReleaseComObject($office)|Out-Null}
