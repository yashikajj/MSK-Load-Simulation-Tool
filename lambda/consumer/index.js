/**
 * Consumer Lambda — Read messages from MSK topics.
 * Deployed in VPC for private MSK cluster access.
 */

const { Kafka } = require('kafkajs');
const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { getAuthMechanism } = require('../control/auth-helper');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new DynamoDBClient({});
const TABLE_NAME = process.env.SESSION_TABLE || 'MSKLoadSimSessions';

exports.handler = async (event) => {
    const { httpMethod, path, body: rawBody } = event;
    const body = rawBody ? JSON.parse(rawBody) : {};

    try {
        if (path === '/consumer/start' && httpMethod === 'POST') {
            return await startConsumer(body, event);
        }
        if (path === '/consumer/stop' && httpMethod === 'POST') {
            return await stopConsumer(body);
        }
        if (path.startsWith('/consumer/messages/') && httpMethod === 'GET') {
            const sessionId = path.split('/').pop();
            return await getMessages(sessionId);
        }

        return response(404, { message: 'Not found' });
    } catch (error) {
        console.error('Consumer function error:', error);
        return response(500, { message: error.message || 'Internal server error' });
    }
};

/**
 * Start a consumer session.
 */
async function startConsumer(body, event) {
    const { topic, consumerGroup, startFrom } = body;
    const userId = getUserId(event);
    const sessionId = uuidv4();

    if (!topic) {
        return response(400, { message: 'Topic is required.' });
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
            sessionType: { S: 'consumer' },
            topic: { S: topic },
            consumerGroup: { S: consumerGroup || `msk-sim-${sessionId.substring(0, 8)}` },
            startFrom: { S: startFrom || 'latest' },
            status: { S: 'running' },
            messagesReceived: { N: '0' },
            startedAt: { S: new Date().toISOString() },
            ttl: { N: String(Math.floor(Date.now() / 1000) + 86400) }
        }
    }));

    // Start consuming (async)
    consumeMessages(sessionId, config, body).catch(err => {
        console.error(`Consumer session ${sessionId} error:`, err);
    });

    return response(200, { sessionId, status: 'running' });
}

/**
 * Consume messages from MSK topic.
 */
async function consumeMessages(sessionId, clusterConfig, params) {
    const { topic, consumerGroup, startFrom } = params;

    const kafka = createKafkaClient(clusterConfig);
    const consumer = kafka.consumer({
        groupId: consumerGroup || `msk-sim-${sessionId.substring(0, 8)}`
    });

    try {
        await consumer.connect();
        await consumer.subscribe({
            topic,
            fromBeginning: startFrom === 'earliest'
        });

        let messageBuffer = [];
        let totalReceived = 0;

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                // Check if stopped
                if (totalReceived % 100 === 0) {
                    const session = await getSessionStatus(sessionId);
                    if (session.status === 'stopped') {
                        await consumer.disconnect();
                        return;
                    }
                }

                const msg = {
                    partition,
                    offset: message.offset,
                    timestamp: message.timestamp,
                    key: message.key?.toString(),
                    value: message.value?.toString()
                };

                messageBuffer.push(msg);
                totalReceived++;

                // Flush buffer every 50 messages
                if (messageBuffer.length >= 50) {
                    await storeMessages(sessionId, messageBuffer);
                    messageBuffer = [];
                }

                // Update count
                await updateMessageCount(sessionId, totalReceived);
            }
        });
    } catch (error) {
        console.error('Consumer error:', error);
        await updateSessionStatus(sessionId, 'error');
    }
}

/**
 * Stop a consumer session.
 */
async function stopConsumer(body) {
    const { sessionId } = body;
    if (!sessionId) {
        return response(400, { message: 'sessionId is required.' });
    }

    await updateSessionStatus(sessionId, 'stopped');
    return response(200, { success: true });
}

/**
 * Get buffered messages for a consumer session.
 */
async function getMessages(sessionId) {
    // Query recent messages from DynamoDB
    const result = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
            ':pk': { S: `SESSION#${sessionId}` },
            ':prefix': { S: 'MSG#' }
        },
        Limit: 100,
        ScanIndexForward: false
    }));

    const messages = (result.Items || []).map(item => {
        const msg = JSON.parse(item.data.S);
        return msg;
    }).reverse();

    // Get session metadata for stats
    const meta = await dynamodb.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: `SESSION#${sessionId}` }, sk: { S: 'METADATA' } }
    }));

    const received = parseInt(meta.Item?.messagesReceived?.N || '0');

    return response(200, {
        messages,
        totalReceived: received,
        lag: 0,
        rate: messages.length > 0 ? Math.round(received / ((Date.now() - new Date(meta.Item?.startedAt?.S).getTime()) / 1000)) : 0
    });
}

/**
 * Store messages in DynamoDB.
 */
async function storeMessages(sessionId, messages) {
    const batchId = Date.now();

    await dynamodb.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
            pk: { S: `SESSION#${sessionId}` },
            sk: { S: `MSG#${batchId}` },
            data: { S: JSON.stringify(messages) },
            ttl: { N: String(Math.floor(Date.now() / 1000) + 3600) }
        }
    }));
}

async function updateMessageCount(sessionId, count) {
    await dynamodb.send(new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: `SESSION#${sessionId}` }, sk: { S: 'METADATA' } },
        UpdateExpression: 'SET messagesReceived = :c',
        ExpressionAttributeValues: { ':c': { N: String(count) } }
    }));
}

async function getSessionStatus(sessionId) {
    const result = await dynamodb.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: `SESSION#${sessionId}` }, sk: { S: 'METADATA' } }
    }));
    return { status: result.Item?.status?.S || 'unknown' };
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
    const kafkaConfig = { clientId: 'msk-load-sim-consumer', brokers: config.brokers };
    const auth = getAuthMechanism(config);
    if (auth.ssl) kafkaConfig.ssl = auth.ssl;
    if (auth.sasl) kafkaConfig.sasl = auth.sasl;
    return new Kafka(kafkaConfig);
}

function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || 'anonymous';
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
