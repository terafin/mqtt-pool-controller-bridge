# mqtt-pool-controller-bridge

This is a simple docker container that I use to bridge to/from my MQTT bridge.

I have a collection of bridges, and the general format of these begins with these environment variables:

```yaml
      TOPIC_PREFIX: /your_topic_prefix  (eg: /some_topic_prefix/somthing)
      MQTT_HOST: YOUR_MQTT_URL (eg: mqtt://mqtt.yourdomain.net)
      (OPTIONAL) MQTT_USER: YOUR_MQTT_USERNAME
      (OPTIONAL) MQTT_PASS: YOUR_MQTT_PASSWORD
```

## Required environment variables

```yaml
MQTT_HOST: "mqtt://your-mqtt.server.here"
POOL_HOST: <YOUR_POOL_CONTROLLER_IP>
```

## Example Simple Docker Usage

Note: I recommend using docker-compose (lower down in docs), this is just a good/simple way to quickly test it

```bash
docker run terafin/mqtt-pool-controller-bridge:latest -e TOPIC_PREFIX="/pool" -e MQTT_HOST="mqtt://mymqtt.local.address" -e POOL_HOST="YOUR_POOL_HOST_IP"
```

This will spin up a working bridge, which current has the supported commands:

### Turn on Body 1 heat

```bash
mosquitto_pub -h your_mqtt_host -t "/pool/poolheat/mode/set"
 -m "1"
```

### Turn off Body 1 heat

```bash
mosquitto_pub -h your_mqtt_host -t "/pool/poolheat/mode/set"
 -m "0"
```

### Turn on Circuit 6

```bash
mosquitto_pub -h your_mqtt_host -t "/pool/circuit/6/set"
 -m "1"
```

### Turn off Circuit 6

```bash
mosquitto_pub -h your_mqtt_host -t "/pool/circuit/6/set"
 -m "0"
```

## Example Docker Compose

Here's an example docker compose
(my recommended way to use this):

```yaml
version: "3.4"
services:
    mqtt-pool-controller-bridge:
        image: ghcr.io/terafin/mqtt-pool-controller-bridge:latest
        container_name: mqtt-pool-controller-bridge
        environment:
            LOGGING_NAME: mqtt-pool-controller-bridge
            TZ: America/Los_Angeles
            TOPIC_PREFIX: /pool
            MQTT_HOST: mqtt://YOUR_MQTT_IP
            (OPTIONAL) MQTT_USER: MQTT_USERNAME
            (OPTIONAL) MQTT_PASS: MQTT_PASSWORD
            POOL_HOST: LOCAL_CONTROLLER_IP
        logging:
            options:
                max-size: "10m"
                max-file: "5"
            driver: json-file
        tty: true
        restart: always
```

## MQTT output

Here's some sample (from my system) results after using the above setup:

