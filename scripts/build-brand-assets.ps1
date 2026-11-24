<#
.SYNOPSIS
  Kotaeai のアプリアイコン一式・スプラッシュ・ファビコン・Google Play ストア用アイコン＆フィーチャーグラフィックを一括生成します。
.DESCRIPTION
  ハート不使用・アプリアイコン文字なしのガイドラインに沿って、
  以下の全グラフィック素材を共通のベクター設計から高精度にレンダリングします。
    - assets/icon.png                              (1024x1024, 24-bit RGB)
    - assets/android-icon-background.png           (1024x1024, 24-bit RGB)
    - assets/android-icon-foreground.png           (1024x1024, 32-bit ARGB, safe zone)
    - assets/android-icon-monochrome.png           (1024x1024, 32-bit ARGB, themed silhouette)
    - assets/splash-icon.png                       (1024x1024, 32-bit ARGB, squircle + Kotaeai wordmark)
    - assets/favicon.png                           (48x48,     24-bit RGB)
    - store-assets/google-play/app-icon-512x512.png        (512x512,  24-bit RGB)
    - store-assets/google-play/feature-graphic-1024x500.png (1024x500, 24-bit RGB)
#>
param(
  [string]$EdgePath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $repoRoot "assets"
$storeDir = Join-Path $repoRoot "store-assets\google-play"
$featureHtmlPath = Join-Path $storeDir "feature-graphic.html"

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

$workDir = Join-Path $repoRoot ".expo\tmp-brand-assets"
$edgeProfile = Join-Path $workDir "edge-profile"
New-Item -ItemType Directory -Force -Path $edgeProfile | Out-Null

function Render-HtmlToPng {
  param(
    [string]$HtmlContent,
    [string]$Name,
    [int]$Width,
    [int]$Height,
    [string]$OutPath,
    [bool]$PreserveAlpha = $false
  )

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
    "--screenshot=$tmpPng"
  )
  if ($PreserveAlpha) {
    $edgeArgs += "--default-background-color=00000000"
  }
  $edgeArgs += $fileUri

  $proc = Start-Process -FilePath $EdgePath -ArgumentList $edgeArgs -PassThru -NoNewWindow
  if (-not $proc.WaitForExit(15000)) {
    $proc.Kill()
    throw "レンダリングがタイムアウトしました: $Name"
  }
  if (-not (Test-Path $tmpPng)) {
    throw "レンダリング失敗: $Name (exit $($proc.ExitCode))"
  }

  $src = [System.Drawing.Image]::FromFile($tmpPng)
  try {
    $pxFmt = if ($PreserveAlpha) { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb } else { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb }
    $bmp = New-Object System.Drawing.Bitmap($Width, $Height, $pxFmt)
    $bmp.SetResolution(96, 96)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        if ($PreserveAlpha) {
          $g.Clear([System.Drawing.Color]::Transparent)
        }
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
  $alphaLabel = if ($PreserveAlpha) { "RGBA" } else { "RGB " }
  Write-Output ("OK: {0,-52} {1,4}x{2,-4} {3}  {4,6} KB" -f ($OutPath.Replace($repoRoot + "\", "")), $Width, $Height, $alphaLabel, [Math]::Round($fi.Length / 1KB, 1))
}

function Resize-PngOpaque {
  param(
    [string]$SourcePath,
    [string]$OutPath,
    [int]$Width,
    [int]$Height
  )
  $src = [System.Drawing.Image]::FromFile($SourcePath)
  try {
    $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $bmp.SetResolution(96, 96)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($src, 0, 0, $Width, $Height)
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
  Write-Output ("OK: {0,-52} {1,4}x{2,-4} RGB   {3,6} KB" -f ($OutPath.Replace($repoRoot + "\", "")), $Width, $Height, [Math]::Round($fi.Length / 1KB, 1))
}

# 共通の背景グラデーション定義（現状の温かみあるテラコッタコーラル＋中央サンリットグロウを維持）
$bgDefs = @'
    <linearGradient id="bgBase" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E57550" />
      <stop offset="42%" stop-color="#DC6847" />
      <stop offset="76%" stop-color="#CE5637" />
      <stop offset="100%" stop-color="#BD452A" />
    </linearGradient>
    <radialGradient id="bgGlow" cx="50%" cy="49%" r="54%" fx="50%" fy="47%">
      <stop offset="0%" stop-color="#FAB28C" stop-opacity="0.62" />
      <stop offset="40%" stop-color="#F1936B" stop-opacity="0.34" />
      <stop offset="76%" stop-color="#E37350" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#D96544" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="bgVignette" cx="50%" cy="50%" r="72%">
      <stop offset="58%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#7D2411" stop-opacity="0.16" />
    </radialGradient>
'@

# 共通のカード＆4方向ティック定義（ハート不使用・文字なし）
$emblemDefs = @'
    <linearGradient id="leftCardFill" x1="10%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#FEE8CF" />
      <stop offset="55%" stop-color="#FDE1C3" />
      <stop offset="100%" stop-color="#FAD8B6" />
    </linearGradient>
    <linearGradient id="rightCardFill" x1="10%" y1="0%" x2="90%" y2="100%">
      <stop offset="0%" stop-color="#FFFEFC" />
      <stop offset="65%" stop-color="#FDF8F2" />
      <stop offset="100%" stop-color="#F8EFE6" />
    </linearGradient>
    <linearGradient id="pillFill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F8C6A2" />
      <stop offset="100%" stop-color="#F1B289" />
    </linearGradient>
    <filter id="leftCardShadow" x="-30%" y="-25%" width="165%" height="165%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#7A210D" flood-opacity="0.22" />
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#7A210D" flood-opacity="0.12" />
    </filter>
    <filter id="rightCardShadow" x="-35%" y="-25%" width="170%" height="165%">
      <feDropShadow dx="-8" dy="16" stdDeviation="18" flood-color="#7A2410" flood-opacity="0.24" />
      <feDropShadow dx="-3" dy="4" stdDeviation="6" flood-color="#8C361D" flood-opacity="0.14" />
    </filter>
    <filter id="tickShadow" x="-80%" y="-80%" width="260%" height="260%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#852610" flood-opacity="0.18" />
    </filter>
'@

# エンブレム本体（1024x1024座標系・完全中央揃え・ハートなし・文字なし）
$emblemMarkup = @'
    <!-- 4方向スワイプを象徴する4つの放射ティック -->
    <g filter="url(#tickShadow)">
      <rect x="502" y="156" width="20" height="44" rx="10" fill="#FDE4C8" />
      <rect x="502" y="824" width="20" height="44" rx="10" fill="#FDE4C8" />
      <rect x="148" y="502" width="44" height="20" rx="10" fill="#FDE4C8" />
      <rect x="832" y="502" width="44" height="20" rx="10" fill="#FDE4C8" />
    </g>

    <!-- 左カード（ウォームクリームピーチ・背面・-15度） -->
    <g transform="translate(414, 514) rotate(-15)">
      <g filter="url(#leftCardShadow)">
        <rect x="-136" y="-224" width="272" height="448" rx="46" fill="url(#leftCardFill)" />
      </g>
      <rect x="-135.2" y="-223.2" width="270.4" height="446.4" rx="45.2" fill="none" stroke="#FFF4E6" stroke-opacity="0.55" stroke-width="1.6" />
      <!-- カード内の控えめなテキストバー（2行） -->
      <rect x="-96" y="-92" width="150" height="28" rx="14" fill="#EBBF99" />
      <rect x="-96" y="-48" width="102" height="28" rx="14" fill="#EFC6A2" />
    </g>

    <!-- 右カード（ウォームアイボリーホワイト・前面・+15度） -->
    <g transform="translate(610, 514) rotate(15)">
      <g filter="url(#rightCardShadow)">
        <rect x="-136" y="-224" width="272" height="448" rx="46" fill="url(#rightCardFill)" />
      </g>
      <rect x="-135.2" y="-223.2" width="270.4" height="446.4" rx="45.2" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="1.6" />
      <!-- カード内のテキストバー（2行） -->
      <rect x="-90" y="-88" width="174" height="29" rx="14.5" fill="#E5D5C8" />
      <rect x="-90" y="-42" width="122" height="29" rx="14.5" fill="#EBE0D6" />
      <!-- 下部の回答・アクションピル -->
      <rect x="-78" y="64" width="156" height="68" rx="34" fill="url(#pillFill)" />
    </g>
'@

# 1. assets/icon.png (1024x1024 RGB フルブリード・文字なし・ハートなし)
$iconHtml = @"
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1024px;height:1024px;overflow:hidden;}</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
$bgDefs
$emblemDefs
  </defs>
  <rect width="1024" height="1024" fill="url(#bgBase)" />
  <rect width="1024" height="1024" fill="url(#bgGlow)" />
  <rect width="1024" height="1024" fill="url(#bgVignette)" />
$emblemMarkup
</svg>
</body></html>
"@
$iconOut = Join-Path $assetsDir "icon.png"
Render-HtmlToPng -HtmlContent $iconHtml -Name "icon-1024" -Width 1024 -Height 1024 -OutPath $iconOut -PreserveAlpha $false

# 2. store-assets/google-play/app-icon-512x512.png (512x512 RGB) & assets/favicon.png (48x48 RGB)
Resize-PngOpaque -SourcePath $iconOut -OutPath (Join-Path $storeDir "app-icon-512x512.png") -Width 512 -Height 512
Resize-PngOpaque -SourcePath $iconOut -OutPath (Join-Path $assetsDir "favicon.png") -Width 48 -Height 48

# 3. assets/android-icon-background.png (1024x1024 RGB)
$androidBgHtml = @"
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1024px;height:1024px;overflow:hidden;}</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
$bgDefs
  </defs>
  <rect width="1024" height="1024" fill="url(#bgBase)" />
  <rect width="1024" height="1024" fill="url(#bgGlow)" />
  <rect width="1024" height="1024" fill="url(#bgVignette)" />
</svg>
</body></html>
"@
Render-HtmlToPng -HtmlContent $androidBgHtml -Name "android-bg" -Width 1024 -Height 1024 -OutPath (Join-Path $assetsDir "android-icon-background.png") -PreserveAlpha $false

# 4. assets/android-icon-foreground.png (1024x1024 RGBA セーフゾーン0.78スケール・文字なし・ハートなし)
$androidFgHtml = @"
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1024px;height:1024px;background:transparent;overflow:hidden;}</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
$emblemDefs
  </defs>
  <g transform="translate(512, 512) scale(0.78) translate(-512, -512)">
$emblemMarkup
  </g>
</svg>
</body></html>
"@
Render-HtmlToPng -HtmlContent $androidFgHtml -Name "android-fg" -Width 1024 -Height 1024 -OutPath (Join-Path $assetsDir "android-icon-foreground.png") -PreserveAlpha $true

# 5. assets/android-icon-monochrome.png (1024x1024 RGBA Android 13+ テーマアイコン用モノクロシルエット・文字なし・ハートなし)
$androidMonoHtml = @"
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1024px;height:1024px;background:transparent;overflow:hidden;}</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <!-- 左カードマスク（バー2本を抜き、右カードとの重なり境界に14pxのスリットを入れる） -->
    <mask id="monoLeftMask">
      <rect width="1024" height="1024" fill="#000000" />
      <g transform="translate(414, 514) rotate(-15)">
        <rect x="-136" y="-224" width="272" height="448" rx="46" fill="#FFFFFF" />
        <rect x="-96" y="-92" width="150" height="28" rx="14" fill="#000000" />
        <rect x="-96" y="-48" width="102" height="28" rx="14" fill="#000000" />
      </g>
      <g transform="translate(610, 514) rotate(15)">
        <rect x="-148" y="-236" width="296" height="472" rx="56" fill="#000000" />
      </g>
    </mask>
    <!-- 右カードマスク（バー2本＋下部ピルを綺麗に抜く） -->
    <mask id="monoRightMask">
      <rect width="1024" height="1024" fill="#000000" />
      <g transform="translate(610, 514) rotate(15)">
        <rect x="-136" y="-224" width="272" height="448" rx="46" fill="#FFFFFF" />
        <rect x="-90" y="-88" width="174" height="29" rx="14.5" fill="#000000" />
        <rect x="-90" y="-42" width="122" height="29" rx="14.5" fill="#000000" />
        <rect x="-78" y="64" width="156" height="68" rx="34" fill="#000000" />
      </g>
    </mask>
  </defs>
  <g transform="translate(512, 512) scale(0.78) translate(-512, -512)">
    <!-- 4方向ティック -->
    <rect x="502" y="156" width="20" height="44" rx="10" fill="#FFFFFF" />
    <rect x="502" y="824" width="20" height="44" rx="10" fill="#FFFFFF" />
    <rect x="148" y="502" width="44" height="20" rx="10" fill="#FFFFFF" />
    <rect x="832" y="502" width="44" height="20" rx="10" fill="#FFFFFF" />
    <!-- 左カード（淡い白） -->
    <rect width="1024" height="1024" fill="#FFFFFF" fill-opacity="0.72" mask="url(#monoLeftMask)" />
    <!-- 右カード（ソリッド白） -->
    <rect width="1024" height="1024" fill="#FFFFFF" mask="url(#monoRightMask)" />
  </g>
</svg>
</body></html>
"@
Render-HtmlToPng -HtmlContent $androidMonoHtml -Name "android-mono" -Width 1024 -Height 1024 -OutPath (Join-Path $assetsDir "android-icon-monochrome.png") -PreserveAlpha $true

# 6. assets/splash-icon.png (1024x1024 RGBA: 角丸スクワークルアイコン＋下部Kotaeaiワードマーク)
$splashHtml = @"
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:1024px;height:1024px;background:transparent;overflow:hidden;}
  .wordmark {
    font-family: "Noto Sans", "Segoe UI Variable Display", "Segoe UI", sans-serif;
    font-weight: 800;
    font-size: 94px;
    letter-spacing: 1px;
    fill: #2D2522;
  }
</style></head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
$bgDefs
$emblemDefs
    <clipPath id="splashSquircle">
      <rect x="192" y="132" width="640" height="640" rx="152" />
    </clipPath>
    <filter id="squircleShadow" x="-15%" y="-12%" width="130%" height="132%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#7A4935" flood-opacity="0.16" />
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#7A4935" flood-opacity="0.09" />
    </filter>
  </defs>

  <!-- 角丸アイコン本体（文字なし・ハートなし） -->
  <g filter="url(#squircleShadow)">
    <rect x="192" y="132" width="640" height="640" rx="152" fill="#DC6847" />
  </g>
  <g clip-path="url(#splashSquircle)">
    <g transform="translate(192, 132) scale(0.625)">
      <rect width="1024" height="1024" fill="url(#bgBase)" />
      <rect width="1024" height="1024" fill="url(#bgGlow)" />
      <rect width="1024" height="1024" fill="url(#bgVignette)" />
$emblemMarkup
    </g>
  </g>

  <!-- スプラッシュ用ブランドロゴ（アイコン外下部） -->
  <text x="512" y="878" text-anchor="middle" class="wordmark">Kotaeai</text>
</svg>
</body></html>
"@
Render-HtmlToPng -HtmlContent $splashHtml -Name "splash-icon" -Width 1024 -Height 1024 -OutPath (Join-Path $assetsDir "splash-icon.png") -PreserveAlpha $true

# 7. store-assets/google-play/feature-graphic-1024x500.png (1024x500 RGB)
if (Test-Path $featureHtmlPath) {
  $iconUri = "file:///" + ($iconOut -replace '\\', '/')
  $featureHtml = (Get-Content -Raw -Encoding UTF8 $featureHtmlPath) -replace '\{\{ICON_URI\}\}', $iconUri
  Render-HtmlToPng -HtmlContent $featureHtml -Name "feature-graphic" -Width 1024 -Height 500 -OutPath (Join-Path $storeDir "feature-graphic-1024x500.png") -PreserveAlpha $false
} else {
  Write-Warning "feature-graphic.html が見つからないためスキップしました: $featureHtmlPath"
}
