package server

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/reflection/grpc_reflection_v1"
	"google.golang.org/grpc/reflection/grpc_reflection_v1alpha"
	"google.golang.org/grpc/status"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

func (s *Server) handleGRPC(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		s.handleGRPCReflect(w, r)
		return
	}

	scheme := r.PathValue("scheme")
	host := r.PathValue("host")
	path := r.PathValue("path")

	parts := strings.Split(strings.Trim(path, "/"), "/")

	if len(parts) != 2 {
		http.Error(w, "invalid path format, expected 'service/method'", http.StatusBadRequest)
		return
	}

	service := parts[0]
	method := parts[1]

	jsonBody, err := io.ReadAll(r.Body)

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to read body: %v", err), http.StatusBadRequest)
		return
	}

	defer r.Body.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// Forward HTTP headers as gRPC metadata (also used for reflection, so
	// auth-protected reflection services work)
	ctx = metadata.NewOutgoingContext(ctx, grpcMetadataFromRequest(r))

	conn, err := grpc.NewClient(host, grpcTransportCredentials(scheme, r.Header.Get("X-Prism-Insecure") == "true"))

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to connect to %s: %v", host, err), http.StatusBadGateway)
		return
	}

	defer conn.Close()

	reqMsg, methodDesc, err := messageFromJSON(ctx, conn, service, method, jsonBody)

	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if methodDesc.IsStreamingClient() || methodDesc.IsStreamingServer() {
		http.Error(w, "streaming methods are not supported", http.StatusNotImplemented)
		return
	}

	respMsg := dynamicpb.NewMessage(methodDesc.Output())

	var respHeader, respTrailer metadata.MD
	invokeErr := conn.Invoke(ctx, fmt.Sprintf("/%s/%s", service, method), reqMsg, respMsg, grpc.Header(&respHeader), grpc.Trailer(&respTrailer))

	// Write response metadata as HTTP headers (also on errors, where trailers
	// often carry details)
	for k, vals := range respHeader {
		for _, v := range vals {
			w.Header().Add("Grpc-Header-"+k, v)
		}
	}
	for k, vals := range respTrailer {
		for _, v := range vals {
			w.Header().Add("Grpc-Trailer-"+k, v)
		}
	}

	if invokeErr != nil {
		st := status.Convert(invokeErr)
		w.Header().Set("Grpc-Status", st.Code().String())
		w.Header().Set("Grpc-Message", st.Message())
		http.Error(w, fmt.Sprintf("gRPC call failed: %s: %s", st.Code(), st.Message()), httpStatusFromGRPCCode(st.Code()))
		return
	}

	jsonResp, err := protojson.Marshal(respMsg)

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to marshal proto to JSON: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Grpc-Status", codes.OK.String())
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(jsonResp)
}

// hop-by-hop or browser-generated headers that must not leak into gRPC metadata
var skipGRPCMetadata = map[string]bool{
	"content-type":    true,
	"content-length":  true,
	"host":            true,
	"accept":          true,
	"user-agent":      true,
	"accept-encoding": true,
	"accept-language": true,
	"connection":      true,
	"origin":          true,
	"referer":         true,
	"cookie":          true,
	"cache-control":   true,
	"pragma":          true,
	"priority":        true,
	"dnt":             true,
}

func grpcMetadataFromRequest(r *http.Request) metadata.MD {
	md := metadata.New(nil)
	for key, values := range r.Header {
		lowerKey := strings.ToLower(key)
		if skipGRPCMetadata[lowerKey] || strings.HasPrefix(lowerKey, "x-prism-") || strings.HasPrefix(lowerKey, "sec-") {
			continue
		}
		for _, v := range values {
			md.Append(lowerKey, v)
		}
	}
	return md
}

func grpcTransportCredentials(scheme string, insecureSkipVerify bool) grpc.DialOption {
	if scheme == "grpcs" {
		return grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{
			InsecureSkipVerify: insecureSkipVerify,
		}))
	}
	return grpc.WithTransportCredentials(insecure.NewCredentials())
}

