#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

while getopts ":n:r:" opt; do
  case $opt in
    n)
      CLUSTER_NAME="$OPTARG"
      echo "-n was triggered with value: $CLUSTER_NAME"
      ;;
    r)
      DEFAULT_REGION="$OPTARG"
      echo "-r was triggered with value: $DEFAULT_REGION"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." >&2
      exit 1
      ;;
  esac
done

AWS_ACCOUNT_ID=`aws sts get-caller-identity | jq -r ".Account"`

cat <<EOF > cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: ${CLUSTER_NAME}
  region: ${DEFAULT_REGION} 
  version: latest

addons:
  - name: vpc-cni
    version: latest
  - name: coredns
    version: latest
  - name: kube-proxy
    version: latest

managedNodeGroups:
  - name: workers 
    labels: { role: workers }
    instanceType: t3.medium
    desiredCapacity: 1
    privateNetworking: true
EOF

cat <<EOF > eks-update-kubeconfig.json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "eks:DescribeCluster",
                "eks:ListClusters"
            ],
            "Resource": "*"
        }
    ]
}
EOF

IAM_USER_NAME=gihyo-`head /dev/urandom | tr -dc a-z0-9 | head -c 6`
aws iam create-user --user-name $IAM_USER_NAME
aws iam put-user-policy --user-name $IAM_USER_NAME \
  --policy-name eksUpdateConfigPolicy \
  --policy-document file://eks-update-kubeconfig.json

eksctl create cluster --config-file ./cluster.yaml
eksctl create iamidentitymapping --cluster ${CLUSTER_NAME} \
  --arn arn:aws:iam::${AWS_ACCOUNT_ID}:user/${IAM_USER_NAME} \
  --username ${IAM_USER_NAME} \
  --group system:masters
