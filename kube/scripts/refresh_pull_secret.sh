#!/bin/bash

# Set AWS ECR and Kubernetes details
AWS_ACCOUNT_ID="644500056682"
AWS_REGION="us-east-1"
SECRET_NAME="wtm-svc-2"
NAMESPACE="wtm"
ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Step 1: Delete the existing secret
kubectl delete secret --namespace ${NAMESPACE} ${SECRET_NAME}
if [ $? -ne 0 ]; then
    echo "Warning: Failed to delete secret. It might not exist."
fi

# Step 2: Obtain a new authentication token from AWS ECR
AUTH_TOKEN=$(aws ecr get-login-password --region ${AWS_REGION})
if [ -z "${AUTH_TOKEN}" ]; then
    echo "Failed to obtain ECR authentication token. Make sure AWS CLI is configured correctly."
    exit 1
fi

# Step 3: Create a Docker config JSON
DOCKER_CONFIG_JSON=$(echo -n '{"auths":{"'"${ECR_URL}"'":{"username":"AWS","password":"'"${AUTH_TOKEN}"'"}}}' | base64 | tr -d '\n')

# Step 4: Create a new Kubernetes secret
kubectl create secret docker-registry ${SECRET_NAME} --docker-server=${ECR_URL} --docker-username=AWS --docker-password=${AUTH_TOKEN} --namespace=${NAMESPACE}
if [ $? -eq 0 ]; then
    echo "Secret ${SECRET_NAME} in namespace ${NAMESPACE} created successfully."
else
    echo "Failed to create the secret. Please check the output for errors."
    exit 1
fi

