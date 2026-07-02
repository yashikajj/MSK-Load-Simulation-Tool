/**
 * Authentication helper — builds KafkaJS auth config for each method.
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsManager = new SecretsManagerClient({});

/**
 * Get the appropriate auth mechanism configuration for KafkaJS.
 */
function getAuthMechanism(config) {
    switch (config.authMethod) {
        case 'iam':
            return getIAMAuth();
        case 'scram':
            return getSCRAMAuth(config.secretArn);
        case 'mtls':
            return getMTLSAuth(config.certArn);
        case 'plaintext':
        default:
            return getPlaintextAuth();
    }
}

/**
 * IAM authentication using aws-msk-iam-auth.
 */
function getIAMAuth() {
    const { generateAuthToken } = require('aws-msk-iam-sasl-signer-js');

    return {
        ssl: true,
        sasl: {
            mechanism: 'oauthbearer',
            oauthBearerProvider: async () => {
                const token = await generateAuthToken({ region: process.env.AWS_REGION || 'us-east-1' });
                return {
                    value: token.token
                };
            }
        }
    };
}

/**
 * SASL/SCRAM authentication via Secrets Manager.
 */
async function getSCRAMAuth(secretArn) {
    const result = await secretsManager.send(new GetSecretValueCommand({
        SecretId: secretArn
    }));

    const secret = JSON.parse(result.SecretString);

    return {
        ssl: true,
        sasl: {
            mechanism: 'scram-sha-512',
            username: secret.username,
            password: secret.password
        }
    };
}

/**
 * mTLS authentication using client certificates.
 */
function getMTLSAuth(certArn) {
    // In production, fetch cert from ACM Private CA
    return {
        ssl: {
            rejectUnauthorized: true
            // cert and key would be loaded from ACM
        }
    };
}

/**
 * Plaintext (no auth).
 */
function getPlaintextAuth() {
    return {};
}

module.exports = { getAuthMechanism };
