/**
 * Servicio de Enlace MQTT para Mosquitto (WebSockets)
 * Se encarga de conectar la SPA con el broker y publicar los comandos.
 */

(function () {
  'use strict';

  let client = null;
  // Modifica 'localhost' por tu IP local si te conectas desde otra PC o dispositivo
  const BROKER_URL = 'ws://localhost:9001/mqtt'; 
  const TOPIC_CMD = 'ucol/telematica/geostation/command';

  function initMQTT() {
    if (client) return;
    
    console.log("Conectando al broker Mosquitto...");

    client = mqtt.connect(BROKER_URL, {
      clientId: `geostation_client_${Math.random().toString(16).substring(2, 8)}`,
      clean: true
    });

    client.on('connect', () => {
      console.log('¡Conectado exitosamente a Mosquitto MQTT!');
      const label = document.getElementById('mqttStatusLabel');
      if (label) {
        label.textContent = 'Mosquitto En Línea';
        label.className = 'text-xs font-semibold text-emerald-400 uppercase tracking-wider';
      }
      client.subscribe(TOPIC_CMD, (err) => {
        if (!err) console.log(`Suscrito correctamente al tópico: ${TOPIC_CMD}`);
      });
    });

    client.on('error', (err) => {
      console.error('Error de conexión con Mosquitto:', err);
      const label = document.getElementById('mqttStatusLabel');
      if (label) {
        label.textContent = 'MQTT Desconectado';
        label.className = 'text-xs font-semibold text-rose-400 uppercase tracking-wider';
      }
    });

    client.on('message', (topic, payload) => {
      console.log(`Mensaje recibido en [${topic}]:`, payload.toString());
    });
  }

  function publishCommand(payloadObj) {
    if (client && client.connected) {
      const jsonString = JSON.stringify(payloadObj);
      client.publish(TOPIC_CMD, jsonString, { qos: 0 }, (err) => {
        if (err) {
          console.error('Fallo al publicar mensaje MQTT:', err);
        } else {
          console.log(`Mosquitto publicado en [${TOPIC_CMD}]:`, jsonString);
        }
      });
    } else {
      console.warn('Cliente MQTT no conectado. El comando se procesó localmente pero no se transmitió.');
    }
  }

  // Exponer el servicio globalmente para que app.js lo utilice
  window.mqttService = {
    init: initMQTT,
    publish: publishCommand
  };

})();