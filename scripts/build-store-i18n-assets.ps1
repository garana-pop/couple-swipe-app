<#
.SYNOPSIS
  全8言語（デフォルトでは海外7言語）の Google Play フィーチャーグラフィック（1024x500 PNG）および
  多言語スクリーンショット（1080x1920 PNG）を一括生成します。
.EXAMPLE
  # 海外7言語のフィーチャーグラフィック（1024x500 PNG）を生成
  powershell -ExecutionPolicy Bypass -File scripts/build-store-i18n-assets.ps1

  # 特定言語のみ生成
  powershell -ExecutionPolicy Bypass -File scripts/build-store-i18n-assets.ps1 -Locales en-US,fr-FR

  # 実機で撮影した多言語スクショ（raw/<locale>/01-home.jpg〜06-ai-report.jpg）がある言語の1080x1920 PNGも生成
  powershell -ExecutionPolicy Bypass -File scripts/build-store-i18n-assets.ps1 -Screenshots
#>
param(
  [string[]]$Locales = @("en-US", "fr-FR", "ko-KR", "ru-RU", "th", "zh-CN", "zh-TW"),
  [switch]$Screenshots,
  [switch]$IncludeJa,
  [string]$EdgePath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Locales = @($Locales | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($IncludeJa -and ($Locales -notcontains "ja")) {
  $Locales = @("ja") + $Locales
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$storeDir = Join-Path $repoRoot "store-assets\google-play"
$localizedRoot = Join-Path $storeDir "localized"
$i18nDir = Join-Path $repoRoot "store-assets\i18n\locales"
$iconPath = Join-Path $repoRoot "assets\icon.png"
$ssTemplatePath = Join-Path $storeDir "screenshots\template.html"
$rawBaseDir = Join-Path $storeDir "screenshots\raw"

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

$workDir = Join-Path $repoRoot ".expo\tmp-store-i18n"
$edgeProfile = Join-Path $workDir "edge-profile"
New-Item -ItemType Directory -Force -Path $edgeProfile | Out-Null

$iconUri = "file:///" + ($iconPath -replace '\\', '/')

function Escape-Html {
  param([string]$Text)
  if ($null -eq $Text) { return "" }
  return [System.Net.WebUtility]::HtmlEncode($Text)
}

function Render-HtmlToPng {
  param(
    [string]$HtmlContent,
    [string]$Name,
    [int]$Width,
    [int]$Height,
    [string]$OutPath
  )

  $outDir = Split-Path -Parent $OutPath
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null

  $htmlFile = Join-Path $workDir "$Name.html"
  $tmpPng = Join-Path $workDir "$Name.raw.png"
  [System.IO.File]::WriteAllText($htmlFile, $HtmlContent, (New-Object System.Text.UTF8Encoding($false)))
  if (Test-Path $tmpPng) { Remove-Item $tmpPng -Force }

  $fileUri = "file:///" + ($htmlFile -replace '\\', '/')
  $edgeArgs = @(
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "--user-data-dir=$edgeProfile",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=$Width,$Height",
    "--screenshot=$tmpPng",
    $fileUri
  )

  $proc = Start-Process -FilePath $EdgePath -ArgumentList $edgeArgs -PassThru -NoNewWindow
  if (-not $proc.WaitForExit(20000)) {
    $proc.Kill()
    throw "レンダリングがタイムアウトしました: $Name"
  }
  if (-not (Test-Path $tmpPng)) {
    throw "レンダリング失敗: $Name (exit $($proc.ExitCode))"
  }

  $src = [System.Drawing.Image]::FromFile($tmpPng)
  try {
    $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $bmp.SetResolution(96, 96)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage(
          $src,
          (New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)),
          (New-Object System.Drawing.Rectangle(0, 0, [Math]::Min($Width, $src.Width), [Math]::Min($Height, $src.Height))),
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $g.Dispose()
      }
      $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $src.Dispose()
  }

  $fi = Get-Item $OutPath
  Write-Output ("OK: {0,-66} {1,4}x{2,-4} RGB  {3,6} KB" -f ($OutPath.Replace($repoRoot + "\", "")), $Width, $Height, [Math]::Round($fi.Length / 1KB, 1))
}

function Build-FeatureGraphicHtml {
  param($Meta)

  $fg = $Meta.featureGraphic
  $loc = [string]$Meta.locale
  $isCjk = ($loc -in @("ja", "zh-CN", "zh-TW", "ko-KR"))
  $isThai = ($loc -eq "th")

  $headlineSize = if ($isCjk) { "33px" } elseif ($isThai) { "31px" } else { "29px" }
  $headlineLineHeight = if ($isThai) { "1.48" } elseif ($isCjk) { "1.40" } else { "1.30" }
  $subcopySize = if ($isCjk) { "14.5px" } elseif ($isThai) { "14.5px" } else { "14px" }
  $subcopyLineHeight = if ($isThai) { "1.75" } else { "1.64" }
  $pillFontSize = if ($isCjk) { "12.5px" } elseif ($isThai) { "12.5px" } else { "11.8px" }
  $pillPad = if ($isCjk) { "8px 14px" } else { "7px 12px" }
  $cardQSize = if ($isCjk) { "18.5px" } elseif ($isThai) { "18px" } else { "17px" }
  $cardQLineHeight = if ($isThai) { "1.56" } else { "1.42" }
  $dirChipSize = if ($isCjk) { "12.5px" } elseif ($isThai) { "12.5px" } else { "12px" }
  $dirLeftPos = if ($isCjk) { "-16px" } else { "-14px" }
  $dirRightPos = if ($isCjk) { "-16px" } else { "-14px" }

  $brandSub = Escape-Html $fg.brandSub
  $hlBefore = Escape-Html $fg.headlineBefore
  $hlAccent = Escape-Html $fg.headlineAccent
  $hlAfter = Escape-Html $fg.headlineAfter
  $hlLine2 = Escape-Html $fg.headlineLine2
  $sub1 = Escape-Html $fg.subcopyLine1
  $sub2 = Escape-Html $fg.subcopyLine2
  $pill0 = Escape-Html $fg.pills[0]
  $pill1 = Escape-Html $fg.pills[1]
  $pill2 = Escape-Html $fg.pills[2]
  $cardTag = Escape-Html $fg.cardTag
  $qLines = ($fg.cardQuestionLines | ForEach-Object { Escape-Html $_ }) -join "<br />"
  $cardFooterLabel = Escape-Html $fg.cardFooterLabel
  $cardMatchPill = Escape-Html $fg.cardMatchPill
  $chUp = Escape-Html $fg.choices.up
  $chLeft = Escape-Html $fg.choices.left
  $chRight = Escape-Html $fg.choices.right
  $chDown = Escape-Html $fg.choices.down
  $fontFamily = [string]$Meta.fontFamily

  return @"
<!DOCTYPE html>
<html lang="$loc">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1024px;
    height: 500px;
    overflow: hidden;
    font-family: $fontFamily;
    -webkit-font-smoothing: antialiased;
    color: #2D2522;
  }

  .canvas {
    position: relative;
    width: 1024px;
    height: 500px;
    background:
      radial-gradient(circle at 74% 52%, rgba(242, 160, 126, 0.30) 0%, rgba(242, 160, 126, 0.08) 38%, rgba(242, 160, 126, 0) 68%),
      radial-gradient(circle at 14% 16%, rgba(255, 250, 244, 0.94) 0%, rgba(255, 250, 244, 0) 52%),
      linear-gradient(128deg, #FAF5EE 0%, #F6EDE2 52%, #EEDAC9 100%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 34px 0 46px;
  }

  .left-col {
    position: relative;
    z-index: 2;
    width: 492px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 22px;
  }

  .app-icon-wrap {
    width: 72px;
    height: 72px;
    border-radius: 18px;
    overflow: hidden;
    flex-shrink: 0;
    box-shadow:
      0 12px 24px rgba(176, 70, 44, 0.24),
      0 3px 8px rgba(130, 48, 28, 0.14);
  }
  .app-icon-wrap img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .brand-name {
    font-family: "Noto Sans", "Segoe UI Variable Display", sans-serif;
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.3px;
    line-height: 1.08;
    color: #2D2522;
  }
  .brand-sub {
    font-size: 13.5px;
    font-weight: 700;
    color: #C7593F;
    letter-spacing: 0.15px;
    line-height: 1.35;
  }

  .headline {
    font-size: $headlineSize;
    font-weight: 700;
    line-height: $headlineLineHeight;
    letter-spacing: -0.35px;
    color: #2B2320;
    margin-bottom: 14px;
  }
  .headline .accent {
    color: #D86247;
  }

  .subcopy {
    font-size: $subcopySize;
    font-weight: 500;
    line-height: $subcopyLineHeight;
    color: #6B5E56;
    margin-bottom: 22px;
  }

  .pills {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: $pillPad;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.93);
    border: 1px solid rgba(228, 216, 202, 0.85);
    box-shadow: 0 6px 16px rgba(107, 78, 61, 0.08);
    font-size: $pillFontSize;
    font-weight: 700;
    color: #3A302C;
    white-space: nowrap;
  }
  .pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .right-col {
    position: relative;
    width: 448px;
    height: 452px;
    flex-shrink: 0;
  }

  .motif-tick {
    position: absolute;
    background: rgba(224, 109, 83, 0.42);
    border-radius: 999px;
    z-index: 1;
  }
  .motif-tick.top { width: 5px; height: 15px; left: 221.5px; top: 72px; }
  .motif-tick.bottom { width: 5px; height: 15px; left: 221.5px; bottom: 72px; }
  .motif-tick.left { width: 12px; height: 5px; left: 89px; top: 223.5px; }
  .motif-tick.right { width: 12px; height: 5px; right: 85px; top: 223.5px; }

  .dir-chip {
    position: absolute;
    z-index: 4;
    padding: 7px 13px;
    border-radius: 12px;
    font-size: $dirChipSize;
    font-weight: 700;
    letter-spacing: 0.15px;
    box-shadow: 0 8px 18px rgba(72, 52, 42, 0.10);
    white-space: nowrap;
  }
  .dir-up {
    top: 20px; left: 50%; transform: translateX(-50%);
    background: #CFE5D6; color: #2F593C; border: 1px solid #C2DEC9;
  }
  .dir-down {
    bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #F6D0D7; color: #A83B4B; border: 1px solid #F2C3CC;
  }
  .dir-left {
    left: $dirLeftPos; top: 50%; transform: translateY(-50%);
    background: #CCE0EF; color: #33587A; border: 1px solid #BFD7EA;
  }
  .dir-right {
    right: $dirRightPos; top: 50%; transform: translateY(-50%);
    background: #F6D8B4; color: #9B5816; border: 1px solid #F2CEA4;
  }

  .card-back {
    position: absolute;
    left: 113px; top: 112px;
    width: 174px; height: 232px;
    border-radius: 24px;
    background: linear-gradient(155deg, #FEE9D2 0%, #F9D9B9 100%);
    border: 1.5px solid rgba(255, 250, 242, 0.88);
    transform: rotate(-12deg);
    box-shadow:
      0 18px 34px rgba(132, 62, 34, 0.16),
      0 4px 10px rgba(132, 62, 34, 0.08);
    padding: 24px 18px;
    z-index: 2;
  }
  .card-back-bar1 {
    width: 80px; height: 11px; border-radius: 999px;
    background: #E8BC96; margin-top: 28px; margin-bottom: 12px;
  }
  .card-back-bar2 {
    width: 54px; height: 11px; border-radius: 999px;
    background: #ECC6A3;
  }

  .card-front {
    position: absolute;
    left: 141px; top: 102px;
    width: 196px; height: 246px;
    border-radius: 24px;
    background: linear-gradient(160deg, #3E332F 0%, #322926 100%);
    border: 1.5px solid #261E1C;
    transform: rotate(4.5deg);
    box-shadow:
      -10px 22px 38px rgba(45, 37, 34, 0.28),
      -3px 6px 12px rgba(45, 37, 34, 0.14);
    padding: 18px 16px 15px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    z-index: 3;
  }

  .card-tag {
    display: inline-flex;
    align-self: flex-start;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(242, 160, 126, 0.18);
    border: 1px solid rgba(242, 160, 126, 0.22);
    color: #F4B192;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.2px;
    white-space: nowrap;
  }

  .card-q {
    color: #FFFBF7;
    font-size: $cardQSize;
    font-weight: 700;
    line-height: $cardQLineHeight;
    letter-spacing: -0.2px;
    margin-top: -4px;
  }

  .card-footer {
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.11);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .card-footer-label {
    font-size: 10px;
    font-weight: 600;
    color: #D8C9BF;
    white-space: nowrap;
  }
  .card-match-pill {
    padding: 4px 9px;
    border-radius: 999px;
    background: linear-gradient(135deg, #E8785B 0%, #D96246 100%);
    color: #FFFFFF;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15px;
    white-space: nowrap;
    box-shadow: 0 4px 10px rgba(224, 109, 83, 0.32);
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="left-col">
      <div class="brand-row">
        <div class="app-icon-wrap">
          <img src="$iconUri" alt="Kotaeai Icon" />
        </div>
        <div class="brand-text">
          <div class="brand-name">Kotaeai</div>
          <div class="brand-sub">$brandSub</div>
        </div>
      </div>

      <h1 class="headline">
        $hlBefore<span class="accent">$hlAccent</span>$hlAfter<br />
        $hlLine2
      </h1>

      <p class="subcopy">
        $sub1<br />
        $sub2
      </p>

      <div class="pills">
        <div class="pill">
          <span class="pill-dot" style="background:#4A7C59;"></span>
          <span>$pill0</span>
        </div>
        <div class="pill">
          <span class="pill-dot" style="background:#E06D53;"></span>
          <span>$pill1</span>
        </div>
        <div class="pill">
          <span class="pill-dot" style="background:#C97A2B;"></span>
          <span>$pill2</span>
        </div>
      </div>
    </div>

    <div class="right-col">
      <div class="motif-tick top"></div>
      <div class="motif-tick bottom"></div>
      <div class="motif-tick left"></div>
      <div class="motif-tick right"></div>

      <div class="dir-chip dir-up">$chUp</div>
      <div class="dir-chip dir-left">$chLeft</div>
      <div class="dir-chip dir-right">$chRight</div>
      <div class="dir-chip dir-down">$chDown</div>

      <div class="card-back">
        <div class="card-back-bar1"></div>
        <div class="card-back-bar2"></div>
      </div>

      <div class="card-front">
        <div class="card-tag">$cardTag</div>
        <div class="card-q">$qLines</div>
        <div class="card-footer">
          <span class="card-footer-label">$cardFooterLabel</span>
          <span class="card-match-pill">$cardMatchPill</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
"@
}

$ssTemplateHtml = if (Test-Path $ssTemplatePath) { Get-Content -Raw -Encoding UTF8 $ssTemplatePath } else { "" }

foreach ($loc in $Locales) {
  $metaPath = Join-Path $i18nDir "$loc.json"
  if (-not (Test-Path $metaPath)) {
    throw "ストアメタデータが見つかりません: $metaPath"
  }
  $meta = Get-Content -Raw -Encoding UTF8 $metaPath | ConvertFrom-Json

  # 1. Feature Graphic (1024x500 RGB PNG)
  $fgHtml = Build-FeatureGraphicHtml -Meta $meta
  $fgOut = if ($loc -eq "ja") {
    Join-Path $storeDir "feature-graphic-1024x500.png"
  } else {
    Join-Path $localizedRoot "$loc\feature-graphic-1024x500.png"
  }
  Render-HtmlToPng -HtmlContent $fgHtml -Name "fg_$loc" -Width 1024 -Height 500 -OutPath $fgOut

  # 2. Localized Screenshots (1080x1920 RGB PNG) when -Screenshots is passed
  if ($Screenshots) {
    $locRawDir = if ($loc -eq "ja") { $rawBaseDir } else { Join-Path $rawBaseDir $loc }
    if (-not (Test-Path $locRawDir)) {
      Write-Output "SKIP screenshots [$loc]: $locRawDir に実機スクショ (01-home.jpg〜06-ai-report.jpg) を配置すると生成されます。"
      continue
    }

    $locFont = [string]$meta.fontFamily
    $isThai = ($loc -eq "th")
    $isCjk = ($loc -in @("ja", "zh-CN", "zh-TW", "ko-KR"))
    $titleSize = if ($isCjk) { "56px" } elseif ($isThai) { "48px" } else { "48px" }
    $titleLH = if ($isThai) { "1.42" } else { "1.26" }
    $subSize = if ($isCjk) { "26px" } else { "24px" }

    foreach ($slide in $meta.screenshots) {
      $rawFile = Join-Path $locRawDir $slide.raw
      if (-not (Test-Path $rawFile)) {
        $pngAlt = [System.IO.Path]::ChangeExtension($rawFile, ".png")
        if (Test-Path $pngAlt) {
          $rawFile = $pngAlt
        } else {
          Write-Output "SKIP slide [$loc/$($slide.output)]: 元画像なし ($rawFile)"
          continue
        }
      }

      $imgUri = "file:///" + ($rawFile -replace '\\', '/')
      $backDisplay = if ($slide.showBackArrow) { "flex" } else { "none" }
      $menuDisplay = if ($slide.showMenuIcon) { "flex" } else { "none" }
      $progDisplay = if ($slide.showQuizProgress) { "block" } else { "none" }
      $overlayHeight = if ($slide.showQuizProgress) { "192px" } else { "176px" }
      $brandDisplay = if ($slide.showBrandIcon) { "block" } else { "none" }
      $tickDisplay = if ($slide.showBrandIcon) { "none" } else { "inline-block" }

      $overrideStyle = @"
<style>
  html, body { font-family: $locFont !important; }
  .title { font-size: $titleSize !important; line-height: $titleLH !important; }
  .subtitle { font-size: $subSize !important; }
</style>
</head>
"@

      $injectScript = @"
<script>
  document.documentElement.lang = $(ConvertTo-Json $loc);
  document.getElementById('eyebrow').textContent = $(ConvertTo-Json ([string]$slide.eyebrow));
  document.getElementById('title').textContent = $(ConvertTo-Json ([string]$slide.title));
  document.getElementById('subtitle').textContent = $(ConvertTo-Json ([string]$slide.subtitle));
  document.getElementById('header-title').textContent = $(ConvertTo-Json ([string]$slide.headerTitle));
  document.getElementById('screen-img').src = $(ConvertTo-Json $imgUri);
  document.getElementById('brand-icon-img').src = $(ConvertTo-Json $iconUri);
  document.getElementById('brand-badge').style.display = '$brandDisplay';
  document.getElementById('tick-left').style.display = '$tickDisplay';
  document.getElementById('tick-right').style.display = '$tickDisplay';
  document.getElementById('home-pair-connector').style.display = 'none';
  document.getElementById('back-arrow').style.display = '$backDisplay';
  document.getElementById('menu-icon').style.display = '$menuDisplay';
  document.getElementById('quiz-progress').style.display = '$progDisplay';
  document.getElementById('top-overlay').style.height = '$overlayHeight';
</script>
</body>
"@

      $renderedHtml = ($ssTemplateHtml -replace '</head>', $overrideStyle) -replace '</body>', $injectScript
      $outPath = if ($loc -eq "ja") {
        Join-Path $storeDir "screenshots\$($slide.output)"
      } else {
        Join-Path $localizedRoot "$loc\screenshots\$($slide.output)"
      }
      Render-HtmlToPng -HtmlContent $renderedHtml -Name ("ss_" + $loc + "_" + [System.IO.Path]::GetFileNameWithoutExtension($slide.output)) -Width 1080 -Height 1920 -OutPath $outPath
    }
  }
}
