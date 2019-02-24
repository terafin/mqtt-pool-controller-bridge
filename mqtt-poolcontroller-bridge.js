// Requirements
const mqtt = require('mqtt')
const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const io = require('socket.io-client')

require('homeautomation-js-lib/mqtt_helpers.js')

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
const client = mqtt.setupClient(function() {
	client.subscribe(pool_topic + '/circuit/+/set')
	client.subscribe(pool_topic + '/poolheat/+/set')
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
	} else if ( topic.toString().includes('poolheat')) {
		const components = topic.split('/')
		const action = components[components.length - 2]
		logging.info(' set heat action: ' + action + '   to: ' + message)

        
		if ( action.includes('setpoint')) {
			socket.emit('setPoolSetPoint', message.toString())
		} else if ( action.includes('mode')) {
			socket.emit('poolheatmode', message.toString())
		}
	}
})

const publishUpdate = function(category, index, value) {
	var topic = pool_topic

	if ( !_.isNil(category)) {
		topic = topic + '/' + category.toString()
	}
	if ( !_.isNil(index)) {
		topic = topic + '/' + index.toString()
	}

	if (_.isNil(value)) {
		value = 0
	}
    
	client.smartPublish(topic, value.toString(), mqttOptions)
}


const socket = io(poolHost)

socket.on('connect', () => {
	logging.info('connected to pool host')
})

socket.on('circuit', (circuitUpdate) => {
	circuits = circuitUpdate
	logging.info('circuit: ' + JSON.stringify(circuitUpdate))
	circuits = circuits['circuit']

	Object.keys(circuits).forEach(circuitIndex => {
		const circuitInfo = circuits[circuitIndex]
		publishUpdate('circuit', circuitIndex, circuitInfo['status'])
	})

})
socket.on('pump', (pumps) => {
	logging.info('found pumps: ' + JSON.stringify(pumps))
	pumps = pumps['pump']
    
	Object.keys(pumps).forEach(pumpIndex => {
		const pumpInfo = pumps[pumpIndex]
		const power = pumpInfo['power']
		publishUpdate('pump', pumpIndex, power)
	})
})
socket.on('chlorinator', (chlorinator) => {
	logging.info('found chlorinator: ' + JSON.stringify(chlorinator))
	chlorinator = chlorinator['chlorinator']

	Object.keys(chlorinator).forEach(chlorinatorKey => {
		publishUpdate('chlorinator', chlorinatorKey, chlorinator[chlorinatorKey])
	})
})
socket.on('temperatures', (temperatures) => {
	logging.info('found temperatures: ' + JSON.stringify(temperatures))
	temperatures = temperatures['temperature']
    
	Object.keys(temperatures).forEach(temperature => {
		publishUpdate('temperature', temperature, temperatures[temperature])
	})
})