// httpStatusFromGRPCCode maps gRPC status codes to HTTP status codes
// (same mapping as grpc-gateway).
func httpStatusFromGRPCCode(code codes.Code) int {
	switch code {
	case codes.OK:
		return http.StatusOK
	case codes.Canceled:
		return 499
	case codes.InvalidArgument, codes.FailedPrecondition, codes.OutOfRange:
		return http.StatusBadRequest
	case codes.DeadlineExceeded:
		return http.StatusGatewayTimeout
	case codes.NotFound:
		return http.StatusNotFound
	case codes.AlreadyExists, codes.Aborted:
		return http.StatusConflict
	case codes.PermissionDenied:
		return http.StatusForbidden
	case codes.Unauthenticated:
		return http.StatusUnauthorized
	case codes.ResourceExhausted:
		return http.StatusTooManyRequests
	case codes.Unimplemented:
		return http.StatusNotImplemented
	case codes.Unavailable:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}

func (s *Server) handleGRPCReflect(w http.ResponseWriter, r *http.Request) {
	scheme := r.PathValue("scheme")
	host := r.PathValue("host")

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	ctx = metadata.NewOutgoingContext(ctx, grpcMetadataFromRequest(r))

	conn, err := grpc.NewClient(host, grpcTransportCredentials(scheme, r.Header.Get("X-Prism-Insecure") == "true"))

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to connect to %s: %v", host, err), http.StatusBadGateway)
		return
	}

	defer conn.Close()

	services, err := reflectServices(ctx, conn)

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to list services: %v", err), http.StatusBadGateway)
		return
	}

	response := &Reflection{
		Services: []ServiceReflection{},
	}

	for _, svc := range services {
		serviceName := string(svc.FullName())

		// Filter out reflection service
		if strings.HasPrefix(serviceName, "grpc.reflection.") {
			continue
		}

		svcReflection := ServiceReflection{
			Name:    serviceName,
			Methods: []MethodReflection{},
		}

		methods := svc.Methods()

		for j := 0; j < methods.Len(); j++ {
			m := methods.Get(j)
			methodRef := MethodReflection{
				Name:   string(m.Name()),
				Schema: buildMessageSchema(m.Input(), map[protoreflect.FullName]bool{}),
			}
			svcReflection.Methods = append(svcReflection.Methods, methodRef)
		}

		response.Services = append(response.Services, svcReflection)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// buildMessageSchema creates a JSON Schema-like representation of a protobuf message.
// visited breaks recursion for self-referential types (e.g. tree nodes).
func buildMessageSchema(msg protoreflect.MessageDescriptor, visited map[protoreflect.FullName]bool) map[string]interface{} {
	schema := map[string]interface{}{
		"type":       "object",
		"properties": map[string]interface{}{},
	}

	if visited[msg.FullName()] {
		schema["description"] = "recursive type " + string(msg.FullName())
		return schema
	}
	visited[msg.FullName()] = true
	defer delete(visited, msg.FullName())

	properties := schema["properties"].(map[string]interface{})
	fields := msg.Fields()

	for i := 0; i < fields.Len(); i++ {
		field := fields.Get(i)
		fieldName := string(field.JSONName())
		properties[fieldName] = buildFieldSchema(field, visited)
	}

	return schema
}

func buildFieldSchema(field protoreflect.FieldDescriptor, visited map[protoreflect.FullName]bool) map[string]interface{} {
	schema := map[string]interface{}{}

	if field.IsList() {
		schema["type"] = "array"
		schema["items"] = buildScalarSchema(field, visited)
		return schema
	}

	if field.IsMap() {
		schema["type"] = "object"
		schema["additionalProperties"] = buildScalarSchema(field.MapValue(), visited)
		return schema
	}

	return buildScalarSchema(field, visited)
}

func buildScalarSchema(field protoreflect.FieldDescriptor, visited map[protoreflect.FullName]bool) map[string]interface{} {
	schema := map[string]interface{}{}

	switch field.Kind() {
	case protoreflect.BoolKind:
		schema["type"] = "boolean"
	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind:
		schema["type"] = "integer"
		schema["format"] = "int32"
	case protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
		schema["type"] = "integer"
		schema["format"] = "int64"
	case protoreflect.Uint32Kind, protoreflect.Fixed32Kind:
		schema["type"] = "integer"
		schema["format"] = "uint32"
	case protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		schema["type"] = "integer"
		schema["format"] = "uint64"
	case protoreflect.FloatKind:
		schema["type"] = "number"
		schema["format"] = "float"
	case protoreflect.DoubleKind:
		schema["type"] = "number"
		schema["format"] = "double"
	case protoreflect.StringKind:
		schema["type"] = "string"
	case protoreflect.BytesKind:
		schema["type"] = "string"
		schema["format"] = "byte"
	case protoreflect.EnumKind:
		schema["type"] = "string"
		enumValues := field.Enum().Values()
		values := make([]string, enumValues.Len())
		for i := 0; i < enumValues.Len(); i++ {
			values[i] = string(enumValues.Get(i).Name())
		}
		schema["enum"] = values
	case protoreflect.MessageKind:
		return buildMessageSchema(field.Message(), visited)
	default:
		schema["type"] = "string"
	}

	return schema
}

func messageFromJSON(ctx context.Context, conn *grpc.ClientConn, service, method string, jsonBody []byte) (proto.Message, protoreflect.MethodDescriptor, error) {
	services, err := reflectServices(ctx, conn)

	if err != nil {
		return nil, nil, err
	}

	svc, err := findService(services, service)

	if err != nil {
		return nil, nil, err
	}

	desc, err := findMethod(svc, method)

	if err != nil {
		return nil, nil, err
	}

	msg := dynamicpb.NewMessage(desc.Input())

	if err := protojson.Unmarshal(jsonBody, msg); err != nil {
		return nil, nil, fmt.Errorf("failed to unmarshal JSON to proto: %w", err)
	}

	return msg, desc, nil
}

// reflectStream abstracts the v1 and v1alpha reflection protocols
// (identical wire format, different proto packages).
type reflectStream interface {
	listServices() ([]string, error)
	fileContainingSymbol(symbol string) ([][]byte, error)
	fileByFilename(name string) ([][]byte, error)
}

type reflectV1 struct {
	stream grpc_reflection_v1.ServerReflection_ServerReflectionInfoClient
}

func (s *reflectV1) listServices() ([]string, error) {
	if err := s.stream.Send(&grpc_reflection_v1.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_ListServices{ListServices: ""},
	}); err != nil {
		return nil, err
	}

	resp, err := s.stream.Recv()

	if err != nil {
		return nil, err
	}

	if errResp := resp.GetErrorResponse(); errResp != nil {
		return nil, status.Error(codes.Code(errResp.ErrorCode), errResp.ErrorMessage)
	}

	listResp := resp.GetListServicesResponse()

	if listResp == nil {
		return nil, fmt.Errorf("no services response received")
	}

	names := make([]string, 0, len(listResp.Service))
	for _, svc := range listResp.Service {
		names = append(names, svc.Name)
	}
	return names, nil
}

