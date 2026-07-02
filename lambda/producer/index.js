/**
 * Producer Lambda — Generate and send messages to MSK.
 * Deployed in VPC for private MSK cluster access.
 */

const { Kafka, CompressionTypes } = require('kafkajs');
const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { getAuthMechanism } = require('../control/auth-helper');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new DynamoDBClient({});
const TABLE_NAME = process.env.SESSION_TABLE || 'MSKLoadSimSessions';

exports.handler = async (event) => {
    const { httpMethod, path, body: rawBody, pathParameters } = event;
    const body = rawBody ? JSON.parse(rawBody) : {};

    try {
        if (path === '/producer/start' && httpMethod === 'POST') {
            return await startProducer(body, event);
        }
        if (path === '/producer/stop' && httpMethod === 'POST') {
            return await stopProducer(body);
        }
        if (path.startsWith('/producer/status/') && httpMethod === 'GET') {
            const sessionId = path.split('/').pop();
            return await getStatus(sessionId);
        }

        return response(404, { message: 'Not found' });
    } catch (error) {
        console.error('Producer function error:', error);
        return response(500, { message: error.message || 'Internal server error' });
    }
};

/**
 * Start a producer session.
 */
async function startProducer(body, event) {
    const { topic, template, recordsPerSec, batchSize, duration, compression } = body;
    const userId = getUserId(event);
    const sessionId = uuidv4();

    // Validate inputs
    if (!topic || !template) {
        return response(400, { message: 'Topic and template are required.' });
    }

    // Get cluster config
    const config = await getStoredConfig(userId);
    if (!config) {
        return response(400, { message: 'No cluster configuration. Please configure cluster first.' });
    }

    // Store session
    await dynamodb.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
            pk: { S: `SESSION#${sessionId}` },
            sk: { S: 'METADATA' },
            userId: { S: userId },
            topic: { S: topic },
            template: { S: template },
            recordsPerSec: { N: String(recordsPerSec || 100) },
            batchSize: { N: String(batchSize || 16) },
            duration: { N: String(duration || 60) },
            compression: { S: compression || 'none' },
            status: { S: 'running' },
            messagesSent: { N: '0' },
            errors: { N: '0' },
            bytesSent: { N: '0' },
            startedAt: { S: new Date().toISOString() },
            ttl: { N: String(Math.floor(Date.now() / 1000) + 86400) }
        }
    }));

    // Start producing (async — will continue after response)
    produceMessages(sessionId, config, body).catch(err => {
        console.error(`Session ${sessionId} error:`, err);
    });

    return response(200, { sessionId, status: 'running' });
}

/**
 * Produce messages to MSK.
 */
async function produceMessages(sessionId, clusterConfig, params) {
    const { topic, template, recordsPerSec, batchSize, duration, compression } = params;

    const kafka = createKafkaClient(clusterConfig);
    const producer = kafka.producer();

    const compressionMap = {
        'none': CompressionTypes.None,
        'gzip': CompressionTypes.GZIP,
        'snappy': CompressionTypes.Snappy,
        'lz4': CompressionTypes.LZ4,
        'zstd': CompressionTypes.ZSTD
    };

    try {
        await producer.connect();

        const endTime = Date.now() + (duration * 1000);
        const intervalMs = 1000 / (recordsPerSec / batchSize);
        let totalSent = 0;
        let totalErrors = 0;
        let totalBytes = 0;

        while (Date.now() < endTime) {
            // Check if stopped
            const session = await getSessionStatus(sessionId);
            if (session.status === 'stopped') break;

            // Generate batch
            const messages = [];
            for (let i = 0; i < batchSize; i++) {
                const value = renderTemplate(template);
                messages.push({ value });
                totalBytes += Buffer.byteLength(value);
            }

            try {
                await producer.send({
                    topic,
                    compression: compressionMap[compression] || CompressionTypes.None,
                    messages
                });
                totalSent += messages.length;
            } catch (err) {
                totalErrors += messages.length;
                console.error('Send error:', err.message);
            }

            // Update session metrics
            await updateSessionMetrics(sessionId, totalSent, totalErrors, totalBytes);

            // Throttle
            await sleep(intervalMs);
        }

        await producer.disconnect();

        // Mark completed
        await updateSessionStatus(sessionId, 'completed');
    } catch (error) {
        console.error('Producer error:', error);
        await updateSessionStatus(sessionId, 'error');
    }
}

