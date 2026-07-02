# Amazon MSK Load Simulation Tool

A browser-based load testing tool for Amazon Managed Streaming for Apache Kafka (MSK) clusters, inspired by the [Amazon Kinesis Data Generator](https://github.com/awslabs/amazon-kinesis-data-generator).

Generate realistic test data, produce messages at configurable rates, consume and inspect messages in real-time — all from a simple web UI with zero EC2 instances required.

![Architecture Diagram](docs/architecture-diagram.png)

---

## Quick Start — One-Click Deploy

Deploy the Cognito user pool and create an admin user:

[![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home#/stacks/new?stackName=MSKLoadSimCognito&templateURL=https://s3.amazonaws.com/msk-load-sim-templates/msk-load-sim-cognito-setup.yaml)

Then deploy the full application stack:

[![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home#/stacks/new?stackName=MSKLoadSimFullStack&templateURL=https://s3.amazonaws.com/msk-load-sim-templates/msk-load-sim-full-stack.yaml)

---

## Getting Started

### Option 1: Use the Hosted UI

1. Deploy the Cognito setup stack (button above)
2. Deploy the full stack
3. Navigate to the CloudFront URL in the stack outputs
4. Log in with the admin credentials you configured

### Option 2: Self-Deploy

1. Clone this repository:
   ```bash
   git clone https://github.com/yashikajj/MSK-Load-Simulation-Tool.git
   cd MSK-Load-Simulation-Tool
   ```

2. Deploy the Cognito stack:
   ```bash
   aws cloudformation deploy \
     --template-file deploy/msk-load-sim-cognito-setup.yaml \
     --stack-name MSKLoadSimCognito \
     --parameter-overrides AdminUsername=admin AdminPassword=YourSecurePassword1! \
     --capabilities CAPABILITY_IAM
   ```

3. Deploy the full application stack:
   ```bash
   aws cloudformation deploy \
     --template-file deploy/msk-load-sim-full-stack.yaml \
     --stack-name MSKLoadSimFullStack \
     --parameter-overrides CognitoStackName=MSKLoadSimCognito \
     --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
   ```

4. Upload the web assets to the S3 bucket from stack outputs.

---

## Prerequisites

- An existing Amazon MSK cluster (any version)
- AWS account with permissions to deploy CloudFormation stacks
- VPC connectivity between Lambda functions and your MSK cluster
- For IAM auth: MSK cluster with IAM authentication enabled
- For SASL/SCRAM: Secret stored in AWS Secrets Manager
- For mTLS: Client certificate from ACM Private CA

---

## Features

| Feature | Description |
|---------|-------------|
| **Producer** | Generate messages at configurable rates (1–10,000 msg/sec) |
| **Consumer** | Read and inspect messages in real-time |
| **Templates** | Faker.js-powered dynamic message generation |
| **Multi-Auth** | IAM, SASL/SCRAM, mTLS, and Plaintext support |
| **Metrics** | Live throughput, latency, and error tracking |
| **Serverless** | Zero EC2 — Lambda + S3 + CloudFront |
| **One-Click** | CloudFormation deployment in minutes |

---

## Template Syntax Reference

The producer uses [Faker.js](https://fakerjs.dev/) for dynamic data generation. Use `{{}}` syntax in your message templates:

### Basic Examples

```json
{
  "orderId": "{{random.uuid}}",
  "amount": {{random.number(1,1000)}},
  "customer": "{{name.fullName}}",
  "email": "{{internet.email}}",
  "timestamp": "{{date.recent}}"
}
```

### Supported Generators

| Generator | Example Output |
|-----------|---------------|
| `{{random.uuid}}` | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `{{random.number(min,max)}}` | `42` |
| `{{random.float(min,max,precision)}}` | `3.14` |
| `{{random.arrayElement(['a','b','c'])}}` | `b` |
| `{{name.fullName}}` | `John Smith` |
| `{{internet.email}}` | `john@example.com` |
| `{{address.city}}` | `Seattle` |
| `{{date.recent}}` | `2025-01-15T10:30:00Z` |
| `{{datatype.boolean}}` | `true` |
| `{{lorem.sentence}}` | `The quick brown fox...` |

### Pre-Built Templates

1. **E-Commerce Order** — orderId, amount, status, timestamp
2. **IoT Sensor** — sensorId, temperature, humidity, location
3. **Financial Transaction** — txnId, accountId, amount, currency
4. **Clickstream** — userId, sessionId, pageUrl, action
5. **Log Entry** — level, service, message, traceId

---

## Authentication Setup

### IAM Authentication

1. Enable IAM authentication on your MSK cluster
2. Select "IAM" in the Cluster Setup tab
3. The Lambda execution role includes the required `kafka-cluster:*` permissions

### SASL/SCRAM Authentication

1. Create a secret in AWS Secrets Manager with your SCRAM credentials
2. Associate the secret with your MSK cluster
3. Select "SASL/SCRAM" and provide the Secret ARN in Cluster Setup

### mTLS Authentication

1. Create a Private CA in AWS Certificate Manager
2. Issue a client certificate
3. Enable mTLS on your MSK cluster
4. Upload the client certificate in Cluster Setup

### Plaintext (Development Only)

1. Enable plaintext listeners on your MSK cluster (port 9092)
2. Select "Plaintext" in Cluster Setup
3. **Warning**: Not recommended for production clusters

---

## Architecture

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
│   Browser    │──────▶│  CloudFront  │──────▶│    S3 (Static)   │
│   (SPA)      │       │              │       │   HTML/JS/CSS    │
└──────┬───────┘       └──────────────┘       └──────────────────┘
       │
       │ API calls (JWT)
       ▼
┌──────────────┐       ┌──────────────────────────────────────────┐
│ API Gateway  │──────▶│           Lambda Functions (VPC)          │
│  (Cognito)   │       │  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
└──────────────┘       │  │Control  │ │Producer │ │ Consumer │  │
                       │  └────┬────┘ └────┬────┘ └────┬─────┘  │
┌──────────────┐       │       │           │           │         │
│   Cognito    │       │  ┌────┴───────────┴───────────┴─────┐  │
│  User Pool   │       │  │         Amazon MSK Cluster        │  │
└──────────────┘       │  └───────────────────────────────────┘  │
                       └──────────────────────────────────────────┘
┌──────────────┐
│  DynamoDB    │  ◀── Session state + saved templates
└──────────────┘
```

---

## Success Metrics

- **Target**: 50+ active users/month
- **Goal**: 20-30% reduction in MSK load-testing support cases
- **Measure**: CloudWatch custom metrics on API usage

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.

---

## Security

See [CONTRIBUTING.md](CONTRIBUTING.md#security-issue-notifications) for reporting security issues.
