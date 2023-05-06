// Requirements
const mqtt = require('mqtt')
const interval = require('interval-promise')
const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const io = require('socket.io-client')
const mqtt_helpers = require('homeautomation-js-lib/mqtt_helpers.js')
const utilities = require('homeautomation-js-lib/utilities.js')
const got = require('got')

const POLL_INTERVAL = 2
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

async function send_query(query) {
    const url = poolHost + query
    logging.info('pool query url: ' + url)
    var error = null
    var body = null

    // socket.emit(command, JSON.stringify(inputJSON))

    try {
        const response = await got.get(url)
        body = response.body
        logging.debug('response: ' + JSON.stringify(body))
    } catch (e) {
        logging.error('failed send_command: ' + e)
        error = e
    }

    return body
}


async function query_status() {
    const statusString = await send_query('/state/all')
    const status = JSON.parse(statusString)
        // logging.info('status: ' + statusString)

    // Object.keys(status).forEach(key => {
    // logging.info('key: ' + key)
    // logging.info('value: ' + JSON.stringify(status[key]))
    // });

    const pumps = status.pumps
    if (!_.isNil(pumps)) {
        pumps.forEach(item => {
            processPump(item)
        });
    }
    const temps = status.temps
    if (!_.isNil(temps)) {
        processTemps(temps)
        const bodies = temps.bodies
        if (!_.isNil(bodies)) {
            bodies.forEach(body => {
                processBody(body)
            });
        }
    }
    const valves = status.valves
    if (!_.isNil(valves)) {
        valves.forEach(item => {
            processValve(item)
        });
    }
    const chemControllers = status.chemControllers
    if (!_.isNil(chemControllers)) {
        chemControllers.forEach(item => {
            processChemController(item)
        });
    }
    const chlorinators = status.chlorinators
    if (!_.isNil(chlorinators)) {
        chlorinators.forEach(item => {
            processChlorinator(item)
        });
    }
    const circuits = status.circuits
    if (!_.isNil(circuits)) {
        circuits.forEach(item => {
            processCircuit(item)
        });
    }
    const heaters = status.heaters
    if (!_.isNil(heaters)) {
        heaters.forEach(item => {
            //processHeater(item)
        });
    }
    const features = status.features
    if (!_.isNil(features)) {
        features.forEach(item => {
            //processFeature(item)
        });
    }
    const lightGroups = status.lightGroups
    if (!_.isNil(lightGroups)) {
        lightGroups.forEach(item => {
            processLightGroup(item)
        });
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


const VALUES_FOR_RUNNING_AVERAGE = (60 / POLL_INTERVAL)
const MIN_VALUES_FOR_RUNNING_AVERAGE_THRESHOLD = 3
const THRESHOLD_TO_THROW_AWAY = 6
const MAX_VALUES_TO_THROW_AWAY = 2 * (10 / POLL_INTERVAL)

const average_options = {
    values_for_running_average: VALUES_FOR_RUNNING_AVERAGE,
    min_values_for_running_average_threshold: MIN_VALUES_FOR_RUNNING_AVERAGE_THRESHOLD,
    threshold_to_throw_away: THRESHOLD_TO_THROW_AWAY,
    max_values_to_throw_away: MAX_VALUES_TO_THROW_AWAY
}


const publish_running_average = function(topic, key, value) {
    if (!_.isNil(value)) {
        utilities.add_running_average(key, value, average_options)
        var average = utilities.running_average(key)
        logging.info('' + key + ': ' + value)
        logging.info('  => average: ' + average)
        average = Math.round(average)
        logging.info('  => rounded: ' + average)
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

// const socket = io(poolHost)
// logging.info('Connecting to: ' + poolHost)

// socket.on('connect', () => {
//     logging.info('connected to pool host')
// })

// socket.on('connect_error', function(data) {
//     logging.info('connection error: ' + data);
// })
// socket.on('connect_timeout', function(data) {
//     logging.info('connection timeout: ' + data);
// })
// socket.on('reconnect', function(data) {
//     logging.info('reconnect: ' + data);
// })
// socket.on('reconnect_attempt', function(data) {
//     logging.info('reconnect attempt: ' + data);
// })
// socket.on('reconnecting', function(data) {
//     logging.info('reconnecting: ' + data);
// })
// socket.on('reconnect_failed', function(data) {
//     logging.info('reconnect failed: ' + data);
// })

// socket.on('circuit', (circuitUpdate) => {
//     processCircuit(circuitUpdate)
// })


// socket.on('body', (body) => {
//     processBody(body)
// })

// socket.on('lightGroup', (lightGroup) => {
//     processLightGroup(lightGroup)
// })

// socket.on('pump', (pump) => {
//     processPump(pump)
// })

// socket.on('chlorinator', (chlorinator) => {
//     processChlorinator(chlorinator)
// })

// socket.on('temps', (temperatures) => {
//     processTemps(temperatures)
// })


const processBody = function(body) {
    try {
        logging.debug('body: ' + JSON.stringify(body))
        publish_running_average(mqtt_helpers.generateTopic(pool_topic, 'body', body.id), 'temp', body.temp)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id), cleanupCollection(body), ['temp', 'heatMode', 'heatStatus', 'heaterOptions'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id, 'heat_mode'), cleanupCollection(body.heatMode), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id, 'heat_status'), cleanupCollection(body.heatStatus), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'body', body.id, 'heater_options'), cleanupCollection(body.heaterOptions), [], mqttOptions)
    } catch (e) {
        logging.error('failed body update' + e.message)
    }
}

