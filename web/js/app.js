/**
 * Main application logic — orchestrates modules and tab navigation.
 */

(function () {
    'use strict';

    // Configuration — populated from CloudFormation stack outputs
    window.MSK_CONFIG = window.MSK_CONFIG || {
        userPoolId: '',
        clientId: '',
        region: 'us-east-1',
        apiEndpoint: ''
    };

    /**
     * Initialize the application.
     */
    function initApp() {
        // Try to restore session
        const hasSession = Auth.init(window.MSK_CONFIG);

        if (hasSession) {
            showDashboard();
        } else {
            showLogin();
        }

        bindLoginEvents();
        bindLogoutEvents();
    }

    /**
     * Bind login form events.
     */
    function bindLoginEvents() {
        const form = document.getElementById('login-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('login-error');
            const spinner = document.getElementById('login-spinner');
            const btn = document.getElementById('login-btn');

            errorDiv.classList.add('d-none');
            spinner.classList.remove('d-none');
            btn.disabled = true;

            try {
                await Auth.signIn(username, password);
                showDashboard();
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('d-none');
            } finally {
                spinner.classList.add('d-none');
                btn.disabled = false;
            }
        });
    }

    /**
     * Bind logout button.
     */
    function bindLogoutEvents() {
        document.getElementById('logout-btn').addEventListener('click', () => {
            Auth.signOut();
            showLogin();
        });
    }

    /**
     * Show the login screen.
     */
    function showLogin() {
        document.getElementById('login-screen').classList.remove('d-none');
        document.getElementById('dashboard').classList.add('d-none');
    }

    /**
     * Show the main dashboard.
     */
    function showDashboard() {
        document.getElementById('login-screen').classList.add('d-none');
        document.getElementById('dashboard').classList.remove('d-none');
        document.getElementById('user-display').textContent = Auth.getUsername();

        // Initialize modules
        Cluster.init();
        Producer.init();
        Consumer.init();
        Metrics.init();

        // Load topics on tab switch
        document.getElementById('producer-tab').addEventListener('shown.bs.tab', () => {
            Producer.refreshTopics();
        });

        document.getElementById('consumer-tab').addEventListener('shown.bs.tab', () => {
            Consumer.refreshConsumerTopics();
        });

        document.getElementById('metrics-tab').addEventListener('shown.bs.tab', () => {
            Metrics.refreshMetrics();
            Metrics.startAutoRefresh();
        });

        // Stop auto-refresh when leaving metrics tab
        document.querySelectorAll('#mainTabs .nav-link').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                if (e.target.id !== 'metrics-tab') {
                    Metrics.stopAutoRefresh();
                }
            });
        });
    }

    // Start the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
