try {
  $wc = New-Object System.Net.WebClient
  $wc.DownloadString('http://192.168.38.43:9222/json/version')
} catch {
  $_.Exception.ToString()
}
