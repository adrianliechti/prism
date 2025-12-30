package server

type Config struct {
	AI *AIConfig `json:"ai,omitempty"`
}

type AIConfig struct {
	Model string `json:"model,omitempty"`
}

type Reflection struct {
	Services []ServiceReflection `json:"services"`
}

type ServiceReflection struct {
	Name    string             `json:"name"`
	Methods []MethodReflection `json:"methods"`
}

type MethodReflection struct {
	Name string `json:"name"`
}
