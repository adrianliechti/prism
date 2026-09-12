package server

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

var storageMagic = []byte("PRISM\x01")

func privateDir(path string) error {
	if err := os.MkdirAll(path, 0700); err != nil {
		return err
	}
	return os.Chmod(path, 0700)
}

// Each local workspace has a private AES-256 key. Request payloads, headers,
// credentials and drafts all use the same encrypted storage format.
func (s *Server) storageCipher() (cipher.AEAD, error) {
	s.dataKeyMu.Lock()
	defer s.dataKeyMu.Unlock()
	if s.dataKey == nil {
		if err := privateDir(s.dataDir); err != nil {
			return nil, err
		}
		path := filepath.Join(s.dataDir, ".key")
		key, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			key, err = createStorageKey(path)
		}
		if err != nil {
			return nil, err
		}
		if len(key) != 32 {
			return nil, fmt.Errorf("invalid workspace encryption key")
		}
		if err := os.Chmod(path, 0600); err != nil {
			return nil, err
		}
		s.dataKey = key
	}
	block, err := aes.NewCipher(s.dataKey)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func createStorageKey(path string) ([]byte, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".key-*")
	if err != nil {
		return nil, err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.Write(key); err != nil {
		return nil, err
	}
	if err := file.Sync(); err != nil {
		return nil, err
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	// Publish a complete key without replacing one created by another process.
	// Readers can never observe an empty or partially written key.
	if err := os.Link(file.Name(), path); errors.Is(err, os.ErrExist) {
		return os.ReadFile(path)
	} else if err != nil {
		return nil, err
	}
	return key, nil
}

func (s *Server) writeDataFile(path string, data []byte) error {
	aead, err := s.storageCipher()
	if err != nil {
		return err
	}
	if err := privateDir(filepath.Dir(path)); err != nil {
		return err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	prefix := append(append([]byte{}, storageMagic...), nonce...)
	encrypted := aead.Seal(prefix, nonce, data, []byte(filepath.Base(filepath.Dir(path))+"/"+filepath.Base(path)))
	return writeFileAtomic(path, encrypted, 0600)
}

func (s *Server) readDataFile(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if !bytes.HasPrefix(data, storageMagic) {
		if !json.Valid(data) {
			return nil, fmt.Errorf("invalid saved request")
		}
		// Migrate legacy JSON atomically; an interrupted migration leaves the
		// original intact, and existing history remains readable.
		if err := s.writeDataFile(path, data); err != nil {
			return nil, err
		}
		return data, nil
	}
	aead, err := s.storageCipher()
	if err != nil {
		return nil, err
	}
	data = data[len(storageMagic):]
	if len(data) < aead.NonceSize() {
		return nil, fmt.Errorf("invalid encrypted request")
	}
	return aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], []byte(filepath.Base(filepath.Dir(path))+"/"+filepath.Base(path)))
}
