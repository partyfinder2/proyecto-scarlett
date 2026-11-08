Add-Type -AssemblyName System.Drawing

function New-RoundPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-Fabrica([System.Drawing.Graphics]$g, [int]$size) {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = $size / 256.0

    $bg = New-RoundPath (6 * $s) (6 * $s) (244 * $s) (244 * $s) (58 * $s)
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
        (New-Object System.Drawing.PointF (0, 0)),
        (New-Object System.Drawing.PointF ($size, $size)),
        ([System.Drawing.Color]::FromArgb(255, 16, 185, 129)),
        ([System.Drawing.Color]::FromArgb(255, 4, 120, 87))
    )
    $g.FillPath($grad, $bg)

    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 6, 78, 59))

    $chim = New-RoundPath (78 * $s) (52 * $s) (22 * $s) (46 * $s) (6 * $s)
    $g.FillPath($white, $chim)

    $roof = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pts = @(
        (New-Object System.Drawing.PointF (46 * $s), (128 * $s)),
        (New-Object System.Drawing.PointF (74 * $s), (86 * $s)),
        (New-Object System.Drawing.PointF (102 * $s), (128 * $s)),
        (New-Object System.Drawing.PointF (130 * $s), (86 * $s)),
        (New-Object System.Drawing.PointF (158 * $s), (128 * $s)),
        (New-Object System.Drawing.PointF (186 * $s), (86 * $s)),
        (New-Object System.Drawing.PointF (214 * $s), (128 * $s))
    )
    $roof.AddPolygon($pts)
    $g.FillPath($white, $roof)

    $body = New-RoundPath (46 * $s) (122 * $s) (168 * $s) (78 * $s) (16 * $s)
    $g.FillPath($white, $body)

    foreach ($wx in @(68, 108, 148)) {
        $win = New-RoundPath ($wx * $s) (142 * $s) (26 * $s) (20 * $s) (4 * $s)
        $g.FillPath($ink, $win)
    }
    $door = New-RoundPath (112 * $s) (168 * $s) (32 * $s) (32 * $s) (6 * $s)
    $g.FillPath($ink, $door)

    $badge = New-Object System.Drawing.Drawing2D.GraphicsPath
    $badge.AddEllipse((168 * $s), (156 * $s), (72 * $s), (72 * $s))
    $g.FillPath($ink, $badge)
    $play = New-Object System.Drawing.Drawing2D.GraphicsPath
    $play.AddPolygon(@(
        (New-Object System.Drawing.PointF (196 * $s), (176 * $s)),
        (New-Object System.Drawing.PointF (196 * $s), (208 * $s)),
        (New-Object System.Drawing.PointF (222 * $s), (192 * $s))
    ))
    $g.FillPath($white, $play)

    $grad.Dispose(); $white.Dispose(); $ink.Dispose()
    $bg.Dispose(); $chim.Dispose(); $roof.Dispose(); $body.Dispose(); $badge.Dispose(); $play.Dispose()
}

function New-BmpIconBytes([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Draw-Fabrica $g $size
    $g.Dispose()
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $raw = New-Object byte[] ($data.Stride * $size)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $raw, 0, $raw.Length)
    $bmp.UnlockBits($data)
    $bmp.Dispose()
    $xor = New-Object System.Collections.Generic.List[byte]
    for ($y = $size - 1; $y -ge 0; $y--) {
        $start = $y * $data.Stride
        for ($i = 0; $i -lt ($size * 4); $i++) { $xor.Add($raw[$start + $i]) }
    }
    $maskRow = [int]([Math]::Ceiling($size / 32.0) * 4)
    $mask = New-Object byte[] ($maskRow * $size)
    $header = New-Object System.IO.MemoryStream
    $hw = New-Object System.IO.BinaryWriter $header
    $hw.Write([uint32]40)
    $hw.Write([int32]$size)
    $hw.Write([int32]($size * 2))
    $hw.Write([uint16]1)
    $hw.Write([uint16]32)
    $hw.Write([uint32]0)
    $hw.Write([uint32]($xor.Count + $mask.Length))
    $hw.Write([int32]0)
    $hw.Write([int32]0)
    $hw.Write([uint32]0)
    $hw.Write([uint32]0)
    $hw.Flush()
    $all = New-Object System.Collections.Generic.List[byte]
    $all.AddRange($header.ToArray())
    $all.AddRange($xor)
    $all.AddRange($mask)
    Write-Output -NoEnumerate $all.ToArray()
}

function Write-LE16($bw, [int]$n) {
    $bw.Write([byte]($n -band 255))
    $bw.Write([byte](($n -shr 8) -band 255))
}
function Write-LE32($bw, [int]$n) {
    $bw.Write([byte]($n -band 255))
    $bw.Write([byte](($n -shr 8) -band 255))
    $bw.Write([byte](($n -shr 16) -band 255))
    $bw.Write([byte](($n -shr 24) -band 255))
}

$sizes = 16, 32, 48, 64, 128, 256
$images = foreach ($n in $sizes) { New-BmpIconBytes $n }
$count = $images.Count
$offset = 6 + (16 * $count)
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $out
Write-LE16 $bw 0
Write-LE16 $bw 1
Write-LE16 $bw $count
for ($i = 0; $i -lt $count; $i++) {
    $dim = $sizes[$i]
    $b = if ($dim -ge 256) { [byte]0 } else { [byte]$dim }
    $bw.Write($b)
    $bw.Write($b)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    Write-LE16 $bw 1
    Write-LE16 $bw 32
    Write-LE32 $bw $images[$i].Length
    Write-LE32 $bw $offset
    $offset += $images[$i].Length
}
foreach ($img in $images) { $bw.Write($img) }
$bw.Flush()
$assets = Join-Path $PSScriptRoot "..\assets"
$panelDir = Join-Path $PSScriptRoot "..\panel"
New-Item -ItemType Directory -Force -Path $assets | Out-Null
$ico = [System.IO.Path]::GetFullPath((Join-Path $assets "fabrica.ico"))
$panel = [System.IO.Path]::GetFullPath((Join-Path $panelDir "favicon.ico"))
[System.IO.File]::WriteAllBytes($ico, $out.ToArray())
Copy-Item $ico $panel -Force
$bytes = [System.IO.File]::ReadAllBytes($ico)
Write-Output "$ico bytes=$($bytes.Length) header=$($bytes[0]) $($bytes[1]) $($bytes[2]) $($bytes[3]) dib=$($bytes[6+16*$count])"
