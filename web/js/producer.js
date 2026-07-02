/**
 * Producer module — message generation and sending.
 */

const Producer = (() => {
    let isRunning = false;
    let sessionId = null;
    let pollInterval = null;
    let startTime = null;

    // Metrics
    let metrics = {
        sent: 0,
        errors: 0,
        bytes: 0,
        latencyAvg: 0,
        latencyP99: 0,
        rate: 0
    };

    /**
     * Initialize producer module.
     */
    function init() {
        document.getElementById('start-producer-btn').addEventListener('click', startProducing);
        document.getElementById('stop-producer-btn').addEventListener('click', stopProducing);
        document.getElementById('refresh-topics-btn').addEventListener('click', refreshTopics);
        document.getElementById('create-topic-btn').addEventListener('click', showCreateTopicModal);
        document.getElementById('confirm-create-topic').addEventListener('click', createTopic);
        document.getElementById('save-template-btn').addEventListener('click', saveTemplate);

        // Template dropdown
        document.querySelectorAll('#template-dropdown .dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const templateKey = e.target.dataset.template;
                if (MessageTemplates[templateKey]) {
                    document.getElementById('message-template').value = MessageTemplates[templateKey].template;
                }
            });
        });

        // Load default template
        document.getElementById('message-template').value = MessageTemplates.ecommerce.template;
    }

    /**
     * Refresh topic list from the cluster.
     */
    async function refreshTopics() {
        const btn = document.getElementById('refresh-topics-btn');
        btn.disabled = true;

        try {
            const result = await Auth.apiRequest('/topics', 'GET');
            const select = document.getElementById('producer-topic');
            const consumerSelect = document.getElementById('consumer-topic');

            // Clear existing options (keep placeholder)
            select.innerHTML = '<option value="" disabled selected>Select topic...</option>';
            consumerSelect.innerHTML = '<option value="" disabled selected>Select topic...</option>';

            if (result.topics && result.topics.length > 0) {
                result.topics.forEach(topic => {
                    select.innerHTML += `<option value="${topic}">${topic}</option>`;
                    consumerSelect.innerHTML += `<option value="${topic}">${topic}</option>`;
                });
            }
        } catch (error) {
            console.error('Failed to refresh topics:', error);
            alert('Failed to load topics: ' + error.message);
        } finally {
            btn.disabled = false;
        }
    }

    /**
     * Show the create topic modal.
     */
    function showCreateTopicModal() {
        const modal = new bootstrap.Modal(document.getElementById('createTopicModal'));
        modal.show();
    }

    /**
     * Create a new topic.
     */
    async function createTopic() {
        const name = document.getElementById('new-topic-name').value.trim();
        const partitions = parseInt(document.getElementById('new-topic-partitions').value);
        const replication = parseInt(document.getElementById('new-topic-replication').value);

        if (!name) {
            alert('Please enter a topic name.');
            return;
        }

        try {
            await Auth.apiRequest('/topics', 'POST', { name, partitions, replicationFactor: replication });
            bootstrap.Modal.getInstance(document.getElementById('createTopicModal')).hide();
            await refreshTopics();

            // Select the new topic
            document.getElementById('producer-topic').value = name;
        } catch (error) {
            alert('Failed to create topic: ' + error.message);
        }
    }

    /**
     * Start producing messages.
     */
    async function startProducing() {
        const topic = document.getElementById('producer-topic').value;
        const template = document.getElementById('message-template').value;
        const recordsPerSec = parseInt(document.getElementById('records-per-sec').value);
        const batchSize = parseInt(document.getElementById('batch-size').value);
        const duration = parseInt(document.getElementById('duration').value);
        const compression = document.getElementById('compression').value;

        if (!topic) {
            alert('Please select a topic.');
            return;
        }

        if (!template.trim()) {
            alert('Please enter a message template.');
            return;
        }

        try {
            const result = await Auth.apiRequest('/producer/start', 'POST', {
                topic,
                template,
                recordsPerSec,
                batchSize,
                duration,
                compression
            });

            sessionId = result.sessionId;
            isRunning = true;
            startTime = Date.now();
            resetMetrics();
            updateUI(true);
            startPolling();
        } catch (error) {
            alert('Failed to start producer: ' + error.message);
        }
    }

    /**
     * Stop producing messages.
     */
    async function stopProducing() {
        if (!sessionId) return;

        try {
            await Auth.apiRequest('/producer/stop', 'POST', { sessionId });
        } catch (error) {
            console.error('Error stopping producer:', error);
        } finally {
            isRunning = false;
            stopPolling();
            updateUI(false);
        }
    }

    /**
     * Poll for producer metrics every 2 seconds.
     */
    function startPolling() {
        pollInterval = setInterval(async () => {
            try {
                const result = await Auth.apiRequest(`/producer/status/${sessionId}`, 'GET');
                updateMetrics(result);

                // Auto-stop if session completed
                if (result.status === 'completed') {
                    isRunning = false;
                    stopPolling();
                    updateUI(false);
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 2000);
    }

    /**
     * Stop the polling interval.
     */
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    /**
     * Reset metrics display.
     */
    function resetMetrics() {
        metrics = { sent: 0, errors: 0, bytes: 0, latencyAvg: 0, latencyP99: 0, rate: 0 };
        renderMetrics();
    }

    /**
     * Update metrics from API response.
     */
    function updateMetrics(data) {
        metrics.sent = data.messagesSent || 0;
        metrics.errors = data.errors || 0;
        metrics.bytes = data.bytesSent || 0;
        metrics.latencyAvg = data.avgLatency || 0;
        metrics.latencyP99 = data.p99Latency || 0;

        // Calculate rate
        const elapsed = (Date.now() - startTime) / 1000;
        metrics.rate = elapsed > 0 ? Math.round(metrics.sent / elapsed) : 0;

        renderMetrics();
    }

    /**
     * Render metrics to the UI.
     */
    function renderMetrics() {
        document.getElementById('metric-sent').textContent = metrics.sent.toLocaleString();
        document.getElementById('metric-errors').textContent = metrics.errors.toLocaleString();
        document.getElementById('metric-rate').textContent = metrics.rate.toLocaleString();
        document.getElementById('metric-bytes').textContent = formatBytes(metrics.bytes);
        document.getElementById('metric-latency').textContent = `${metrics.latencyAvg}ms (p99: ${metrics.latencyP99}ms)`;
    }

    /**
     * Update UI state for running/stopped.
     */
    function updateUI(running) {
        document.getElementById('start-producer-btn').classList.toggle('d-none', running);
        document.getElementById('stop-producer-btn').classList.toggle('d-none', !running);
        document.getElementById('producer-active-badge').classList.toggle('d-none', !running);

        // Disable inputs while running
        const inputs = ['producer-topic', 'records-per-sec', 'batch-size', 'duration', 'compression', 'message-template'];
        inputs.forEach(id => {
            document.getElementById(id).disabled = running;
        });
    }

    /**
     * Save current template.
     */
    async function saveTemplate() {
        const template = document.getElementById('message-template').value;
        const name = prompt('Template name:');
        if (!name) return;

        try {
            await Auth.apiRequest('/templates', 'POST', { name, template });
            alert('Template saved successfully.');
        } catch (error) {
            alert('Failed to save template: ' + error.message);
        }
    }

    /**
     * Format bytes to human-readable string.
     */
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    return {
        init,
        refreshTopics
    };
})();
