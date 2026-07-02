/**
 * Authentication module — Cognito JWT handling.
 */

const Auth = (() => {
    // Configuration (populated from CloudFormation outputs)
    const config = {
        userPoolId: '', // Set via window.MSK_CONFIG
        clientId: '',
        region: 'us-east-1',
        apiEndpoint: ''
    };

    let idToken = null;
    let accessToken = null;
    let refreshToken = null;
    let currentUser = null;

    /**
     * Initialize auth module with configuration.
     */
    function init(cfg) {
        if (cfg) {
            Object.assign(config, cfg);
        }
        // Check for existing session
        const stored = sessionStorage.getItem('msk_sim_auth');
        if (stored) {
            try {
                const session = JSON.parse(stored);
                if (session.expiry > Date.now()) {
                    idToken = session.idToken;
                    accessToken = session.accessToken;
                    currentUser = session.username;
                    return true;
                }
            } catch (e) {
                sessionStorage.removeItem('msk_sim_auth');
            }
        }
        return false;
    }

    /**
     * Sign in with username and password via Cognito.
     */
    async function signIn(username, password) {
        const cognitoUrl = `https://cognito-idp.${config.region}.amazonaws.com/`;

        const payload = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: config.clientId,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password
            }
        };

        const response = await fetch(cognitoUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Authentication failed');
        }

        const data = await response.json();
        const result = data.AuthenticationResult;

        idToken = result.IdToken;
        accessToken = result.AccessToken;
        refreshToken = result.RefreshToken;
        currentUser = username;

        // Store session (1 hour expiry)
        sessionStorage.setItem('msk_sim_auth', JSON.stringify({
            idToken,
            accessToken,
            username,
            expiry: Date.now() + (result.ExpiresIn * 1000)
        }));

        return { username, idToken };
    }

    /**
     * Sign out and clear session.
     */
    function signOut() {
        idToken = null;
        accessToken = null;
        refreshToken = null;
        currentUser = null;
        sessionStorage.removeItem('msk_sim_auth');
    }

    /**
     * Get the current ID token for API calls.
     */
    function getToken() {
        return idToken;
    }

    /**
     * Get the current username.
     */
    function getUsername() {
        return currentUser;
    }

    /**
     * Check if user is authenticated.
     */
    function isAuthenticated() {
        return idToken !== null;
    }

    /**
     * Make an authenticated API request.
     */
    async function apiRequest(path, method = 'GET', body = null) {
        if (!idToken) {
            throw new Error('Not authenticated');
        }

        const options = {
            method,
            headers: {
                'Authorization': idToken,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${config.apiEndpoint}${path}`, options);

        if (response.status === 401) {
            signOut();
            throw new Error('Session expired. Please sign in again.');
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    return {
        init,
        signIn,
        signOut,
        getToken,
        getUsername,
        isAuthenticated,
        apiRequest
    };
})();