/**
 * Stop a producer session.
 */
async function stopProducer(body) {
    const { sessionId } = body;
    if (!sessionId) {
        return response(400, { message: 'sessionId is required.' });
    }

    await updateSessionStatus(sessionId, 'stopped');
    return response(200, { success: true });
}

/**
 * Get producer session status and metrics.
 */
async function getStatus(sessionId) {
    const result = await dynamodb.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
            pk: { S: `SESSION#${sessionId}` },
            sk: { S: 'METADATA' }
        }
    }));

    if (!result.Item) {
        return response(404, { message: 'Session not found.' });
    }

    return response(200, {
        sessionId,
        status: result.Item.status.S,
        messagesSent: parseInt(result.Item.messagesSent.N),
        errors: parseInt(result.Item.errors.N),
        bytesSent: parseInt(result.Item.bytesSent.N),
        avgLatency: 12, // Placeholder — calculated from CloudWatch
        p99Latency: 45
    });
}

/**
 * Simple template renderer (server-side).
 */
function renderTemplate(template) {
    return template.replace(/\{\{(.+?)\}\}/g, (match, expression) => {
        const parts = expression.trim().split('.');
        if (parts[0] === 'random') {
            switch (parts[1]) {
                case 'uuid': return uuidv4();
                case 'number': return String(randomInt(1, 1000));
                case 'boolean': return String(Math.random() > 0.5);
                default:
                    if (parts[1] && parts[1].startsWith('number(')) {
                        const nums = parts[1].match(/\d+/g);
                        return String(randomInt(parseInt(nums[0]), parseInt(nums[1])));
                    }
                    if (parts[1] && parts[1].startsWith('float(')) {
                        const nums = parts[1].match(/[\d.]+/g);
                        return randomFloat(parseFloat(nums[0]), parseFloat(nums[1]), parseInt(nums[2]) || 2);
                    }
                    if (parts[1] && parts[1].startsWith('arrayElement(')) {
                        const arrStr = parts[1].match(/\[(.+)\]/);
                        if (arrStr) {
                            const arr = JSON.parse(arrStr[0].replace(/'/g, '"'));
                            return `"${arr[randomInt(0, arr.length - 1)]}"`;
                        }
                    }
                    return `"${uuidv4()}"`;
            }
        }
        return match;
    });
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals) {
    return (Math.random() * (max - min) + min).toFixed(decimals);
}

async function getSessionStatus(sessionId) {
    const result = await dynamodb.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: `SESSION#${sessionId}` }, sk: { S: 'METADATA' } }
    }));
    return { status: result.Item?.status?.S || 'unknown' };
}

async function updateSessionMetrics(sessionId, sent, errors, bytes) {
    await dynamodb.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: `SESSION#${sessionId}` }, sk: { S: 'METADATA' } },
        UpdateExpression: 'SET messagesSent = :s, errors = :e, bytesSent = :b',
        ExpressionAttributeValues: {
            ':s': { N: String(sent) },
            ':e': { N: String(errors) },
            ':b': { N: String(bytes) }
        }
    }));
}

async function updateSessionStatus(sessionId, status) {
    await dynamodb.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: `SESSION#${sessionId}` }, sk: { S: 'METADATA' } },
        UpdateExpression: 'SET #s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':status': { S: status } }
    }));
}

async function getStoredConfig(userId) {
    const result = await dynamodb.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: `USER#${userId}` }, sk: { S: 'CLUSTER_CONFIG' } }
    }));
    return result.Item?.config ? JSON.parse(result.Item.config.S) : null;
}

function createKafkaClient(config) {
    const kafkaConfig = { clientId: 'msk-load-sim-producer', brokers: config.brokers };
    const auth = getAuthMechanism(config);
    if (auth.ssl) kafkaConfig.ssl = auth.ssl;
    if (auth.sasl) kafkaConfig.sasl = auth.sasl;
    return new Kafka(kafkaConfig);
}

function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || 'anonymous';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
