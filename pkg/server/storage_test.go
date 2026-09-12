package server

import (
	"bytes"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/adrianliechti/prism/pkg/config"
)

func TestConcurrentWorkspaceInitialization(t *testing.T) {
	dir := t.TempDir()
	const count = 16
	servers := make([]*Server, count)
	for i := range servers {
		var err error
		servers[i], err = New(&config.Config{DataDir: dir})
		if err != nil {
			t.Fatal(err)
		}
	}
	var ready sync.WaitGroup
	start := make(chan struct{})
	for _, s := range servers {
		ready.Add(1)
		go func() {
			defer ready.Done()
			<-start
			if _, err := s.storageCipher(); err != nil {
				t.Error(err)
			}
		}()
	}
	close(start)
	ready.Wait()
	for _, s := range servers {
		if len(s.dataKey) != 32 || !bytes.Equal(s.dataKey, servers[0].dataKey) {
			t.Fatal("servers initialized different workspace keys")
		}
	}
}

func TestEncryptedStorageAndRestart(t *testing.T) {
	s := testServer(t)
	payload := `{"headers":{"Authorization":"Bearer synthetic-secret"}}`
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest("PUT", "http://localhost/data/drafts/test", strings.NewReader(payload)))
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	path := filepath.Join(s.dataDir, "drafts", "test.json")
	stored, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored, []byte("synthetic-secret")) || !bytes.HasPrefix(stored, storageMagic) {
		t.Fatal("request stored in plaintext")
	}
	for _, path := range []string{path, filepath.Join(s.dataDir, ".key")} {
		info, _ := os.Stat(path)
		if info.Mode().Perm() != 0600 {
			t.Fatalf("file permissions: %s %o", path, info.Mode().Perm())
		}
	}
	for _, path := range []string{s.dataDir, filepath.Join(s.dataDir, "drafts")} {
		info, _ := os.Stat(path)
		if info.Mode().Perm() != 0700 {
			t.Fatalf("directory permissions: %s %o", path, info.Mode().Perm())
		}
	}
	restarted, err := New(&config.Config{DataDir: s.dataDir})
	if err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	restarted.ServeHTTP(w, httptest.NewRequest("GET", "http://localhost/data/drafts/test", nil))
	if w.Code != 200 || w.Body.String() != payload {
		t.Fatalf("restart failed: %d %s", w.Code, w.Body)
	}
	stored[len(stored)-1] ^= 1
	if err := os.WriteFile(path, stored, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.readDataFile(path); err == nil {
		t.Fatal("tampered ciphertext accepted")
	}
}

func TestLegacyRequestsMigrateWithoutLosingData(t *testing.T) {
	s := testServer(t)
	dir := filepath.Join(s.dataDir, "requests")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "legacy.json")
	payload := []byte(`{"id":"legacy","http":{"headers":[{"key":"Authorization","value":"old-secret"}]}}`)
	if err := os.WriteFile(path, payload, 0644); err != nil {
		t.Fatal(err)
	}
	actual, err := s.readDataFile(path)
	if err != nil || !bytes.Equal(actual, payload) {
		t.Fatalf("migration failed: %s %v", actual, err)
	}
	stored, _ := os.ReadFile(path)
	if bytes.Contains(stored, []byte("old-secret")) {
		t.Fatal("legacy credential remained plaintext")
	}
	actual, err = s.readDataFile(path)
	if err != nil || !bytes.Equal(actual, payload) {
		t.Fatalf("migrated read failed: %v", err)
	}
}
