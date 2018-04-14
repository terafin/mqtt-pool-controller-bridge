// Requirements
const mqtt = require('mqtt')
const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const repeat = require('repeat')
const bodyParser = require('body-parser')
const io = require('socket.io-client')

require('homeautomation-js-lib/mqtt_helpers.js')

// Config
var pool_topic = process.env.TOPIC_PREFIX
var poolHost = process.env.POOL_HOST

var mqttOptions = {}

var shouldRetain = process.env.MQTT_RETAIN

if (_.isNil(shouldRetain)) {
    shouldRetain = false
}

if (!_.isNil(shouldRetain)) {
    mqttOptions['retain'] = shouldRetain
}


var circuits = {}

// Setup MQTT
const client = mqtt.setupClient(function() {
    client.subscribe(pool_topic + '/circuit/+/set')
}, null)


client.on('message', (topic, message) => {
    logging.info(' ' + topic + ':' + message)
    if ( topic.toString().includes('circuit')) {
        const components = topic.split('/')
        const circuit = components[components.length - 2]
        logging.info(' set circuit: ' + circuit + '   to: ' + message)

        
        Object.keys(circuits).forEach(circuitIndex => {
            if ( circuitIndex == circuit ) {
                const circuitInfo = circuits[circuitIndex]
                const status = circuitInfo['status']
                if ( status != message ) {
                    socket.emit('toggleCircuit', circuitIndex)
                }
            }
        })
    }
})

function publishUpdate(category, index, value) {
    var topic = pool_topic

    if ( !_.isNil(category))
        topic = topic + '/' + category.toString()
    if ( !_.isNil(index))
        topic = topic + '/' + index.toString()

    client.smartPublish(topic, value.toString(), mqttOptions)
}


const socket = io(poolHost)

socket.on('connect', () => {
    logging.info('connected to pool host')
})

socket.on('circuit', (circuitUpdate) => {
    logging.info('found circuits: ' + JSON.stringify(circuitUpdate))
    circuits = circuitUpdate

    Object.keys(circuits).forEach(circuitIndex => {
        const circuitInfo = circuits[circuitIndex]
        logging.info('info: ' + JSON.stringify(circuitInfo))
        const status = circuitInfo['status']
        publishUpdate('circuit', circuitIndex, status)
    })

})
socket.on('pump', (pumps) => {
    logging.info('found pumps: ' + JSON.stringify(pumps))
    Object.keys(pumps).forEach(pumpIndex => {
        const pumpInfo = pumps[pumpIndex]
        logging.info('pump ' + pumpIndex + ' info: ' + JSON.stringify(pumpInfo))
        const power = pumpInfo['power']
        publishUpdate('pump', pumpIndex, power)
    })
})
socket.on('chlorinator', (chlorinator) => {
    logging.info('found chlorinator: ' + JSON.stringify(chlorinator))
})
socket.on('temperatures', (temperatures) => {
    logging.info('found temperatures: ' + JSON.stringify(temperatures))
})