func (s *reflectV1) files(req *grpc_reflection_v1.ServerReflectionRequest) ([][]byte, error) {
	if err := s.stream.Send(req); err != nil {
		return nil, err
	}

	resp, err := s.stream.Recv()

	if err != nil {
		return nil, err
	}

	if errResp := resp.GetErrorResponse(); errResp != nil {
		return nil, status.Error(codes.Code(errResp.ErrorCode), errResp.ErrorMessage)
	}

	fdResp := resp.GetFileDescriptorResponse()

	if fdResp == nil {
		return nil, fmt.Errorf("no file descriptor response received")
	}

	return fdResp.FileDescriptorProto, nil
}

func (s *reflectV1) fileContainingSymbol(symbol string) ([][]byte, error) {
	return s.files(&grpc_reflection_v1.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_FileContainingSymbol{FileContainingSymbol: symbol},
	})
}

func (s *reflectV1) fileByFilename(name string) ([][]byte, error) {
	return s.files(&grpc_reflection_v1.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_FileByFilename{FileByFilename: name},
	})
}

type reflectV1Alpha struct {
	stream grpc_reflection_v1alpha.ServerReflection_ServerReflectionInfoClient
}

func (s *reflectV1Alpha) listServices() ([]string, error) {
	if err := s.stream.Send(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_ListServices{ListServices: ""},
	}); err != nil {
		return nil, err
	}

	resp, err := s.stream.Recv()

	if err != nil {
		return nil, err
	}

	if errResp := resp.GetErrorResponse(); errResp != nil {
		return nil, status.Error(codes.Code(errResp.ErrorCode), errResp.ErrorMessage)
	}

	listResp := resp.GetListServicesResponse()

	if listResp == nil {
		return nil, fmt.Errorf("no services response received")
	}

	names := make([]string, 0, len(listResp.Service))
	for _, svc := range listResp.Service {
		names = append(names, svc.Name)
	}
	return names, nil
}

func (s *reflectV1Alpha) files(req *grpc_reflection_v1alpha.ServerReflectionRequest) ([][]byte, error) {
	if err := s.stream.Send(req); err != nil {
		return nil, err
	}

	resp, err := s.stream.Recv()

	if err != nil {
		return nil, err
	}

	if errResp := resp.GetErrorResponse(); errResp != nil {
		return nil, status.Error(codes.Code(errResp.ErrorCode), errResp.ErrorMessage)
	}

	fdResp := resp.GetFileDescriptorResponse()

	if fdResp == nil {
		return nil, fmt.Errorf("no file descriptor response received")
	}

	return fdResp.FileDescriptorProto, nil
}

func (s *reflectV1Alpha) fileContainingSymbol(symbol string) ([][]byte, error) {
	return s.files(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_FileContainingSymbol{FileContainingSymbol: symbol},
	})
}

func (s *reflectV1Alpha) fileByFilename(name string) ([][]byte, error) {
	return s.files(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_FileByFilename{FileByFilename: name},
	})
}

