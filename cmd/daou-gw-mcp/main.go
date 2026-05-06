package main

import (
	"log"

	"daou-gw-cli/internal/daou"
)

func main() {
	if err := daou.RunMCP(); err != nil {
		log.Fatal(err)
	}
}
