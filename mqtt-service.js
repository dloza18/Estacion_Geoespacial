
/**
 * Servicio MQTT para Mosquitto / EMQX
 * Conexión mediante Internet usando WebSockets.
 */

(function () {
  'use strict';

  let client = null;

  // Broker MQTT público
  const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

  // Tópico de comunicación
  const TOPIC_CMD = 'ucol/telematica/geostation/command';

  function initMQTT() {

    if (client) return;

    console.log("Conectando al broker MQTT público...");

    client = mqtt.connect(BROKER_URL, {
      clientId: `geostation_${Math.random().toString(16).substring(2, 10)}`,
      clean: true,
      connectTimeout: 30000,
      reconnectPeriod: 3000,
      keepalive: 60
    });

    // Conexión exitosa
    client.on('connect', () => {

      console.log('¡Conectado al broker MQTT público!');

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'MQTT En Línea';
        label.className =
          'text-xs font-semibold text-emerald-400 uppercase tracking-wider';
      }

      // Suscribirse al tópico
      client.subscribe(TOPIC_CMD, (err) => {

        if (!err) {
          console.log(`Suscrito al tópico: ${TOPIC_CMD}`);
        } else {
          console.error('Error al suscribirse:', err);
        }

      });

    });

    // Recepción de mensajes
    client.on('message', (topic, payload) => {

      console.log(
        `Mensaje recibido en [${topic}]:`,
        payload.toString()
      );

    });

    // Errores
    client.on('error', (err) => {

      console.error('Error MQTT:', err);

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'MQTT Desconectado';
        label.className =
          'text-xs font-semibold text-rose-400 uppercase tracking-wider';
      }

    });

    // Desconexión
    client.on('close', () => {

      console.warn('Conexión MQTT cerrada');

    });

    // Reconexión
    client.on('reconnect', () => {

      console.log('Intentando reconectar con MQTT...');

    });

  }

  // Publicar comandos
  function publishCommand(payloadObj) {

    if (client && client.connected) {

      const jsonString = JSON.stringify(payloadObj);

      client.publish(
        TOPIC_CMD,
        jsonString,
        { qos: 0, retain: false },
        (err) => {

          if (err) {
            console.error('Error al publicar:', err);
          } else {
            console.log(
              `Mensaje publicado en [${TOPIC_CMD}]:`,
              jsonString
            );
          }

        }
      );

    } else {

      console.warn('MQTT no está conectado.');

    }

  }

  // Servicio global
  window.mqttService = {
    init: initMQTT,
    publish: publishCommand
  };

})();
