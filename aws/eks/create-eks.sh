#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

CLUSTER_NAME=gihhyo-eks
AWS_ACCOUNT_ID=`aws sts get-caller-identity | jq -r ".Account"`
SUBNETS=`aws ec2 describe-subnets | jq -r .Subnets[].SubnetId`
JOINED_SUBNETS=$(printf "%s\n" "${SUBNETS[@]}" | awk 'BEGIN { ORS = "," } { print }' | sed 's/,$//')
SECURITY_GROUPS=`aws ec2 describe-security-groups | jq -r .SecurityGroups[].GroupId`

aws eks create-cluster \
    --name ${CLUSTER_NAME} \
    --role-arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/eks-cluster-role \
    --resources-vpc-config subnetIds=${JOINED_SUBNETS},securityGroupIds=${SECURITY_GROUPS}


# TODO activeになるまでチェック
aws eks describe-cluster --name ${CLUSTER_NAME} | jq -r .cluster.status

aws eks create-fargate-profile \
    --cluster-name ${CLUSTER_NAME} \
    --fargate-profile-name my-fargate-profile \
    --pod-execution-role-arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/fargate-pod-execution-role \
    --selectors namespace=default


aws eks create-addon --cluster-name ${CLUSTER_NAME} --addon-name vpc-cni --service-account-role-arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKSVPCCNIRole
aws eks create-addon --cluster-name ${CLUSTER_NAME} --addon-name coredns
aws eks create-addon --cluster-name ${CLUSTER_NAME} --addon-name kube-proxy 

