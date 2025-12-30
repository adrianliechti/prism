package server

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"google.golang.org/grpc/reflection/grpc_reflection_v1alpha"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

func (s *Server) handleGRPC(w http.ResponseWriter, r *http.Request) {
	_ = r.PathValue("scheme")
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

	conn, err := grpc.NewClient(host,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)

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

	respMsg := dynamicpb.NewMessage(methodDesc.Output())

	if err := conn.Invoke(ctx, fmt.Sprintf("/%s/%s", service, method), reqMsg, respMsg); err != nil {
		http.Error(w, fmt.Sprintf("gRPC call failed: %v", err), http.StatusInternalServerError)
		return
	}

	jsonResp, err := protojson.Marshal(respMsg)

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to marshal proto to JSON: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(jsonResp)
}

func messageFromJSON(ctx context.Context, conn *grpc.ClientConn, service, method string, jsonBody []byte) (proto.Message, protoreflect.MethodDescriptor, error) {
	services, err := reflectServices(ctx, conn, service)

	if err != nil {
		return nil, nil, err
	}

	desc, err := findMethod(services, service, method)

	if err != nil {
		return nil, nil, err
	}

	msg := dynamicpb.NewMessage(desc.Input())

	if err := protojson.Unmarshal(jsonBody, msg); err != nil {
		return nil, nil, fmt.Errorf("failed to unmarshal JSON to proto: %w", err)
	}

	return msg, desc, nil
}

func reflectServices(ctx context.Context, conn *grpc.ClientConn, service string) (protoreflect.ServiceDescriptors, error) {
	client := grpc_reflection_v1alpha.NewServerReflectionClient(conn)

	stream, err := client.ServerReflectionInfo(ctx)

	if err != nil {
		return nil, err
	}

	if err = stream.Send(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_FileContainingSymbol{
			FileContainingSymbol: service,
		},
	}); err != nil {
		return nil, err
	}

	resp, err := stream.Recv()

	if err != nil {
		return nil, err
	}

	fdResp := resp.GetFileDescriptorResponse()

	if fdResp == nil {
		return nil, fmt.Errorf("no file descriptor response received")
	}

	fdProto := &descriptorpb.FileDescriptorProto{}

	if err := proto.Unmarshal(fdResp.FileDescriptorProto[0], fdProto); err != nil {
		return nil, err
	}

	fd, err := protodesc.NewFile(fdProto, nil)

	if err != nil {
		return nil, err
	}

	return fd.Services(), nil
}

func findMethod(services protoreflect.ServiceDescriptors, service, method string) (protoreflect.MethodDescriptor, error) {
	for i := 0; i < services.Len(); i++ {
		s := services.Get(i)

		if string(s.FullName()) != service {
			continue
		}

		methods := s.Methods()

		for j := 0; j < methods.Len(); j++ {
			m := methods.Get(j)

			if string(m.Name()) == method {
				return m, nil
			}
		}

		break
	}

	return nil, fmt.Errorf("method %s/%s not found", service, method)
}
