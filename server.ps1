param([int]$Port = 5173)

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.gif' = 'image/gif'
  '.bmp' = 'image/bmp'
  '.ico' = 'image/x-icon'
  '.md' = 'text/markdown; charset=utf-8'
}

try {
  $listener.Start()
  Write-Host "XiangXu: http://localhost:$Port/"
  Write-Host 'Press Ctrl+C to stop.'
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
      $candidate = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
      if (-not $candidate.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $payload = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
      } else {
        $context.Response.StatusCode = 200
        $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
        $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
        $payload = [System.IO.File]::ReadAllBytes($candidate)
      }
      $context.Response.Headers['Cache-Control'] = 'no-store'
      $context.Response.ContentLength64 = $payload.Length
      $context.Response.OutputStream.Write($payload, 0, $payload.Length)
    } catch {
      $context.Response.StatusCode = 500
    } finally {
      $context.Response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
