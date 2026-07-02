# Changelog

All notable changes to the Amazon MSK Load Simulation Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-07-02

### Added

- Initial release of the MSK Load Simulation Tool
- Browser-based single-page application (SPA)
- Cognito-based authentication with JWT tokens
- Cluster connection management (IAM, SASL/SCRAM, mTLS, Plaintext)
- Producer with configurable rate, batch size, duration, and compression
- Consumer with real-time message streaming
- Faker.js-powered message template engine
- Pre-built templates: E-Commerce, IoT Sensor, Financial, Clickstream, Log Entry
- Live metrics dashboard (throughput, latency, errors)
- CloudFormation templates for one-click deployment
- Lambda functions deployed in VPC for private MSK access
- DynamoDB for session state and saved templates
- CloudWatch metrics integration
- Responsive Bootstrap 5 UI with dark-themed metrics panel
