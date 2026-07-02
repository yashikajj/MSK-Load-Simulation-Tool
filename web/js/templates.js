/**
 * Pre-built message templates for the MSK Load Simulation Tool.
 * Uses Faker.js syntax for dynamic data generation.
 */

const MessageTemplates = {
    ecommerce: {
        name: 'E-Commerce Order',
        template: `{
  "orderId": "{{random.uuid}}",
  "customerId": "{{random.uuid}}",
  "amount": {{random.number(1,1000)}},
  "currency": "USD",
  "status": "{{random.arrayElement(['PENDING','CONFIRMED','SHIPPED','DELIVERED'])}}",
  "items": [
    {
      "productId": "{{random.uuid}}",
      "name": "{{commerce.productName}}",
      "quantity": {{random.number(1,5)}},
      "price": {{random.float(5,200,2)}}
    }
  ],
  "shippingAddress": {
    "city": "{{address.city}}",
    "state": "{{address.state}}",
    "zipCode": "{{address.zipCode}}"
  },
  "timestamp": "{{date.recent}}"
}`
    },

    iot: {
        name: 'IoT Sensor',
        template: `{
  "sensorId": "sensor-{{random.number(1,500)}}",
  "deviceType": "{{random.arrayElement(['temperature','humidity','pressure','motion'])}}",
  "temperature": {{random.float(15,45,1)}},
  "humidity": {{random.float(20,95,1)}},
  "pressure": {{random.float(980,1050,1)}},
  "batteryLevel": {{random.number(1,100)}},
  "location": {
    "lat": {{random.float(-90,90,6)}},
    "lng": {{random.float(-180,180,6)}}
  },
  "timestamp": "{{date.recent}}"
}`
    },

    financial: {
        name: 'Financial Transaction',
        template: `{
  "transactionId": "txn-{{random.uuid}}",
  "accountId": "acct-{{random.number(100000,999999)}}",
  "type": "{{random.arrayElement(['DEBIT','CREDIT','TRANSFER','PAYMENT'])}}",
  "amount": {{random.float(1,50000,2)}},
  "currency": "{{random.arrayElement(['USD','EUR','GBP','JPY'])}}",
  "merchantId": "{{random.uuid}}",
  "merchantName": "{{company.name}}",
  "category": "{{random.arrayElement(['retail','food','travel','utilities','entertainment'])}}",
  "status": "{{random.arrayElement(['PENDING','COMPLETED','FAILED','REVERSED'])}}",
  "timestamp": "{{date.recent}}"
}`
    },

    clickstream: {
        name: 'Clickstream',
        template: `{
  "userId": "user-{{random.number(1,10000)}}",
  "sessionId": "{{random.uuid}}",
  "pageUrl": "{{internet.url}}",
  "referrer": "{{internet.url}}",
  "action": "{{random.arrayElement(['page_view','click','scroll','form_submit','add_to_cart','purchase'])}}",
  "element": "{{random.arrayElement(['button','link','image','form','nav','footer'])}}",
  "userAgent": "{{internet.userAgent}}",
  "ipAddress": "{{internet.ip}}",
  "duration": {{random.number(1,300)}},
  "timestamp": "{{date.recent}}"
}`
    },

    log: {
        name: 'Log Entry',
        template: `{
  "level": "{{random.arrayElement(['INFO','WARN','ERROR','DEBUG'])}}",
  "service": "{{random.arrayElement(['auth-service','payment-service','order-service','notification-service','inventory-service'])}}",
  "message": "{{lorem.sentence}}",
  "traceId": "{{random.uuid}}",
  "spanId": "{{random.alphaNumeric(16)}}",
  "host": "ip-{{random.number(10,172)}}-{{random.number(0,255)}}-{{random.number(0,255)}}-{{random.number(1,254)}}",
  "statusCode": {{random.arrayElement([200,201,400,401,403,404,500,502,503])}},
  "responseTime": {{random.number(1,5000)}},
  "timestamp": "{{date.recent}}"
}`
    },

    custom: {
        name: 'Custom (blank)',
        template: `{
  "key": "value"
}`
    }
};

/**
 * Parse and render a template string with Faker.js values.
 * Replaces {{generator}} placeholders with generated data.
 */
function renderTemplate(templateStr) {
    if (typeof faker === 'undefined') {
        console.warn('Faker.js not loaded, returning raw template');
        return templateStr;
    }

    return templateStr.replace(/\{\{(.+?)\}\}/g, (match, expression) => {
        try {
            const parts = expression.trim().split('.');
            let result;

            // Handle special cases
            if (parts[0] === 'random') {
                result = handleRandomGenerator(parts[1]);
            } else {
                // Navigate faker object
                let obj = faker;
                for (const part of parts) {
                    if (typeof obj[part] === 'function') {
                        obj = obj[part]();
                        break;
                    } else if (obj[part]) {
                        obj = obj[part];
                    } else {
                        return match; // Return original if not found
                    }
                }
                result = obj;
            }

            // Return appropriate format
            if (typeof result === 'string') {
                return `"${result}"`;
            }
            return String(result);
        } catch (e) {
            return match; // Return original on error
        }
    });
}

/**
 * Handle random.* generators with arguments.
 */
function handleRandomGenerator(method) {
    if (!method) return '';

    // Parse method name and arguments
    const methodMatch = method.match(/^(\w+)\((.+)\)$/);

    if (methodMatch) {
        const funcName = methodMatch[1];
        const argsStr = methodMatch[2];

        switch (funcName) {
            case 'number': {
                const [min, max] = argsStr.split(',').map(s => parseInt(s.trim()));
                return faker.number.int({ min: min || 0, max: max || 1000 });
            }
            case 'float': {
                const [min, max, precision] = argsStr.split(',').map(s => parseFloat(s.trim()));
                return faker.number.float({ min: min || 0, max: max || 100, fractionDigits: precision || 2 });
            }
            case 'arrayElement': {
                const arr = JSON.parse(argsStr.replace(/'/g, '"'));
                return arr[Math.floor(Math.random() * arr.length)];
            }
            case 'alphaNumeric': {
                const len = parseInt(argsStr) || 10;
                return faker.string.alphanumeric(len);
            }
            default:
                return faker.string.uuid();
        }
    }

    // Simple methods without arguments
    switch (method) {
        case 'uuid': return faker.string.uuid();
        case 'boolean': return faker.datatype.boolean();
        default: return faker.string.uuid();
    }
}
