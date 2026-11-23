<#
.SYNOPSIS
  Google Play 提出用スクリーンショット（1080x1920 PNG）をテンプレートから一括生成します。
.DESCRIPTION
  store-assets/google-play/screenshots/raw/ に配置した実機スクリーンショットと
  slides.json・template.html を使い、シンプルで落ち着いたストア提出用画像（1080x1920 PNG）を生成します。
  別画像に差し替えたい場合は raw/ の画像を更新するか slides.json の文言を編集して再実行してください。
#>
param(
  [string]$EdgePath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$ssDir = Join-Path $repoRoot "store-assets\google-play\screenshots"
$rawDir = Join-Path $ssDir "raw"
$slidesPath = Join-Path $ssDir "slides.json"
$templatePath = Join-Path $ssDir "template.html"

if (-not $EdgePath) {
  $candidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $EdgePath = $c; break }
  }
}
if (-not $EdgePath -or -not (Test-Path $EdgePath)) {
  throw "Microsoft Edge (msedge.exe) が見つかりませんでした。-EdgePath で指定してください。"
}

$slides = Get-Content -Raw -Encoding UTF8 $slidesPath | ConvertFrom-Json
$templateHtml = Get-Content -Raw -Encoding UTF8 $templatePath
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "kotaeai-store-ss"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

function Clean-FloatingGearOverlay {
  param(
    [string]$InputPath,
    [string]$OutputPath,
    [bool]$MirrorTopCard = $false
  )
  $src = [System.Drawing.Bitmap]::FromFile($InputPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
    $g.Dispose()

    $w = $bmp.Width
    $h = $bmp.Height
    $bgColor = [System.Drawing.Color]::FromArgb(247, 240, 232) # #F7F0E8

    # 左上のフローティング歯車オーバーレイ下端（y=86..158, x=10..96）を綺麗に除去
    $maxX = [Math]::Min(108, [int][Math]::Floor($w * 0.24))
    $minY = [int][Math]::Floor($h * 0.084)
    $maxY = [int][Math]::Floor($h * 0.154)

    for ($y = $minY; $y -le $maxY; $y++) {
      for ($x = 8; $x -le $maxX; $x++) {
        if ($MirrorTopCard) {
          # 左右対称カードの上隅（シャドウ含む）は右側の対称ピクセルから復元
          $mirrorX = $w - 1 - $x
          $bmp.SetPixel($x, $y, $bmp.GetPixel($mirrorX, $y))
        } else {
          $bmp.SetPixel($x, $y, $bgColor)
        }
      }
    }

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } finally {
    $src.Dispose()
  }
}

foreach ($slide in $slides) {
  $rawFile = Join-Path $rawDir $slide.raw
  if (-not (Test-Path $rawFile)) {
    throw "元スクリーンショットが見つかりません: $rawFile"
  }

  $imgForRender = $rawFile
  if ($slide.cleanGear) {
    $cleanedPath = Join-Path $tmpDir ("clean_" + [System.IO.Path]::GetFileNameWithoutExtension($slide.raw) + ".png")
    Clean-FloatingGearOverlay -InputPath $rawFile -OutputPath $cleanedPath -MirrorTopCard ([bool]$slide.mirrorTopCard)
    $imgForRender = $cleanedPath
  }

  $imgUri = "file:///" + ($imgForRender -replace '\\', '/')
  $backDisplay = if ($slide.showBackArrow) { "flex" } else { "none" }
  $menuDisplay = if ($slide.showMenuIcon) { "flex" } else { "none" }
  $progDisplay = if ($slide.showQuizProgress) { "block" } else { "none" }
  $overlayHeight = if ($slide.showQuizProgress) { "192px" } else { "176px" }

  $injectScript = @"
<script>
  document.getElementById('eyebrow').textContent = $(ConvertTo-Json ([string]$slide.eyebrow));
  document.getElementById('title').textContent = $(ConvertTo-Json ([string]$slide.title));
  document.getElementById('subtitle').textContent = $(ConvertTo-Json ([string]$slide.subtitle));
  document.getElementById('header-title').textContent = $(ConvertTo-Json ([string]$slide.headerTitle));
  document.getElementById('screen-img').src = $(ConvertTo-Json $imgUri);
  document.getElementById('back-arrow').style.display = '$backDisplay';
  document.getElementById('menu-icon').style.display = '$menuDisplay';
  document.getElementById('quiz-progress').style.display = '$progDisplay';
  document.getElementById('top-overlay').style.height = '$overlayHeight';
</script>
</body>
"@

  $renderedHtml = $templateHtml -replace '</body>', $injectScript
  $htmlFile = Join-Path $tmpDir ("slide_" + [System.IO.Path]::GetFileNameWithoutExtension($slide.output) + ".html")
  [System.IO.File]::WriteAllText($htmlFile, $renderedHtml, (New-Object System.Text.UTF8Encoding($false)))

  $tmpShot = Join-Path $tmpDir ("shot_" + $slide.output)
  $outFile = Join-Path $ssDir $slide.output
  if (Test-Path $tmpShot) { Remove-Item $tmpShot -Force }

  $fileUri = "file:///" + ($htmlFile -replace '\\', '/')
  $args = @(
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1080,1920",
    "--screenshot=$tmpShot",
    $fileUri
  )
  $proc = Start-Process -FilePath $EdgePath -ArgumentList $args -Wait -PassThru -NoNewWindow
  if (-not (Test-Path $tmpShot)) {
    throw "レンダリング失敗: $($slide.output) (exit $($proc.ExitCode))"
  }

  # 厳密に 1080x1920 24-bit RGB 透過なし PNG として保存
  $img = [System.Drawing.Image]::FromFile($tmpShot)
  try {
    $bmp = New-Object System.Drawing.Bitmap(1080, 1920, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $bmp.SetResolution(96, 96)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, 1080, 1920)), (New-Object System.Drawing.Rectangle(0, 0, [Math]::Min(1080, $img.Width), [Math]::Min(1920, $img.Height))), [System.Drawing.GraphicsUnit]::Pixel)
      } finally {
        $g.Dispose()
      }
      $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $img.Dispose()
  }

  $fi = Get-Item $outFile
  Write-Output ("OK: {0,-18} 1080x1920  {1,6} KB" -f $slide.output, [Math]::Round($fi.Length / 1KB, 1))
}
