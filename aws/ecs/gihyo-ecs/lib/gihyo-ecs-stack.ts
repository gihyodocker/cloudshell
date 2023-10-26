import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as log from 'aws-cdk-lib/aws-logs';

export class GihyoEcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.1.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'public',
          cidrMask: 24,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private',
          cidrMask: 24,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ]
    });

    // ECS
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc,
    });

    // Security Group
    const securityGroupApp = new ec2.SecurityGroup(this, 'SgApp', {
      vpc: vpc,
    });
    const securityGroupAlb = new ec2.SecurityGroup(this, 'SgAlb', {
      vpc
    });
    securityGroupAlb.addIngressRule(ec2.Peer.ipv4('0.0.0.0/0'), ec2.Port.tcp(80));

    // ALB(Application Load Balancer)
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: vpc,
      internetFacing: true,
      securityGroup: securityGroupAlb,
    });

    // ALB Listener
    const listener = alb.addListener('Listener', {
      port: 80,
      open: true,
    });

    // ALB TargetGroup
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroupDefault', {
      vpc: vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
    });
    listener.addTargetGroups('TargetGroupDefault', {
      targetGroups: [targetGroup],
    });

    // ECS TaskDefinition
    const echoTaskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinitionEcho', {
      cpu: 256,
      memoryLimitMiB: 512,
    });
    // "nginx" container
    const nginxContainer = echoTaskDefinition.addContainer("EchoConNginx", {
      containerName: "nginx",
      image: ecs.ContainerImage.fromRegistry('ghcr.io/gihyodocker/simple-nginx-proxy:v0.0.1'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'echo-nginx',
        logRetention: log.RetentionDays.ONE_MONTH,
      }),
      environment: {
        NGINX_PORT: "80",
        SERVER_NAME: "localhost",
        BACKEND_HOST: "localhost:8080",
        BACKEND_MAX_FAILS: "3",
        BACKEND_FAIL_TIMEOUT: "10s",
      },
    });
    nginxContainer.addPortMappings({
      containerPort: 80,
      hostPort: 80
    })
    // "echo" container
    const echoContainer = echoTaskDefinition.addContainer("EchoConEcho", {
      containerName: "echo",
      image: ecs.ContainerImage.fromRegistry('ghcr.io/gihyodocker/echo:v0.0.1-9-gfe27471-slim'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'echo-nginx',
        logRetention: log.RetentionDays.ONE_MONTH,
      }),
    });
    echoContainer.addPortMappings({
      containerPort: 8080,
      hostPort: 8080,
    })

    // ECS Service
    const service = new ecs.FargateService(this, 'ServiceEcho', {
      cluster,
      taskDefinition: echoTaskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [
        securityGroupApp,
      ]
    });
    service.attachToApplicationTargetGroup(targetGroup);

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: `http://${alb.loadBalancerDnsName}`,
      description: 'The endpoint URL',
    });
  }
}
