// Requirements
const mqtt = require('mqtt')
const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const io = require('socket.io-client')
const mqtt_helpers = require('homeautomation-js-lib/mqtt_helpers.js')
const got = require('got')

// Config
var pool_topic = process.env.TOPIC_PREFIX
var poolHost = process.env.POOL_HOST

var mqttOptions = {}

var shouldRetain = process.env.MQTT_RETAIN

if (_.isNil(shouldRetain)) {
    shouldRetain = true
}

if (!_.isNil(shouldRetain)) {
    mqttOptions['retain'] = shouldRetain
}


var circuits = {}

// Setup MQTT
const client = mqtt_helpers.setupClient(function() {
    const topics = ['/circuit/+/set', '/poolheat/+/set', '/body/+/set']
    logging.info('Subscribing to: ' + JSON.stringify(topics))

    topics.forEach(topic => {
        client.subscribe(pool_topic + topic)
    })
}, null)



async function send_command(command, inputJSON) {
    const url = poolHost + command
    logging.info('pool request url: ' + url + '   body: ' + JSON.stringify(inputJSON))
    var error = null
    var body = null

    // socket.emit(command, JSON.stringify(inputJSON))

    try {
        const response = await got.put(url, { json: inputJSON })
        body = response.body
        logging.info('response: ' + JSON.stringify(body))
    } catch (e) {
        logging.error('failed send_command: ' + e)
        error = e
    }
}


client.on('message', (topic, message) => {
    logging.info(' ' + topic + ':' + message)
    if (topic.toString().includes('circuit')) {
        const components = topic.split('/')
        const circuit = components[components.length - 2]
        const payload = { 'id': circuit, 'isOn': (message == '1' ? true : false) }
        logging.info(' set circuit: ' + circuit + '   to: ' + message + '   payload: ' + JSON.stringify(payload))
        send_command('/state/circuit/setState', { id: circuit, state: message.toString() })
    } else if (topic.toString().includes('poolheat')) {
        const components = topic.split('/')
        const action = components[components.length - 2]
        logging.info(' set heat action: ' + action + '   to: ' + message)


        if (action.includes('setpoint')) {
            send_command('/state/body/setPoint', { id: 1, setPoint: message.toString() })
        } else if (action.includes('mode')) {
            send_command('/state/body/heatMode', { id: 1, mode: message.toString() })
        }
    }
})

const publishUpdate = function(category, index, value) {
    var topic = pool_topic

    if (!_.isNil(category)) {
        topic = topic + '/' + category.toString()
    }
    if (!_.isNil(index)) {
        topic = topic + '/' + index.toString()
    }

    if (_.isNil(value)) {
        value = 0
    }

    client.smartPublish(topic, value.toString(), mqttOptions)
}


var running_average_map = {}
const VALUES_FOR_RUNNING_AVERAGE = 5
const MIN_VALUES_FOR_RUNNING_AVERAGE_THRESHOLD = 3
const THRESHOLD_TO_THROW_AWAY = 6

const add_running_average = function(key, value) {
    var values = running_average_map[key]
    if (_.isNil(values)) {
        values = []
    }

    const current_average = running_average(key)

    if (values.length < MIN_VALUES_FOR_RUNNING_AVERAGE_THRESHOLD || Math.abs(current_average - value) <= THRESHOLD_TO_THROW_AWAY) {
        values.push(value)

        if (values.length > VALUES_FOR_RUNNING_AVERAGE) {
            values.shift()
        }
        running_average_map[key] = values
    } else {
        logging.error('throwing away value: ' + value + '   current average: ' + current_average)
    }
}

const running_average = function(key) {
    var values = running_average_map[key]
    if (_.isNil(values)) {
        return 0
    }
    var average = 0

    values.forEach(value => {
        average += value

    })

    return (average / values.length).toFixed(2)
}

