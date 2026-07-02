# Cognito User Creation

Scripts to manage users in the MSK Load Simulation Tool's Cognito User Pool.

## Create a User

```bash
chmod +x create-user.sh
./create-user.sh <user-pool-id> <username> <email> <temp-password>
```

### Example

```bash
./create-user.sh us-east-1_abc123XYZ testuser user@example.com TempPass123!
```

## Prerequisites

- AWS CLI configured with appropriate permissions
- The Cognito stack must be deployed first

## Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
