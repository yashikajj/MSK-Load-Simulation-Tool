/**
 * Metrics module — CloudWatch metrics display with Chart.js.
 */

const Metrics = (() => {
    let charts = {};
    let refreshInterval = null;

    /**
     * Initialize metrics module.
     */
    function init() {
        document.getElementById('refresh-metrics-btn').addEventListener('click', refreshMetrics);
        initCharts();
    }

    /**
     * Initialize Chart.js instances.
     */
    function initCharts() {
        const chartConfig = (label, color) => ({
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label,
                    data: [],
                    borderColor: color,
                    backgroundColor: color + '20',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 0 },
                scales: {
                    x: {
                        display: true,
                        grid: { color: '#2a3a5e' },
                        ticks: { color: '#8892a4', maxTicksLimit: 6 }
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        grid: { color: '#2a3a5e' },
                        ticks: { color: '#8892a4' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        charts.bytesIn = new Chart(
            document.getElementById('chart-bytes-in'),
            chartConfig('BytesInPerSec', '#36a2eb')
        );

        charts.bytesOut = new Chart(
            document.getElementById('chart-bytes-out'),
            chartConfig('BytesOutPerSec', '#4bc0c0')
        );

        charts.messagesIn = new Chart(
            document.getElementById('chart-messages-in'),
            chartConfig('MessagesInPerSec', '#ff6384')
        );

        charts.latency = new Chart(
            document.getElementById('chart-latency'),
            chartConfig('Latency (ms)', '#ffce56')
        );
    }

    /**
     * Refresh metrics from CloudWatch via API.
     */
    async function refreshMetrics() {
        const btn = document.getElementById('refresh-metrics-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Loading...';

        try {
            const result = await Auth.apiRequest('/metrics', 'GET');
            updateCharts(result);
            updateCloudWatchLink(result.dashboardUrl);
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh';
        }
    }

    /**
     * Update charts with new data.
     */
    function updateCharts(data) {
        if (data.bytesIn) {
            updateChart(charts.bytesIn, data.bytesIn);
        }
        if (data.bytesOut) {
            updateChart(charts.bytesOut, data.bytesOut);
        }
        if (data.messagesIn) {
            updateChart(charts.messagesIn, data.messagesIn);
        }
        if (data.latency) {
            updateChart(charts.latency, data.latency);
        }
    }

    /**
     * Update a single chart with data points.
     */
    function updateChart(chart, dataPoints) {
        const labels = dataPoints.map(dp => {
            const d = new Date(dp.timestamp);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        const values = dataPoints.map(dp => dp.value);

        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.update('none');
    }

    /**
     * Update CloudWatch dashboard link.
     */
    function updateCloudWatchLink(url) {
        const link = document.getElementById('cloudwatch-link');
        if (url) {
            link.href = url;
            link.classList.remove('d-none');
        }
    }

    /**
     * Start auto-refresh (every 30 seconds).
     */
    function startAutoRefresh() {
        refreshInterval = setInterval(refreshMetrics, 30000);
    }

    /**
     * Stop auto-refresh.
     */
    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    return {
        init,
        refreshMetrics,
        startAutoRefresh,
        stopAutoRefresh
    };
})();
