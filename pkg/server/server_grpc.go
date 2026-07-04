package server

import (
	"context"
	"crypto/tls"
	"encoding/base64"
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

	// User metadata arrives smuggled as X-Prism-Header-*; it is also sent for
	// the reflection calls, so auth-protected reflection services work.
	ctx = metadata.NewOutgoingContext(ctx, grpcMetadataFromRequest(r))

	conn, err := grpc.NewClient(host, grpcTransportCredentials(scheme, r.Header.Get("X-Prism-Insecure") == "true"))

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to connect to %s: %v", host, err), http.StatusBadGateway)
		return
	}

	defer conn.Close()

	methodDesc, err := findMethodDescriptor(ctx, conn, service, method)

	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if methodDesc.IsStreamingClient() {
		http.Error(w, "client/bidirectional streaming methods are not supported", http.StatusNotImplemented)
		return
	}

	reqMsg := dynamicpb.NewMessage(methodDesc.Input())

	if err := protojson.Unmarshal(jsonBody, reqMsg); err != nil {
		http.Error(w, fmt.Sprintf("failed to unmarshal JSON to proto: %v", err), http.StatusBadRequest)
		return
	}

	if methodDesc.IsStreamingServer() {
		invokeServerStream(ctx, w, conn, fmt.Sprintf("/%s/%s", service, method), methodDesc, reqMsg)
		return
	}

	respMsg := dynamicpb.NewMessage(methodDesc.Output())

	var respHeader, respTrailer metadata.MD
	invokeErr := conn.Invoke(ctx, fmt.Sprintf("/%s/%s", service, method), reqMsg, respMsg, grpc.Header(&respHeader), grpc.Trailer(&respTrailer))

	// Write response metadata as HTTP headers (also on errors, where trailers
	// often carry details). Binary metadata is base64-encoded.
	writeGRPCMetadata(w.Header(), "Grpc-Header-", respHeader)
	writeGRPCMetadata(w.Header(), "Grpc-Trailer-", respTrailer)

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

// invokeServerStream calls a server-streaming method and returns the received
// messages as a JSON array (capped; a hit cap is flagged via header).
func invokeServerStream(ctx context.Context, w http.ResponseWriter, conn *grpc.ClientConn, fullMethod string, methodDesc protoreflect.MethodDescriptor, reqMsg proto.Message) {
	const maxStreamMessages = 256

	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{ServerStreams: true}, fullMethod)

	if err == nil {
		if sendErr := stream.SendMsg(reqMsg); sendErr != nil {
			err = sendErr
		} else {
			err = stream.CloseSend()
		}
	}

	if err != nil {
		st := status.Convert(err)
		w.Header().Set("Grpc-Status", st.Code().String())
		w.Header().Set("Grpc-Message", st.Message())
		http.Error(w, fmt.Sprintf("gRPC call failed: %s: %s", st.Code(), st.Message()), httpStatusFromGRPCCode(st.Code()))
		return
	}

	messages := []json.RawMessage{}
	truncated := false

	var streamErr error
	for {
		if len(messages) == maxStreamMessages {
			truncated = true
			break
		}
		respMsg := dynamicpb.NewMessage(methodDesc.Output())
		if recvErr := stream.RecvMsg(respMsg); recvErr != nil {
			if recvErr != io.EOF {
				streamErr = recvErr
			}
			break
		}
		raw, marshalErr := protojson.Marshal(respMsg)
		if marshalErr != nil {
			streamErr = marshalErr
			break
		}
		messages = append(messages, raw)
	}

	if header, headerErr := stream.Header(); headerErr == nil {
		writeGRPCMetadata(w.Header(), "Grpc-Header-", header)
	}
	writeGRPCMetadata(w.Header(), "Grpc-Trailer-", stream.Trailer())

	if streamErr != nil && len(messages) == 0 {
		st := status.Convert(streamErr)
		w.Header().Set("Grpc-Status", st.Code().String())
		w.Header().Set("Grpc-Message", st.Message())
		http.Error(w, fmt.Sprintf("gRPC call failed: %s: %s", st.Code(), st.Message()), httpStatusFromGRPCCode(st.Code()))
		return
	}

	if streamErr != nil {
		// partial results: report the late error alongside what was received
		st := status.Convert(streamErr)
		w.Header().Set("Grpc-Status", st.Code().String())
		w.Header().Set("Grpc-Message", st.Message())
	} else {
		w.Header().Set("Grpc-Status", codes.OK.String())
	}
	if truncated {
		w.Header().Set("Grpc-Stream-Truncated", "true")
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(messages)
}