const publish_running_average = function(topic, key, value) {
    if (!_.isNil(value)) {
        add_running_average(key, value)
        const average = running_average(key)
        logging.debug('' + key + ': ' + value)
        logging.debug('  => average: ' + average)
        client.smartPublish(mqtt_helpers.generateTopic(topic, key), average.toString(), mqttOptions)
    }
}
const cleanupCollection = function(collection) {
    if (_.isNil(collection)) {
        return {}
    }
    var fixed = {}

    Object.keys(collection).forEach(key => {
        var value = collection[key]

        switch (value) {
            case 'true':
            case true:
                value = 1
                break

            case 'false':
            case false:
                value = 0
                break

            default:
                break
        }

        fixed[key] = value
    })

    return fixed
}

const socket = io(poolHost)

socket.on('connect', () => {
    logging.info('connected to pool host')
})

socket.on('circuit', (circuitUpdate) => {
    try {
        logging.info('circuit: ' + JSON.stringify(circuitUpdate))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'circuit', circuitUpdate.id), cleanupCollection(circuitUpdate), ['type', 'lightingTheme'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'circuit', circuitUpdate.id, 'type'), cleanupCollection(circuitUpdate.type), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'circuit', circuitUpdate.id, 'theme'), cleanupCollection(circuitUpdate.lightingTheme), [], mqttOptions)
    } catch (e) {
        logging.error('failed circuit update' + e.message)
    }
})


socket.on('body', (body) => {
    try {
        logging.info('body: ' + JSON.stringify(body))
        publish_running_average(mqtt_helpers.generateTopic(pool_topic, 'body', body.id), 'temp', body.temp)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id), cleanupCollection(body), ['temp', 'heatMode', 'heatStatus', 'heaterOptions'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id, 'heat_mode'), cleanupCollection(body.heatMode), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id, 'heat_status'), cleanupCollection(body.heatStatus), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id, 'heater_options'), cleanupCollection(body.heaterOptions), [], mqttOptions)
    } catch (e) {
        logging.error('failed body update' + e.message)
    }
})

socket.on('lightGroup', (lightGroup) => {
    try {
        logging.info('lightGroup: ' + JSON.stringify(lightGroup))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id), cleanupCollection(lightGroup), ['action', 'lightingTheme', 'type'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id, 'action'), cleanupCollection(lightGroup.action), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id, 'theme'), cleanupCollection(lightGroup.lightingTheme), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id, 'type'), cleanupCollection(lightGroup.type), [], mqttOptions)
    } catch (e) {
        logging.error('failed lightGroup update' + e.message)
    }
})

socket.on('pump', (pump) => {
    try {
        logging.info('pump: ' + JSON.stringify(pump))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id), cleanupCollection(pump), ['status', 'type'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id, 'type'), cleanupCollection(pump.type), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id, 'status'), cleanupCollection(pump.status), [], mqttOptions)
    } catch (e) {
        logging.error('failed pump update' + e.message)
    }
})

socket.on('chlorinator', (chlorinator) => {
    try {
        logging.info('found chlorinator: ' + JSON.stringify(chlorinator))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'chlorinator', chlorinator.id), cleanupCollection(chlorinator), ['status', 'type', 'body'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'chlorinator', chlorinator.id, 'type'), cleanupCollection(chlorinator.type), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'chlorinator', chlorinator.id, 'status'), cleanupCollection(chlorinator.status), [], mqttOptions)
    } catch (e) {
        logging.error('failed chlorinator update : ' + e)
    }
})

socket.on('temps', (temperatures) => {
    try {
        logging.info('found temperatures: ' + JSON.stringify(temperatures))

        publish_running_average(mqtt_helpers.generateTopic(pool_topic, 'temperature'), 'waterSensor1', temperatures.waterSensor1)
        publish_running_average(mqtt_helpers.generateTopic(pool_topic, 'temperature'), 'air', temperatures.air)

        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'temperature'), temperatures, ['air', 'waterSensor1', 'units', 'bodies'], mqttOptions)
    } catch (e) {
        logging.error('failed temperature update: ' + e.message)
    }
})