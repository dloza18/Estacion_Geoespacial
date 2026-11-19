
/**
 * Servicio MQTT para Eclipse Mosquitto
 * Conexión desde GitHub Pages mediante WebSockets seguros.
 */

(function () {
  'use strict';

  let client = null;

  // Broker público oficial de Eclipse Mosquitto
  const BROKER_URL = 'wss://test.mosquitto.org:8081';

  // Tópico de comunicación
  const TOPIC_CMD = 'ucol/telematica/geostation/command';

  function initMQTT() {

    if (client) return;

    console.log("Conectando a Eclipse Mosquitto...");

    client = mqtt.connect(BROKER_URL, {
      clientId: `geostation_${Math.random().toString(16).substring(2, 12)}`,
      clean: true,
      connectTimeout: 30000,
      reconnectPeriod: 5000,
      keepalive: 60,
      protocolVersion: 4
    });

    client.on('connect', () => {

      console.log('¡CONECTADO EXITOSAMENTE A MOSQUITTO!');

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'Mosquitto En Línea';
        label.className =
          'text-xs font-semibold text-emerald-400 uppercase tracking-wider';
      }

      client.subscribe(TOPIC_CMD, (err) => {

        if (!err) {
          console.log('Suscripción exitosa:', TOPIC_CMD);
        } else {
          console.error('Error al suscribirse:', err);
        }

      });

      // MENSAJE AUTOMÁTICO DE PRUEBA
      publishCommand({
        dispositivo: "ESP32",
        mensaje: "Hola desde Geostation",
        estado: "Activo"
      });

    });

    client.on('message', (topic, payload) => {

      console.log(
        `Mensaje recibido en [${topic}]:`,
        payload.toString()
      );

    });

    client.on('error', (err) => {

      console.error('ERROR MQTT:', err);

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'MQTT Desconectado';
        label.className =
          'text-xs font-semibold text-rose-400 uppercase tracking-wider';
      }

    });

    client.on('close', () => {

      console.warn('Conexión MQTT cerrada');

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'MQTT Desconectado';
        label.className =
          'text-xs font-semibold text-rose-400 uppercase tracking-wider';
      }

    });

    client.on('reconnect', () => {
      console.log('Intentando reconectar con Mosquitto...');
    });

    client.on('offline', () => {
      console.warn('Cliente MQTT fuera de línea');
    });

  }

  // PUBLICAR MENSAJES
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
              'MENSAJE PUBLICADO EN:',
              TOPIC_CMD,
              jsonString
            );
          }

        }
      );

    } else {

      console.warn('MQTT no está conectado. No se pudo publicar.');

    }

  }

  // SERVICIO GLOBAL
  window.mqttService = {
    init: initMQTT,
    publish: publishCommand
  };

  // INICIALIZACIÓN AUTOMÁTICA
  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', initMQTT);

  } else {

    initMQTT();

  }

})();
