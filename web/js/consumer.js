/**
 * Consumer module — message consumption and display.
 */

const Consumer = (() => {
    let isRunning = false;
    let sessionId = null;
    let pollInterval = null;
    let messages = [];
    let totalReceived = 0;

    /**
     * Initialize consumer module.
     */
    function init() {
        document.getElementById('start-consumer-btn').addEventListener('click', startConsuming);
        document.getElementById('stop-consumer-btn').addEventListener('click', stopConsuming);
        document.getElementById('refresh-consumer-topics-btn').addEventListener('click', refreshConsumerTopics);
        document.getElementById('export-consumer-btn').addEventListener('click', exportMessages);
        document.getElementById('clear-consumer-btn').addEventListener('click', clearStream);
    }

    /**
     * Refresh topics in consumer dropdown.
     */
    async function refreshConsumerTopics() {
        const btn = document.getElementById('refresh-consumer-topics-btn');
        btn.disabled = true;

        try {
            const result = await Auth.apiRequest('/topics', 'GET');
            const select = document.getElementById('consumer-topic');
            select.innerHTML = '<option value="" disabled selected>Select topic...</option>';

            if (result.topics && result.topics.length > 0) {
                result.topics.forEach(topic => {
                    select.innerHTML += `<option value="${topic}">${topic}</option>`;
                });
            }
        } catch (error) {
            alert('Failed to load topics: ' + error.message);
        } finally {
            btn.disabled = false;
        }
    }

    /**
     * Start consuming messages.
     */
    async function startConsuming() {
        const topic = document.getElementById('consumer-topic').value;
        const consumerGroup = document.getElementById('consumer-group').value.trim();
        const startFrom = document.querySelector('input[name="startFrom"]:checked').value;

        if (!topic) {
            alert('Please select a topic.');
            return;
        }

        if (!consumerGroup) {
            alert('Please enter a consumer group.');
            return;
        }

        try {
            const result = await Auth.apiRequest('/consumer/start', 'POST', {
                topic,
                consumerGroup,
                startFrom
            });

            sessionId = result.sessionId;
            isRunning = true;
            totalReceived = 0;
            updateUI(true);
            startPolling();
        } catch (error) {
            alert('Failed to start consumer: ' + error.message);
        }
    }

    /**
     * Stop consuming messages.
     */
    async function stopConsuming() {
        if (!sessionId) return;

        try {
            await Auth.apiRequest('/consumer/stop', 'POST', { sessionId });
        } catch (error) {
            console.error('Error stopping consumer:', error);
        } finally {
            isRunning = false;
            stopPolling();
            updateUI(false);
        }
    }

    /**
     * Poll for new messages every 2 seconds.
     */
    function startPolling() {
        pollInterval = setInterval(async () => {
            try {
                const result = await Auth.apiRequest(`/consumer/messages/${sessionId}`, 'GET');

                if (result.messages && result.messages.length > 0) {
                    result.messages.forEach(msg => addMessage(msg));
                    totalReceived += result.messages.length;
                }

                updateStats(result);
            } catch (error) {
                console.error('Consumer polling error:', error);
            }
        }, 2000);
    }

    /**
     * Stop polling.
     */
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    /**
     * Add a message to the stream display.
     */
    function addMessage(msg) {
        messages.push(msg);

        const stream = document.getElementById('consumer-stream');
        const entry = document.createElement('div');
        entry.className = 'stream-entry';

        const timestamp = new Date(msg.timestamp || Date.now()).toLocaleTimeString();
        const partition = msg.partition !== undefined ? msg.partition : '-';
        const offset = msg.offset !== undefined ? msg.offset : '-';
        const value = typeof msg.value === 'object' ? JSON.stringify(msg.value) : msg.value;

        entry.innerHTML = `<span class="stream-timestamp">[${timestamp}]</span> <span class="stream-partition">P:${partition}</span> <span class="stream-offset">O:${offset}</span> <span class="stream-value">${escapeHtml(truncate(value, 120))}</span>`;

        stream.appendChild(entry);

        // Auto-scroll to bottom
        stream.scrollTop = stream.scrollHeight;

        // Limit displayed messages to 500
        if (stream.children.length > 500) {
            stream.removeChild(stream.firstChild);
        }
    }

    /**
     * Update consumer stats.
     */
    function updateStats(data) {
        document.getElementById('consumer-received').textContent = totalReceived.toLocaleString();
        document.getElementById('consumer-lag').textContent = (data.lag || 0).toLocaleString();

        const rate = data.rate || 0;
        document.getElementById('consumer-rate').textContent = `${rate} msg/s`;
    }

    /**
     * Update UI state.
     */
    function updateUI(running) {
        document.getElementById('start-consumer-btn').classList.toggle('d-none', running);
        document.getElementById('stop-consumer-btn').classList.toggle('d-none', !running);
        document.getElementById('consumer-active-badge').classList.toggle('d-none', !running);

        document.getElementById('consumer-topic').disabled = running;
        document.getElementById('consumer-group').disabled = running;
    }

    /**
     * Export messages as JSON or CSV.
     */
    function exportMessages() {
        if (messages.length === 0) {
            alert('No messages to export.');
            return;
        }

        const format = prompt('Export format (json or csv):', 'json');
        if (!format) return;

        let content, filename, mimeType;

        if (format.toLowerCase() === 'csv') {
            const headers = 'timestamp,partition,offset,value\n';
            const rows = messages.map(m =>
                `"${m.timestamp || ''}",${m.partition || ''},${m.offset || ''},"${(typeof m.value === 'object' ? JSON.stringify(m.value) : m.value || '').replace(/"/g, '""')}"`
            ).join('\n');
            content = headers + rows;
            filename = 'msk-messages.csv';
            mimeType = 'text/csv';
        } else {
            content = JSON.stringify(messages, null, 2);
            filename = 'msk-messages.json';
            mimeType = 'application/json';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Clear the stream display.
     */
    function clearStream() {
        messages = [];
        document.getElementById('consumer-stream').innerHTML = '';
        document.getElementById('consumer-received').textContent = '0';
    }

    /**
     * Escape HTML characters.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Truncate string to max length.
     */
    function truncate(str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
    }

    return {
        init,
        refreshConsumerTopics
    };
})();
