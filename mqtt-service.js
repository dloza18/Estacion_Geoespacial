
/**
 * Servicio de Enlace MQTT para Mosquitto (WebSockets)
 * Conecta la página web con un broker MQTT público.
 */

(function () {
  'use strict';

  let client = null;

  // Broker MQTT público
  const BROKER_URL = 'wss://broker.emqx.io:1883/mqtt';

  // Tópico de comunicación
  const TOPIC_CMD = 'ucol/telematica/geostation/command';

  function initMQTT() {
    if (client) return;

    console.log("Conectando al broker MQTT...");

    client = mqtt.connect(BROKER_URL, {
      clientId: `geostation_client_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 30000,
      reconnectPeriod: 3000,
      keepalive: 60
    });

    client.on('connect', () => {

      console.log('¡Conectado exitosamente al broker MQTT!');

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'MQTT En Línea';
        label.className = 'text-xs font-semibold text-emerald-400 uppercase tracking-wider';
      }

      client.subscribe(TOPIC_CMD, (err) => {
        if (!err) {
          console.log(`Suscrito correctamente al tópico: ${TOPIC_CMD}`);
        } else {
          console.error('Error al suscribirse:', err);
        }
      });

      // MENSAJE AUTOMÁTICO DE PRUEBA
      mqttService.publish({
        dispositivo: "ESP32",
        mensaje: "Hola desde Geostation",
        estado: "Activo"
      });

    });

    client.on('error', (err) => {

      console.error('Error de conexión con MQTT:', err);

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'MQTT Desconectado';
        label.className = 'text-xs font-semibold text-rose-400 uppercase tracking-wider';
      }

    });

    client.on('message', (topic, payload) => {
      console.log(`Mensaje recibido en [${topic}]:`, payload.toString());
    });

    client.on('close', () => {

      console.warn('Conexión MQTT cerrada');

      const label = document.getElementById('mqttStatusLabel');

      if (label) {
        label.textContent = 'MQTT Desconectado';
        label.className = 'text-xs font-semibold text-rose-400 uppercase tracking-wider';
      }

    });

    client.on('reconnect', () => {
      console.log('Intentando reconectar con MQTT...');
    });

  }

  function publishCommand(payloadObj) {

    if (client && client.connected) {

      const jsonString = JSON.stringify(payloadObj);

      client.publish(TOPIC_CMD, jsonString, { qos: 0, retain: false }, (err) => {

        if (err) {
          console.error('Fallo al publicar mensaje MQTT:', err);
        } else {
          console.log(`Mensaje publicado en [${TOPIC_CMD}]:`, jsonString);
        }

      });

    } else {
      console.warn('Cliente MQTT no conectado. El mensaje no se transmitió.');
    }

  }

  // Servicio global
  window.mqttService = {
    init: initMQTT,
    publish: publishCommand
  };

  // INICIALIZAR AUTOMÁTICAMENTE
  document.addEventListener('DOMContentLoaded', () => {
    initMQTT();
  });

})();