const processCircuit = function(circuitUpdate) {
    try {
        logging.debug('circuit: ' + JSON.stringify(circuitUpdate))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'circuit', circuitUpdate.id), cleanupCollection(circuitUpdate), ['type', 'lightingTheme'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'circuit', circuitUpdate.id, 'type'), cleanupCollection(circuitUpdate.type), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'circuit', circuitUpdate.id, 'theme'), cleanupCollection(circuitUpdate.lightingTheme), [], mqttOptions)
    } catch (e) {
        logging.error('failed circuit update ' + e.message)
    }
}

const processLightGroup = function(lightGroup) {
    try {
        logging.debug('lightGroup: ' + JSON.stringify(lightGroup))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id), cleanupCollection(lightGroup), ['action', 'lightingTheme', 'type'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id, 'action'), cleanupCollection(lightGroup.action), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id, 'theme'), cleanupCollection(lightGroup.lightingTheme), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'light_group', lightGroup.id, 'type'), cleanupCollection(lightGroup.type), [], mqttOptions)
    } catch (e) {
        logging.error('failed lightGroup update ' + e.message)
    }
}

const processTemps = function(temperatures) {
    try {
        logging.debug('found temperatures: ' + JSON.stringify(temperatures))

        publish_running_average(mqtt_helpers.generateTopic(pool_topic, 'temperature'), 'waterSensor1', temperatures.waterSensor1)
        publish_running_average(mqtt_helpers.generateTopic(pool_topic, 'temperature'), 'air', temperatures.air)

        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'temperature'), temperatures, ['air', 'waterSensor1', 'units', 'bodies'], mqttOptions)
    } catch (e) {
        logging.error('failed temperature update: ' + e.message)
    }
}

const processPump = function(pump) {
    try {
        logging.debug('pump: ' + JSON.stringify(pump))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id), cleanupCollection(pump), ['status', 'type'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id, 'type'), cleanupCollection(pump.type), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id, 'status'), cleanupCollection(pump.status), [], mqttOptions)
    } catch (e) {
        logging.error('failed pump update ' + e.message)
    }
}

const processValve = function(valve) {
    try {
        logging.debug('valve: ' + JSON.stringify(valve))
            // client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id), cleanupCollection(pump), ['status', 'type'], mqttOptions)
            // client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id, 'type'), cleanupCollection(pump.type), [], mqttOptions)
            // client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'pump', pump.id, 'status'), cleanupCollection(pump.status), [], mqttOptions)
    } catch (e) {
        logging.error('failed valve update ' + e.message)
    }
}

const processChemController = function(chemController) {
    try {
        logging.debug('found chemController: ' + JSON.stringify(chemController))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'chemController', chemController.id), cleanupCollection(chemController), [], mqttOptions)
    } catch (e) {
        logging.error('failed chemController update : ' + e)
    }
}

const processChlorinator = function(chlorinator) {
    try {
        logging.debug('found chlorinator: ' + JSON.stringify(chlorinator))
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'chlorinator', chlorinator.id), cleanupCollection(chlorinator), ['status', 'type', 'body'], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'chlorinator', chlorinator.id, 'type'), cleanupCollection(chlorinator.type), [], mqttOptions)
        client.smartPublishCollection(mqtt_helpers.generateTopic(pool_topic, 'chlorinator', chlorinator.id, 'status'), cleanupCollection(chlorinator.status), [], mqttOptions)
    } catch (e) {
        logging.error('failed chlorinator update : ' + e)
    }
}


const startHostCheck = function() {
    if (!_.isNil(poolHost)) {
        logging.info('Starting to monitor host: ' + poolHost)
    }
    interval(async() => {
        query_status()
    }, POLL_INTERVAL * 1000)
    query_status()
}

startHostCheck()
