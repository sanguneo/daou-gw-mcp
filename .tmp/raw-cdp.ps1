$client = New-Object System.Net.Sockets.TcpClient('192.168.38.43', 9222)
$stream = $client.GetStream()
$writer = New-Object System.IO.StreamWriter($stream)
$writer.NewLine = "`r`n"
$writer.AutoFlush = $true
$writer.Write("GET /json/version HTTP/1.1`r`nHost: 192.168.38.43:9222`r`nConnection: close`r`n`r`n")
$buffer = New-Object byte[] 8192
$sb = New-Object System.Text.StringBuilder
while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
  [void]$sb.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $read))
}
$client.Close()
$sb.ToString()
