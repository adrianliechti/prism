package server

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type DataEntry struct {
	ID string `json:"id"`

	Updated *time.Time `json:"updated,omitempty"`
}

// safeNameRegex restricts store and id names to a safe character set so they
// cannot be used for path traversal (e.g. "../etc/passwd").
var safeNameRegex = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

func validName(name string) bool {
	return safeNameRegex.MatchString(name)
}

func (s *Server) handleDataList(w http.ResponseWriter, r *http.Request) {
	store := r.PathValue("store")

	if !validName(store) {
		http.Error(w, "invalid store name", http.StatusBadRequest)
		return
	}

	dir := filepath.Join(getDataDir(), store)

	entries, err := os.ReadDir(dir)

	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]string{})
			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	files := make([]DataEntry, 0)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), ".json")

		dataEntry := DataEntry{
			ID: id,
		}

		if info, err := entry.Info(); err == nil {
			modTime := info.ModTime()
			dataEntry.Updated = &modTime
		}

		files = append(files, dataEntry)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func (s *Server) handleDataGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	store := r.PathValue("store")

	if !validName(store) || !validName(id) {
		http.Error(w, "invalid store or id", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(getDataDir(), store, id+".json")

	data, err := os.ReadFile(filePath)

	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (s *Server) handleDataPut(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	store := r.PathValue("store")

	if !validName(store) || !validName(id) {
		http.Error(w, "invalid store or id", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<20))

	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate JSON
	var js json.RawMessage

	if err := json.Unmarshal(body, &js); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	dir := filepath.Join(getDataDir(), store)

	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	filePath := filepath.Join(dir, id+".json")

	if err := writeFileAtomic(filePath, body, 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// writeFileAtomic writes via temp file + rename so a crash mid-write doesn't corrupt the original.
func writeFileAtomic(path string, body []byte, perm os.FileMode) error {
	dir, name := filepath.Split(path)
	tmp, err := os.CreateTemp(dir, name+".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := func() {
		tmp.Close()
		os.Remove(tmpPath)
	}
	if _, err := tmp.Write(body); err != nil {
		cleanup()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		cleanup()
		return err
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, path)
}

func (s *Server) handleDataDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	store := r.PathValue("store")

	if !validName(store) || !validName(id) {
		http.Error(w, "invalid store or id", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(getDataDir(), store, id+".json")

	if err := os.Remove(filePath); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func getDataDir() string {
	home, err := os.UserHomeDir()

	if err != nil {
		return "data"
	}

	return filepath.Join(home, ".local", "share", "prism")
}