// openReflection connects to the v1 reflection service, falling back to
// v1alpha for servers that only register the deprecated variant.
func openReflection(ctx context.Context, conn *grpc.ClientConn) (reflectStream, []string, error) {
	if stream, err := grpc_reflection_v1.NewServerReflectionClient(conn).ServerReflectionInfo(ctx); err == nil {
		rs := &reflectV1{stream: stream}
		names, err := rs.listServices()
		if err == nil {
			return rs, names, nil
		}
		if status.Code(err) != codes.Unimplemented {
			return nil, nil, err
		}
	}

	stream, err := grpc_reflection_v1alpha.NewServerReflectionClient(conn).ServerReflectionInfo(ctx)

	if err != nil {
		return nil, nil, err
	}

	rs := &reflectV1Alpha{stream: stream}
	names, err := rs.listServices()

	if err != nil {
		return nil, nil, err
	}

	return rs, names, nil
}

func reflectServices(ctx context.Context, conn *grpc.ClientConn) ([]protoreflect.ServiceDescriptor, error) {
	stream, names, err := openReflection(ctx, conn)

	if err != nil {
		return nil, err
	}

	fdProtos := map[string]*descriptorpb.FileDescriptorProto{}

	addFiles := func(raw [][]byte) {
		for _, b := range raw {
			fdProto := &descriptorpb.FileDescriptorProto{}
			if err := proto.Unmarshal(b, fdProto); err != nil {
				continue
			}
			if _, ok := fdProtos[fdProto.GetName()]; !ok {
				fdProtos[fdProto.GetName()] = fdProto
			}
		}
	}

	for _, name := range names {
		if strings.HasPrefix(name, "grpc.reflection.") {
			continue
		}
		raw, err := stream.fileContainingSymbol(name)
		if err != nil {
			continue
		}
		addFiles(raw)
	}

	// Resolve missing imports: ask the server, then fall back to the local
	// registry (covers well-known types when servers omit transitive deps).
	for range 16 {
		var missing []string
		for _, fdProto := range fdProtos {
			for _, dep := range fdProto.GetDependency() {
				if _, ok := fdProtos[dep]; !ok {
					missing = append(missing, dep)
				}
			}
		}
		if len(missing) == 0 {
			break
		}

		progress := false
		for _, dep := range missing {
			if _, ok := fdProtos[dep]; ok {
				continue
			}
			if raw, err := stream.fileByFilename(dep); err == nil {
				addFiles(raw)
			}
			if _, ok := fdProtos[dep]; ok {
				progress = true
				continue
			}
			if fd, err := protoregistry.GlobalFiles.FindFileByPath(dep); err == nil {
				fdProtos[dep] = protodesc.ToFileDescriptorProto(fd)
				progress = true
			}
		}
		if !progress {
			break
		}
	}

	// Drop files whose dependency closure is incomplete so the rest still resolve.
	resolvable := map[string]bool{}
	var canResolve func(name string) bool
	canResolve = func(name string) bool {
		if v, ok := resolvable[name]; ok {
			return v
		}
		fdProto, ok := fdProtos[name]
		if !ok {
			resolvable[name] = false
			return false
		}
		resolvable[name] = true
		for _, dep := range fdProto.GetDependency() {
			if !canResolve(dep) {
				resolvable[name] = false
				return false
			}
		}
		return true
	}

	fdSet := &descriptorpb.FileDescriptorSet{}
	for name, fdProto := range fdProtos {
		if canResolve(name) {
			fdSet.File = append(fdSet.File, fdProto)
		}
	}

	files, err := protodesc.NewFiles(fdSet)

	if err != nil {
		return nil, fmt.Errorf("failed to build descriptors: %w", err)
	}

	var allServices []protoreflect.ServiceDescriptor

	for _, name := range names {
		desc, err := files.FindDescriptorByName(protoreflect.FullName(name))
		if err != nil {
			continue
		}
		if svc, ok := desc.(protoreflect.ServiceDescriptor); ok {
			allServices = append(allServices, svc)
		}
	}

	return allServices, nil
}

func findService(services []protoreflect.ServiceDescriptor, service string) (protoreflect.ServiceDescriptor, error) {
	for _, s := range services {
		if string(s.FullName()) == service {
			return s, nil
		}
	}

	return nil, fmt.Errorf("service %s not found", service)
}

func findMethod(service protoreflect.ServiceDescriptor, method string) (protoreflect.MethodDescriptor, error) {
	methods := service.Methods()

	for i := 0; i < methods.Len(); i++ {
		m := methods.Get(i)

		if string(m.Name()) == method {
			return m, nil
		}
	}

	return nil, fmt.Errorf("method %s/%s not found", service.FullName(), method)
}
