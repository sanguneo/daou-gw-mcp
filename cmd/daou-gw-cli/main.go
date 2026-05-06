package main

import (
	"os"

	"daou-gw-cli/internal/daou"
)

func main() {
	os.Exit(daou.RunCLI(os.Args[1:]))
}
