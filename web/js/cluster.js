/**
 * Cluster connection management module.
 */

const Cluster = (() => {
    let connected = false;
    let brokerCount = 0;
    let clusterConfig = null;

    /**
     * Initialize cluster module and bind UI events.
     */
    function init() {
        document.getElementById('add-broker-btn').addEventListener('click', addBrokerInput);
        document.getElementById('test-connection-btn').addEventListener('click', testConnection);
        document.getElementById('save-cluster-btn').addEventListener('click', saveCluster);

        // Auth method toggle
        document.querySelectorAll('input[name="authMethod"]').forEach(radio => {
            radio.addEventListener('change', toggleAuthConfig);
        });

        // Load saved cluster config
        const saved = localStorage.getItem('msk_sim_cluster');
        if (saved) {
            try {
                clusterConfig = JSON.parse(saved);
                restoreConfig(clusterConfig);
            } catch (e) {
                // ignore
            }
        }
    }

    /**
     * Add another broker input field.
     */
    function addBrokerInput() {
        const brokerList = document.getElementById('broker-list');
        const div = document.createElement('div');
        div.className = 'input-group mb-2';
        div.innerHTML = `
            <input type="text" class="form-control broker-input" placeholder="b-2.cluster.kafka.us-east-1.amazonaws.com:9098">
            <button class="btn btn-outline-danger remove-broker" type="button"><i class="bi bi-x-lg"></i></button>
        `;
        brokerList.appendChild(div);

        div.querySelector('.remove-broker').addEventListener('click', () => div.remove());
    }

    /**
     * Toggle auth-specific configuration panels.
     */
    function toggleAuthConfig(e) {
        document.getElementById('scram-config').classList.add('d-none');
        document.getElementById('mtls-config').classList.add('d-none');

        if (e.target.value === 'scram') {
            document.getElementById('scram-config').classList.remove('d-none');
        } else if (e.target.value === 'mtls') {
            document.getElementById('mtls-config').classList.remove('d-none');
        }
    }

    /**
     * Get current configuration from the UI.
     */
    function getConfig() {
        const brokers = Array.from(document.querySelectorAll('.broker-input'))
            .map(input => input.value.trim())
            .filter(v => v.length > 0);

        const authMethod = document.querySelector('input[name="authMethod"]:checked').value;

        const config = { brokers, authMethod };

        if (authMethod === 'scram') {
            config.secretArn = document.getElementById('scram-secret-arn').value.trim();
        } else if (authMethod === 'mtls') {
            config.certArn = document.getElementById('mtls-cert-arn').value.trim();
        }

        return config;
    }

    /**
     * Test connection to the MSK cluster.
     */
    async function testConnection() {
        const btn = document.getElementById('test-connection-btn');
        const status = document.getElementById('connection-status');
        const config = getConfig();

        if (config.brokers.length === 0) {
            status.innerHTML = '<span class="badge bg-danger">Please enter at least one broker</span>';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Testing...';
        status.innerHTML = '<span class="badge bg-warning">Connecting...</span>';

        try {
            const result = await Auth.apiRequest('/cluster/test', 'POST', config);
            connected = true;
            brokerCount = result.brokerCount || config.brokers.length;
            status.innerHTML = `<span class="badge bg-success"><i class="bi bi-check-circle"></i> Connected — ${brokerCount} brokers detected</span>`;
        } catch (error) {
            connected = false;
            status.innerHTML = `<span class="badge bg-danger"><i class="bi bi-x-circle"></i> ${error.message}</span>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-plug"></i> Test Connection';
        }
    }

    /**
     * Save cluster configuration.
     */
    async function saveCluster() {
        const config = getConfig();

        if (config.brokers.length === 0) {
            alert('Please enter at least one bootstrap server.');
            return;
        }

        try {
            await Auth.apiRequest('/cluster/save', 'POST', config);
            clusterConfig = config;
            localStorage.setItem('msk_sim_cluster', JSON.stringify(config));

            // Switch to Producer tab
            const producerTab = document.getElementById('producer-tab');
            const tab = new bootstrap.Tab(producerTab);
            tab.show();
        } catch (error) {
            alert('Failed to save configuration: ' + error.message);
        }
    }

    /**
     * Restore saved config to UI.
     */
    function restoreConfig(config) {
        if (!config) return;

        // Set brokers
        const brokerInputs = document.querySelectorAll('.broker-input');
        if (config.brokers && config.brokers.length > 0) {
            brokerInputs[0].value = config.brokers[0];
            for (let i = 1; i < config.brokers.length; i++) {
                addBrokerInput();
                const inputs = document.querySelectorAll('.broker-input');
                inputs[inputs.length - 1].value = config.brokers[i];
            }
        }

        // Set auth method
        if (config.authMethod) {
            const radio = document.getElementById(`auth-${config.authMethod === 'plaintext' ? 'plain' : config.authMethod}`);
            if (radio) radio.checked = true;
        }

        if (config.secretArn) {
            document.getElementById('scram-secret-arn').value = config.secretArn;
            document.getElementById('scram-config').classList.remove('d-none');
        }

        if (config.certArn) {
            document.getElementById('mtls-cert-arn').value = config.certArn;
            document.getElementById('mtls-config').classList.remove('d-none');
        }
    }

    /**
     * Check if cluster is connected.
     */
    function isConnected() {
        return connected;
    }

    /**
     * Get saved cluster config.
     */
    function getSavedConfig() {
        return clusterConfig;
    }

    return {
        init,
        isConnected,
        getConfig,
        getSavedConfig
    };
})();
