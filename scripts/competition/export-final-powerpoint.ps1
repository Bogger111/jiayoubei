$ErrorActionPreference = 'Stop'
$careRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$carePptx = Join-Path $careRoot 'deliverables/家有备_创客大赛_终版.pptx'
$carePdf = Join-Path $careRoot 'deliverables/家有备_创客大赛_终版.pdf'
$careRender = Join-Path $careRoot 'test-results/final-sprint/ppt-render'
New-Item -ItemType Directory -Path $careRender -Force | Out-Null
$careApp = New-Object -ComObject PowerPoint.Application
$careInitialCount = $careApp.Presentations.Count
$carePresentation = $null
try {
    $carePresentation = $careApp.Presentations.Open($carePptx, -1, 0, 0)
    if ($carePresentation.Slides.Count -ne 14) { throw 'Unexpected slide count' }
    $carePresentation.SaveAs($carePdf, 32)
    $carePresentation.Export($careRender, 'PNG', 1600, 900)
    $careFindings = @()
    $careMedia = @()
    foreach ($careSlide in $carePresentation.Slides) {
        foreach ($careShape in $careSlide.Shapes) {
            if ($careShape.Type -eq 16) { $careMedia += [pscustomobject]@{ slide = $careSlide.SlideIndex; lengthMs = $careShape.MediaFormat.Length; type = $careShape.MediaType } }
            if ($careShape.HasTextFrame -eq -1 -and $careShape.TextFrame.HasText -eq -1) {
                $careText = $careShape.TextFrame2.TextRange
                if ($careText.BoundHeight -gt ($careShape.Height + 4)) {
                    $careFindings += [pscustomobject]@{ slide = $careSlide.SlideIndex; shape = $careShape.Name; height = $careShape.Height; textHeight = $careText.BoundHeight }
                }
            }
        }
    }
    [pscustomobject]@{ slides = $carePresentation.Slides.Count; width = $carePresentation.PageSetup.SlideWidth; height = $carePresentation.PageSetup.SlideHeight; textOverflow = $careFindings; media = $careMedia; pdf = $carePdf; render = $careRender } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $careRoot 'test-results/final-sprint/powerpoint-render.json') -Encoding utf8
    Write-Output ('Rendered ' + $carePresentation.Slides.Count + ' slides and exported PDF')
} finally {
    if ($carePresentation) { $carePresentation.Close(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($carePresentation) | Out-Null }
    if ($careInitialCount -eq 0) { $careApp.Quit() }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($careApp) | Out-Null
}
