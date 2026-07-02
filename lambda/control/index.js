/**
 * Control Lambda — Test connection, manage sessions, list topics.
 * Deployed in VPC for private MSK cluster access.
 */

const { Kafka } = require('kafkajs');
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { getAuthMechanism } = require('./auth-helper');

const dynamodb = new DynamoDBClient({});
const TABLE_NAME = process.env.SESSION_TABLE || 'MSKLoadSimSessions';

exports.handler = async (event) => {
    const { httpMethod, path, body: rawBody } = event;
    const body = rawBody ? JSON.parse(rawBody) : {};

    try {
        // Route requests
        if (path === '/cluster/test' && httpMethod === 'POST') {
            return await testConnection(body);
        }
        if (path === '/cluster/save' && httpMethod === 'POST') {
            return await saveClusterConfig(body, event);
        }
        if (path === '/topics' && httpMethod === 'GET') {
            return await listTopics(event);
        }
        if (path === '/topics' && httpMethod === 'POST') {
            return await createTopic(body, event);
        }

        return response(404, { message: 'Not found' });
    } catch (error) {
        console.error('Control function error:', error);
        return response(500, { message: error.message || 'Internal server error' });
    }
};

/**
 * Test connection to MSK cluster.
 */
async function testConnection(config) {
    const kafka = createKafkaClient(config);
    const admin = kafka.admin();

    try {
        await admin.connect();
        const cluster = await admin.describeCluster();
        await admin.disconnect();

        return response(200, {
            success: true,
            brokerCount: cluster.brokers.length,
            clusterId: cluster.clusterId,
            brokers: cluster.brokers.map(b => `${b.host}:${b.port}`)
        });
    } catch (error) {
        return response(400, {
            success: false,
            message: `Connection failed: ${error.message}`
        });
    }
}

/**
 * Save cluster configuration to DynamoDB.
 */
async function saveClusterConfig(config, event) {
    const userId = getUserId(event);

    await dynamodb.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
            pk: { S: `USER#${userId}` },
            sk: { S: 'CLUSTER_CONFIG' },
            config: { S: JSON.stringify(config) },
            updatedAt: { S: new Date().toISOString() }
        }
    }));

    return response(200, { success: true });
}

/**
 * List topics from the MSK cluster.
 */
async function listTopics(event) {
    const config = await getStoredConfig(event);
    if (!config) {
        return response(400, { message: 'No cluster configuration saved. Please configure cluster first.' });
    }

    const kafka = createKafkaClient(config);
    const admin = kafka.admin();

    try {
        await admin.connect();
        const topics = await admin.listTopics();
        await admin.disconnect();

        // Filter out internal topics
        const userTopics = topics.filter(t => !t.startsWith('__'));

        return response(200, { topics: userTopics.sort() });
    } catch (error) {
        return response(500, { message: `Failed to list topics: ${error.message}` });
    }
}

/**
 * Create a new topic.
 */
async function createTopic(body, event) {
    const config = await getStoredConfig(event);
    if (!config) {
        return response(400, { message: 'No cluster configuration saved.' });
    }

    const { name, partitions, replicationFactor } = body;

    if (!name) {
        return response(400, { message: 'Topic name is required.' });
    }

    const kafka = createKafkaClient(config);
    const admin = kafka.admin();

    try {
        await admin.connect();
        await admin.createTopics({
            topics: [{
                topic: name,
                numPartitions: partitions || 3,
                replicationFactor: replicationFactor || 3
            }]
        });
        await admin.disconnect();

        return response(201, { success: true, topic: name });
    } catch (error) {
        return response(500, { message: `Failed to create topic: ${error.message}` });
    }
}

/**
 * Create a KafkaJS client with the appropriate auth mechanism.
 */
function createKafkaClient(config) {
    const kafkaConfig = {
        clientId: 'msk-load-simulator',
        brokers: config.brokers
    };

    const auth = getAuthMechanism(config);
    if (auth.ssl) kafkaConfig.ssl = auth.ssl;
    if (auth.sasl) kafkaConfig.sasl = auth.sasl;

    return new Kafka(kafkaConfig);
}

/**
 * Get stored cluster config from DynamoDB.
 */
async function getStoredConfig(event) {
    const userId = getUserId(event);

    const result = await dynamodb.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
            pk: { S: `USER#${userId}` },
            sk: { S: 'CLUSTER_CONFIG' }
        }
    }));

    if (result.Item && result.Item.config) {
        return JSON.parse(result.Item.config.S);
    }
    return null;
}

/**
 * Extract user ID from Cognito authorizer.
 */
function getUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub || 'anonymous';
}

/**
 * Build API Gateway response.
 */
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
