/**
 * Metrics Lambda — Fetch CloudWatch metrics for MSK cluster.
 * Deployed in VPC for private MSK cluster access.
 */

const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { KafkaClient, ListClustersV2Command } = require('@aws-sdk/client-kafka');

const cloudwatch = new CloudWatchClient({});
const kafka = new KafkaClient({});

const CLUSTER_NAME = process.env.MSK_CLUSTER_NAME || '';
const CLUSTER_ARN = process.env.MSK_CLUSTER_ARN || '';

exports.handler = async (event) => {
    const { httpMethod, path } = event;

    try {
        if (path === '/metrics' && httpMethod === 'GET') {
            return await getMetrics();
        }

        return response(404, { message: 'Not found' });
    } catch (error) {
        console.error('Metrics function error:', error);
        return response(500, { message: error.message || 'Internal server error' });
    }
};

/**
 * Get MSK CloudWatch metrics for the last hour.
 */
async function getMetrics() {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago

    const clusterName = CLUSTER_NAME || await discoverClusterName();

    if (!clusterName) {
        return response(200, {
            bytesIn: [],
            bytesOut: [],
            messagesIn: [],
            latency: [],
            message: 'No MSK cluster configured. Set MSK_CLUSTER_NAME environment variable.'
        });
    }

    const metricQueries = [
        {
            Id: 'bytesIn',
            MetricStat: {
                Metric: {
                    Namespace: 'AWS/Kafka',
                    MetricName: 'BytesInPerSec',
                    Dimensions: [{ Name: 'Cluster Name', Value: clusterName }]
                },
                Period: 60,
                Stat: 'Average'
            }
        },
        {
            Id: 'bytesOut',
            MetricStat: {
                Metric: {
                    Namespace: 'AWS/Kafka',
                    MetricName: 'BytesOutPerSec',
                    Dimensions: [{ Name: 'Cluster Name', Value: clusterName }]
                },
                Period: 60,
                Stat: 'Average'
            }
        },
        {
            Id: 'messagesIn',
            MetricStat: {
                Metric: {
                    Namespace: 'AWS/Kafka',
                    MetricName: 'MessagesInPerSec',
                    Dimensions: [{ Name: 'Cluster Name', Value: clusterName }]
                },
                Period: 60,
                Stat: 'Average'
            }
        },
        {
            Id: 'produceLatency',
            MetricStat: {
                Metric: {
                    Namespace: 'AWS/Kafka',
                    MetricName: 'ProduceTotalTimeMsMean',
                    Dimensions: [{ Name: 'Cluster Name', Value: clusterName }]
                },
                Period: 60,
                Stat: 'Average'
            }
        }
    ];

    const result = await cloudwatch.send(new GetMetricDataCommand({
        MetricDataQueries: metricQueries,
        StartTime: startTime,
        EndTime: endTime
    }));

    const formatResults = (metricId) => {
        const metricResult = result.MetricDataResults.find(r => r.Id === metricId);
        if (!metricResult || !metricResult.Timestamps) return [];

        return metricResult.Timestamps.map((ts, i) => ({
            timestamp: ts.toISOString(),
            value: Math.round(metricResult.Values[i] * 100) / 100
        })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    };

    const region = process.env.AWS_REGION || 'us-east-1';
    const dashboardUrl = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=MSK-${clusterName}`;

    return response(200, {
        bytesIn: formatResults('bytesIn'),
        bytesOut: formatResults('bytesOut'),
        messagesIn: formatResults('messagesIn'),
        latency: formatResults('produceLatency'),
        dashboardUrl,
        clusterName
    });
}

/**
 * Discover MSK cluster name from the account.
 */
async function discoverClusterName() {
    try {
        const result = await kafka.send(new ListClustersV2Command({ MaxResults: 1 }));
        if (result.ClusterInfoList && result.ClusterInfoList.length > 0) {
            return result.ClusterInfoList[0].ClusterName;
        }
    } catch (error) {
        console.warn('Could not discover MSK cluster:', error.message);
    }
    return null;
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        body: JSON.stringify(body)
    };
}
