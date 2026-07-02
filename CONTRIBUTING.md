# Contributing to Amazon MSK Load Simulation Tool

Thank you for your interest in contributing! We welcome bug reports, feature requests, and pull requests.

## How to Contribute

### Reporting Bugs

1. Check existing [GitHub Issues](https://github.com/yashikajj/MSK-Load-Simulation-Tool/issues) to avoid duplicates
2. Use the bug report issue template
3. Include steps to reproduce, expected behavior, and actual behavior
4. Include browser version, AWS region, and MSK cluster configuration

### Feature Requests

1. Open a GitHub Issue using the feature request template
2. Describe the use case and expected behavior
3. If applicable, include mockups or examples

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
3. Make your changes following the coding guidelines below
4. Test your changes locally
5. Submit a pull request with a clear description

## Coding Guidelines

### Frontend (web/)

- Use vanilla JavaScript (ES6+) — no frameworks
- Follow Bootstrap 5 conventions for UI components
- Keep functions small and focused
- Add JSDoc comments for public functions
- Test in Chrome, Firefox, and Safari

### Backend (lambda/)

- Node.js 18+ runtime
- Use async/await for asynchronous operations
- Handle errors gracefully with proper HTTP status codes
- Include input validation for all API endpoints
- Keep Lambda functions focused (single responsibility)

### CloudFormation (deploy/)

- Use YAML format
- Include descriptions for all parameters and resources
- Follow AWS CloudFormation best practices
- Test with `aws cloudformation validate-template`

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/MSK-Load-Simulation-Tool.git
cd MSK-Load-Simulation-Tool

# Serve the web UI locally
cd web
python3 -m http.server 8080

# Run Lambda functions locally (requires SAM CLI)
cd lambda
sam local invoke ControlFunction --event events/test-connection.json
```

## Code of Conduct

This project adheres to the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Security Issue Notifications

If you discover a potential security issue, please do **not** create a public GitHub issue. Instead, follow [AWS Vulnerability Reporting](https://aws.amazon.com/security/vulnerability-reporting/) guidelines.

## Licensing

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
