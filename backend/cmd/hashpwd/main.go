package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

// Herramienta de uso unico para generar hashes bcrypt de contrasenas.
// Uso: go run ./cmd/hashpwd <contrasena>
func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Uso: go run ./cmd/hashpwd <contrasena>")
		os.Exit(1)
	}
	pwd := os.Args[1]
	hash, err := bcrypt.GenerateFromPassword([]byte(pwd), 12)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(hash))
}
