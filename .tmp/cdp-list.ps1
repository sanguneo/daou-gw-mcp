try {
  $wc = New-Object System.Net.WebClient
  $wc.DownloadString('http://192.168.38.43:9222/json/list')
} catch {
  $_.Exception.ToString()
}