```log
/pool/body/1/id 1
/pool/body/1/temp 87.40
/pool/body/1/ison 1
/pool/body/1/name Pool
/pool/body/1/circuit 6
/pool/body/1/heat_mode/val 0
/pool/body/1/heat_mode/name off
/pool/body/1/heat_mode/desc Off
/pool/body/1/heat_status/val 0
/pool/body/1/heat_status/name off
/pool/body/1/heat_status/desc Off
/pool/body/1/setpoint 92
/pool/body/1/heater_options/total 1
/pool/body/1/heater_options/gas 1
/pool/body/1/heater_options/solar 0
/pool/body/1/heater_options/heatpump 0
/pool/body/1/heater_options/ultratemp 0
/pool/body/1/heater_options/hybrid 0
/pool/chlorinator/status Ok
/pool/chlorinator/installed 1
/pool/chlorinator/saltppm 3650
/pool/chlorinator/currentoutput 35
/pool/chlorinator/outputpoolpercent 35
/pool/chlorinator/outputspapercent 2
/pool/chlorinator/superchlorinate 0
/pool/chlorinator/version -1
/pool/chlorinator/name Intellichlor--40
/pool/chlorinator/superchlorinatehours 8
/pool/chlorinator/1/id 1
/pool/chlorinator/1/lastcomm 1599596179369
/pool/chlorinator/1/currentoutput 0
/pool/chlorinator/1/targetoutput 35
/pool/chlorinator/1/status/val 0
/pool/chlorinator/1/status/name ok
/pool/chlorinator/1/status/desc Ok
/pool/chlorinator/1/saltlevel 3750
/pool/chlorinator/1/saltrequired 0
/pool/chlorinator/1/type/val 0
/pool/chlorinator/1/type/name pentair
/pool/chlorinator/1/type/desc Pentair
/pool/chlorinator/1/name Intellichlor--40
/pool/temperature/poolheatmode 0
/pool/temperature/poolheatmodestr OFF
/pool/temperature/poolsetpoint 88
/pool/temperature/pooltemp 78
/pool/temperature/spatemp 78
/pool/temperature/airtemp 66
/pool/temperature/solartemp 0
/pool/temperature/freeze 0
/pool/temperature/spasetpoint 94
/pool/temperature/spamanualheatmode On
/pool/temperature/spaheatmode 0
/pool/temperature/spaheatmodestr OFF
/pool/temperature/heateractive 1
/pool/temperature/watersensor1 77.80
/pool/temperature/air 82.00
/pool/pump/1 1
/pool/pump/1/id 1
/pool/pump/1/command 10
/pool/pump/1/mode 0
/pool/pump/1/drivestate 0
/pool/pump/1/watts 702
/pool/pump/1/rpm 2300
/pool/pump/1/flow 0
/pool/pump/1/ppc 0
/pool/pump/1/time 794
/pool/pump/1/type/val 128
/pool/pump/1/type/name vs
/pool/pump/1/type/desc Intelliflo VS
/pool/pump/1/type/maxprimingtime 6
/pool/pump/1/type/minspeed 450
/pool/pump/1/type/maxspeed 3450
/pool/pump/1/type/speedstepsize 10
/pool/pump/1/type/maxcircuits 8
/pool/pump/1/type/hasaddress 1
/pool/pump/1/status/name ok
/pool/pump/1/status/desc Ok
/pool/pump/1/status/val 1
/pool/pump/1/name Intelliflo VS
/pool/pump/2/id 2
/pool/pump/2/type/val 0
/pool/pump/2/type/name none
/pool/pump/2/type/desc No pump
/pool/pump/2/type/maxcircuits 0
/pool/pump/2/type/hasaddress 0
/pool/pump/2/type/hasbody 0
/pool/pump/2/status/name off
/pool/pump/2/status/desc Off
/pool/pump/2/status/val 0
/pool/circuit/2 0
/pool/circuit/6 1
/pool/circuit/6/id 6
/pool/circuit/6/showinfeatures 1
/pool/circuit/6/ison 1
/pool/circuit/6/name Pool
/pool/circuit/6/nameid 61
/pool/circuit/6/type/val 2
/pool/circuit/6/type/name pool
/pool/circuit/6/type/desc Pool
/pool/circuit/3 0
/pool/circuit/3/id 3
/pool/circuit/3/showinfeatures 1
/pool/circuit/3/ison 0
/pool/circuit/3/name Pool Light
/pool/circuit/3/nameid 63
/pool/circuit/3/type/val 16
/pool/circuit/3/type/name intellibrite
/pool/circuit/3/type/desc Intellibrite
/pool/circuit/3/type/islight 1
/pool/circuit/1 0
/pool/circuit/4 0
/pool/circuit/5 0
/pool/circuit/7 0
/pool/circuit/8 0
/pool/circuit/9 0
/pool/circuit/10 0
/pool/circuit/11 0
/pool/circuit/12 0
/pool/circuit/13 0
/pool/circuit/14 0
/pool/circuit/15 0
/pool/circuit/16 0
/pool/circuit/17 0
/pool/circuit/18 0
/pool/circuit/19 0
/pool/circuit/20 0
```

These will be update every when the pool controller emits changes and new values are present