func writeGRPCMetadata(h http.Header, prefix string, md metadata.MD) {
	for k, vals := range md {
		for _, v := range vals {
			if strings.HasSuffix(k, "-bin") {
				v = base64.StdEncoding.EncodeToString([]byte(v))
			}
			h.Add(prefix+k, v)
		}
	}
}

// grpcMetadataFromRequest builds outgoing metadata exclusively from smuggled
// X-Prism-Header-* headers, so browser artifacts never leak into gRPC
// metadata and no user key gets blocklisted. Values for -bin keys are
// expected base64-encoded (grpcurl convention).
func grpcMetadataFromRequest(r *http.Request) metadata.MD {
	md := metadata.New(nil)
	for key, values := range r.Header {
		name, ok := strings.CutPrefix(key, "X-Prism-Header-")
		if !ok || name == "" {
			continue
		}
		name = strings.ToLower(name)
		for _, v := range values {
			if strings.HasSuffix(name, "-bin") {
				if decoded, err := base64.StdEncoding.DecodeString(v); err == nil {
					v = string(decoded)
				}
			}
			md.Append(name, v)
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

	services, err := reflectAllServices(ctx, conn)

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to list services: %v", err), http.StatusBadGateway)
		return
	}

	response := &Reflection{
		Services: []ServiceReflection{},
	}

	for _, svc := range services {
		svcReflection := ServiceReflection{
			Name:    string(svc.FullName()),
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

// --- reflection protocol client ---
//
// All logic speaks the v1 message types; v1alpha (wire-identical, deprecated)
// is supported by transcoding messages between the two packages.

type reflectionClient interface {
	roundTrip(req *grpc_reflection_v1.ServerReflectionRequest) (*grpc_reflection_v1.ServerReflectionResponse, error)
}

type reflectV1 struct {
	stream grpc_reflection_v1.ServerReflection_ServerReflectionInfoClient
}

func (c *reflectV1) roundTrip(req *grpc_reflection_v1.ServerReflectionRequest) (*grpc_reflection_v1.ServerReflectionResponse, error) {
	if err := c.stream.Send(req); err != nil {
		return nil, err
	}
	return c.stream.Recv()
}

type reflectV1Alpha struct {
	stream grpc_reflection_v1alpha.ServerReflection_ServerReflectionInfoClient
}

func (c *reflectV1Alpha) roundTrip(req *grpc_reflection_v1.ServerReflectionRequest) (*grpc_reflection_v1.ServerReflectionResponse, error) {
	alphaReq := &grpc_reflection_v1alpha.ServerReflectionRequest{}
	if err := transcode(req, alphaReq); err != nil {
		return nil, err
	}

	if err := c.stream.Send(alphaReq); err != nil {
		return nil, err
	}

	alphaResp, err := c.stream.Recv()

	if err != nil {
		return nil, err
	}

	resp := &grpc_reflection_v1.ServerReflectionResponse{}
	if err := transcode(alphaResp, resp); err != nil {
		return nil, err
	}
	return resp, nil
}

// transcode converts between wire-identical message types (v1 <-> v1alpha).
func transcode(src, dst proto.Message) error {
	raw, err := proto.Marshal(src)
	if err != nil {
		return err
	}
	return proto.Unmarshal(raw, dst)
}

// autoReflectionClient opens the v1 reflection stream lazily and, if the
// first exchange fails for any reason, retries it once over v1alpha for
// servers that only register the deprecated variant.
type autoReflectionClient struct {
	ctx        context.Context
	conn       *grpc.ClientConn
	client     reflectionClient
	triedAlpha bool
}

func (a *autoReflectionClient) roundTrip(req *grpc_reflection_v1.ServerReflectionRequest) (*grpc_reflection_v1.ServerReflectionResponse, error) {
	if a.client == nil {
		stream, err := grpc_reflection_v1.NewServerReflectionClient(a.conn).ServerReflectionInfo(a.ctx)
		if err != nil {
			return nil, err
		}
		a.client = &reflectV1{stream: stream}
	}

	resp, err := a.client.roundTrip(req)

	if err != nil && !a.triedAlpha {
		a.triedAlpha = true
		if stream, alphaErr := grpc_reflection_v1alpha.NewServerReflectionClient(a.conn).ServerReflectionInfo(a.ctx); alphaErr == nil {
			alpha := &reflectV1Alpha{stream: stream}
			if alphaResp, alphaErr := alpha.roundTrip(req); alphaErr == nil {
				a.client = alpha
				return alphaResp, nil
			}
		}
		return nil, err
	}

	return resp, err
}

func reflectListServices(c reflectionClient) ([]string, error) {
	resp, err := c.roundTrip(&grpc_reflection_v1.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_ListServices{ListServices: ""},
	})

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

func reflectFiles(c reflectionClient, req *grpc_reflection_v1.ServerReflectionRequest) ([][]byte, error) {
	resp, err := c.roundTrip(req)

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

func fileContainingSymbol(c reflectionClient, symbol string) ([][]byte, error) {
	return reflectFiles(c, &grpc_reflection_v1.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_FileContainingSymbol{FileContainingSymbol: symbol},
	})
}

func fileByFilename(c reflectionClient, name string) ([][]byte, error) {
	return reflectFiles(c, &grpc_reflection_v1.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_FileByFilename{FileByFilename: name},
	})
}

// collectFiles fetches the descriptor files covering the given symbols plus
// their transitive imports, backfilling deps the server omits from the local
// well-known-type registry.
func collectFiles(c reflectionClient, symbols []string) map[string]*descriptorpb.FileDescriptorProto {
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

	for _, symbol := range symbols {
		raw, err := fileContainingSymbol(c, symbol)
		if err != nil {
			continue
		}
		addFiles(raw)
	}

	for range 16 {
		missing := map[string]bool{}
		for _, fdProto := range fdProtos {
			for _, dep := range fdProto.GetDependency() {
				if _, ok := fdProtos[dep]; !ok {
					missing[dep] = true
				}
			}
		}
		if len(missing) == 0 {
			break
		}

		progress := false
		for dep := range missing {
			if raw, err := fileByFilename(c, dep); err == nil {
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

	return fdProtos
}

// buildRegistry registers files in dependency order, skipping any file whose
// closure is broken so the rest still resolve (best effort, like grpcurl).
func buildRegistry(fdProtos map[string]*descriptorpb.FileDescriptorProto) *protoregistry.Files {
	files := new(protoregistry.Files)

	const (
		stateFailed     = 1
		stateRegistered = 2
	)
	state := map[string]int{}

	var register func(name string) bool
	register = func(name string) bool {
		switch state[name] {
		case stateRegistered:
			return true
		case stateFailed:
			return false
		}
		state[name] = stateFailed // guards cycles; overwritten on success

		fdProto, ok := fdProtos[name]
		if !ok {
			return false
		}
		for _, dep := range fdProto.GetDependency() {
			if !register(dep) {
				return false
			}
		}

		fd, err := protodesc.NewFile(fdProto, files)
		if err != nil {
			return false
		}
		if err := files.RegisterFile(fd); err != nil {
			return false
		}
		state[name] = stateRegistered
		return true
	}

	for name := range fdProtos {
		register(name)
	}

	return files
}

// reflectAllServices lists every non-reflection service with full descriptors.
func reflectAllServices(ctx context.Context, conn *grpc.ClientConn) ([]protoreflect.ServiceDescriptor, error) {
	client := &autoReflectionClient{ctx: ctx, conn: conn}

	names, err := reflectListServices(client)

	if err != nil {
		return nil, err
	}

	var symbols []string
	for _, name := range names {
		if strings.HasPrefix(name, "grpc.reflection.") {
			continue
		}
		symbols = append(symbols, name)
	}

	files := buildRegistry(collectFiles(client, symbols))

	var services []protoreflect.ServiceDescriptor
	for _, symbol := range symbols {
		desc, err := files.FindDescriptorByName(protoreflect.FullName(symbol))
		if err != nil {
			continue
		}
		if svc, ok := desc.(protoreflect.ServiceDescriptor); ok {
			services = append(services, svc)
		}
	}

	return services, nil
}

// findMethodDescriptor resolves a single method for invocation without
// reflecting the server's entire service list.
func findMethodDescriptor(ctx context.Context, conn *grpc.ClientConn, service, method string) (protoreflect.MethodDescriptor, error) {
	client := &autoReflectionClient{ctx: ctx, conn: conn}

	files := buildRegistry(collectFiles(client, []string{service}))

	desc, err := files.FindDescriptorByName(protoreflect.FullName(service))

	if err != nil {
		return nil, fmt.Errorf("service %s not found", service)
	}

	svc, ok := desc.(protoreflect.ServiceDescriptor)

	if !ok {
		return nil, fmt.Errorf("%s is not a service", service)
	}

	methodDesc := svc.Methods().ByName(protoreflect.Name(method))

	if methodDesc == nil {
		return nil, fmt.Errorf("method %s/%s not found", service, method)
	}

	return methodDesc, nil
}
