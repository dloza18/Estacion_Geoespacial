/**
 * Estación Geoespacial de Reconocimiento - Frontend SPA (Mosquitto MQTT Version)
 * Universidad de Colima - Entornos Inteligentes
 */

(function () {
  'use strict';

  // State Store
  const state = {
    user: null, // { username, role }
    activeTab: 'tab-inicio',
    controlMode: 'manual', // 'manual' | 'auto'
    currentPwm: 75,
    liveTelemetry: {
      temp: 24.5,
      pressure: 1013.25,
      alt: 512.4,
      lat: 19.2433,
      lng: -103.7247
    },
    livePath: [],
    targetCoords: null,
    dbRecords: [
      { id: 'REC-1001', time: '2026-11-05 10:14:02', temp: 24.5, press: 1013.25, lat: 19.2433, lng: -103.7247, mode: 'AUTOMÁTICO' },
      { id: 'REC-1002', time: '2026-11-05 10:14:03', temp: 24.6, press: 1013.22, lat: 19.2435, lng: -103.7245, mode: 'AUTOMÁTICO' },
      { id: 'REC-1003', time: '2026-11-05 10:14:04', temp: 24.7, press: 1013.20, lat: 19.2438, lng: -103.7242, mode: 'AUTOMÁTICO' },
      { id: 'REC-1004', time: '2026-11-05 10:14:05', temp: 24.6, press: 1013.24, lat: 19.2440, lng: -103.7240, mode: 'MANUAL' },
      { id: 'REC-1005', time: '2026-11-05 10:14:06', temp: 24.8, press: 1013.18, lat: 19.2443, lng: -103.7238, mode: 'MANUAL' }
    ]
  };

  // Maps and Charts references
  let liveMap, liveMarker, livePolyline;
  let autoMap, autoTargetMarker;
  let sdMap, sdPolyline;
  let liveChart, sdChart;
  let liveInterval = null;

  // Configuración de Cliente MQTT para Mosquitto (Usa 'localhost' o la IP de tu PC en la red Wi-Fi)
  let mqttClient = null;
  const MOSQUITTO_BROKER_URL = 'ws://localhost:9001/mqtt'; 
  const MQTT_TOPIC_CMD = 'ucol/telematica/geostation/command';

  // Initializer
  document.addEventListener('DOMContentLoaded', () => {
    checkSavedSession();
    startClock();
    initJoystick();
    initKeyboardListeners();
  });

  // Session Management
  function checkSavedSession() {
    const saved = localStorage.getItem('geo_session');
    if (saved) {
      try {
        state.user = JSON.parse(saved);
        showMainApp();
      } catch (e) {
        localStorage.removeItem('geo_session');
      }
    }
  }

  function handleLogin() {
    const userIn = document.getElementById('username').value.trim();
    const roleIn = document.querySelector('input[name="authRole"]:checked').value;

    if (!userIn) return showToast('Ingrese un nombre de usuario', 'error');

    state.user = { username: userIn, role: roleIn };
    localStorage.setItem('geo_session', JSON.stringify(state.user));
    
    showToast(`Bienvenido ${userIn} (${roleIn.toUpperCase()})`, 'success');
    showMainApp();
  }

  function handleLogout() {
    state.user = null;
    localStorage.removeItem('geo_session');
    if (liveInterval) clearInterval(liveInterval);
    if (mqttClient) mqttClient.end();
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
    showToast('Sesión cerrada correctamente', 'info');
  }

  function showMainApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');

    document.getElementById('displayUsername').textContent = state.user.username;
    document.getElementById('displayRoleBadge').textContent = state.user.role.toUpperCase();
    document.getElementById('userAvatar').textContent = state.user.username.charAt(0).toUpperCase();

    if (state.user.role === 'user') {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    } else {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }

    renderDbTable();
    initMapsAndCharts();
    startLiveSimulation();
    initMosquittoMQTT();
  }

  // Conexión en vivo al Broker Mosquitto vía WebSockets
  function initMosquittoMQTT() {
    if (mqttClient) return;
    
    showToast('Conectando al broker Mosquitto...', 'info');
    
    mqttClient = mqtt.connect(MOSQUITTO_BROKER_URL, {
      clientId: `geostation_client_${Math.random().toString(16).substring(2, 8)}`,
      clean: true
    });

    mqttClient.on('connect', () => {
      showToast('Conectado exitosamente a Mosquitto MQTT', 'success');
      console.log('MQTT Connected to Mosquitto');
      const statusLbl = document.getElementById('mqttStatusLabel');
      if (statusLbl) {
        statusLbl.textContent = 'Mosquitto En Línea';
        statusLbl.className = 'text-xs font-semibold text-emerald-400 uppercase tracking-wider';
      }
      mqttClient.subscribe(MQTT_TOPIC_CMD, (err) => {
        if (!err) {
          console.log(`Suscrito al tópico: ${MQTT_TOPIC_CMD}`);
        }
      });
    });

    mqttClient.on('error', (err) => {
      console.error('Error de conexión con Mosquitto:', err);
      const statusLbl = document.getElementById('mqttStatusLabel');
      if (statusLbl) {
        statusLbl.textContent = 'MQTT Desconectado';
        statusLbl.className = 'text-xs font-semibold text-rose-400 uppercase tracking-wider';
      }
      showToast('Error de conexión con el broker Mosquitto', 'error');
    });

    mqttClient.on('message', (topic, payload) => {
      console.log(`Mensaje recibido en [${topic}]: ${payload.toString()}`);
    });
  }

  function startClock() {
    setInterval(() => {
      const now = new Date();
      document.getElementById('liveClock').textContent = now.toISOString().substring(11, 19) + ' UTC';
    }, 1000);
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    
    ['tab-inicio', 'tab-monitoreo', 'tab-base-datos', 'tab-control'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
      const navBtn = document.getElementById(`nav-${id}`);
      navBtn.classList.remove('text-emerald-400', 'bg-emerald-500/10', 'border', 'border-emerald-500/20');
      navBtn.classList.add('text-slate-400');
    });

    document.getElementById(tabId).classList.remove('hidden');
    const activeBtn = document.getElementById(`nav-${tabId}`);
    activeBtn.classList.add('text-emerald-400', 'bg-emerald-500/10', 'border', 'border-emerald-500/20');
    activeBtn.classList.remove('text-slate-400');

    const titles = {
      'tab-inicio': 'Inicio / Portada Institucional',
      'tab-monitoreo': 'Monitoreo Telemetría en Tiempo Real',
      'tab-base-datos': 'Análisis, Base de Datos & Datalogger SD',
      'tab-control': 'Gestión y Control Remoto (Dual)'
    };
    document.getElementById('currentTabTitle').textContent = titles[tabId];

    setTimeout(() => {
      if (tabId === 'tab-monitoreo' && liveMap) liveMap.invalidateSize();
      if (tabId === 'tab-control' && autoMap) autoMap.invalidateSize();
      if (tabId === 'tab-base-datos' && sdMap) sdMap.invalidateSize();
    }, 200);
  }

  function initMapsAndCharts() {
    const colimaCoords = [19.2433, -103.7247];

    if (!liveMap) {
      liveMap = L.map('liveMap').setView(colimaCoords, 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(liveMap);

      liveMarker = L.marker(colimaCoords).addTo(liveMap)
        .bindPopup('<b>Rover Telemetría ESP32</b><br>Estado: En Línea');
      livePolyline = L.polyline([], { color: '#10b981', weight: 4 }).addTo(liveMap);
    }

    if (!autoMap) {
      autoMap = L.map('autoMap').setView(colimaCoords, 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(autoMap);

      autoMap.on('click', (e) => {
        state.targetCoords = e.latlng;
        if (autoTargetMarker) autoMap.removeLayer(autoTargetMarker);
        autoTargetMarker = L.marker(e.latlng).addTo(autoMap)
          .bindPopup(`<b>Objetivo Fijado</b><br>Lat: ${e.latlng.lat.toFixed(5)}<br>Lng: ${e.latlng.lng.toFixed(5)}`).openPopup();
        
        document.getElementById('targetCoordsText').textContent = 
          `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        showToast('Waypoint seleccionado en mapa', 'info');
      });
    }

    if (!liveChart) {
      const ctx = document.getElementById('liveChart').getContext('2d');
      liveChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: [],
              borderColor: '#f43f5e',
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              yAxisID: 'yTemp',
              tension: 0.3
            },
            {
              label: 'Presión (hPa)',
              data: [],
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              yAxisID: 'yPress',
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
            yTemp: { type: 'linear', position: 'left', grid: { color: '#1e293b' }, ticks: { color: '#f43f5e' } },
            yPress: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#6366f1' } }
          },
          plugins: { legend: { labels: { color: '#cbd5e1' } } }
        }
      });
    }
  }

  function startLiveSimulation() {
    if (liveInterval) clearInterval(liveInterval);

    liveInterval = setInterval(() => {
      state.liveTelemetry.temp = +(state.liveTelemetry.temp + (Math.random() * 0.4 - 0.2)).toFixed(2);
      state.liveTelemetry.pressure = +(state.liveTelemetry.pressure + (Math.random() * 0.2 - 0.1)).toFixed(2);
      state.liveTelemetry.alt = +(44330 * (1 - Math.pow(state.liveTelemetry.pressure / 1013.25, 1 / 5.255))).toFixed(1);
      
      state.liveTelemetry.lat += (Math.random() * 0.0001 - 0.00005);
      state.liveTelemetry.lng += (Math.random() * 0.0001 - 0.00005);

      document.getElementById('metric-temp').textContent = state.liveTelemetry.temp;
      document.getElementById('metric-press').textContent = state.liveTelemetry.pressure;
      document.getElementById('metric-alt').textContent = state.liveTelemetry.alt;
      document.getElementById('metric-lat').textContent = state.liveTelemetry.lat.toFixed(5);
      document.getElementById('metric-lng').textContent = state.liveTelemetry.lng.toFixed(5);

      const newPos = [state.liveTelemetry.lat, state.liveTelemetry.lng];
      if (liveMarker) liveMarker.setLatLng(newPos);
      state.livePath.push(newPos);
      if (livePolyline) livePolyline.setLatLngs(state.livePath);

      const timeLabel = new Date().toLocaleTimeString();
      if (liveChart) {
        if (liveChart.data.labels.length > 15) {
          liveChart.data.labels.shift();
          liveChart.data.datasets[0].data.shift();
          liveChart.data.datasets[1].data.shift();
        }
        liveChart.data.labels.push(timeLabel);
        liveChart.data.datasets[0].data.push(state.liveTelemetry.temp);
        liveChart.data.datasets[1].data.push(state.liveTelemetry.pressure);
        liveChart.update('none');
      }
    }, 1500);
  }

  function recenterLiveMap() {
    if (liveMap && liveMarker) {
      liveMap.setView(liveMarker.getLatLng(), 17);
      showToast('Mapa centrado en robot', 'info');
    }
  }

  function renderDbTable(records = state.dbRecords) {
    const tbody = document.getElementById('dbTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    records.forEach(rec => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-950/50 transition';
      tr.innerHTML = `
        <td class="p-3 font-bold text-emerald-400">${rec.id}</td>
        <td class="p-3 text-slate-400">${rec.time}</td>
        <td class="p-3 text-white">${rec.temp} °C</td>
        <td class="p-3 text-white">${rec.press} hPa</td>
        <td class="p-3 text-slate-300">${rec.lat.toFixed(4)}, ${rec.lng.toFixed(4)}</td>
        <td class="p-3"><span class="px-2 py-0.5 text-[10px] rounded font-bold ${rec.mode === 'AUTOMÁTICO' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">${rec.mode}</span></td>
        <td class="p-3 text-right space-x-2">
          <button onclick="window.app.openEditModal('${rec.id}')" class="admin-only text-slate-400 hover:text-emerald-400 p-1"><i class="fa-solid fa-pen"></i></button>
          <button onclick="window.app.deleteRecord('${rec.id}')" class="admin-only text-slate-400 hover:text-rose-400 p-1"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (state.user && state.user.role === 'user') {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }

    const pagInfo = document.getElementById('dbPaginationInfo');
    if (pagInfo) pagInfo.textContent = `Mostrando ${records.length} de ${records.length} registros`;
  }

  function filterTable() {
    const q = document.getElementById('dbSearch').value.toLowerCase();
    const mode = document.getElementById('dbFilterMode').value;

    const filtered = state.dbRecords.filter(r => {
      const matchQ = r.id.toLowerCase().includes(q) || 
                     r.temp.toString().includes(q) || 
                     r.press.toString().includes(q);
      const matchMode = mode === 'ALL' || r.mode === mode;
      return matchQ && matchMode;
    });

    renderDbTable(filtered);
  }

  function openCreateModal() {
    document.getElementById('modalTitle').textContent = 'Crear Registro de Telemetría';
    document.getElementById('recordId').value = '';
    document.getElementById('inputTemp').value = state.liveTelemetry.temp;
    document.getElementById('inputPress').value = state.liveTelemetry.pressure;
    document.getElementById('crudModal').classList.remove('hidden');
  }

  function openEditModal(id) {
    const rec = state.dbRecords.find(r => r.id === id);
    if (!rec) return;

    document.getElementById('modalTitle').textContent = `Editar Registro ${id}`;
    document.getElementById('recordId').value = rec.id;
    document.getElementById('inputTemp').value = rec.temp;
    document.getElementById('inputPress').value = rec.press;
    document.getElementById('crudModal').classList.remove('hidden');
  }

  function closeCrudModal() {
    document.getElementById('crudModal').classList.add('hidden');
  }

  function saveCrudRecord() {
    const id = document.getElementById('recordId').value;
    const temp = parseFloat(document.getElementById('inputTemp').value);
    const press = parseFloat(document.getElementById('inputPress').value);

    if (id) {
      const rec = state.dbRecords.find(r => r.id === id);
      if (rec) {
        rec.temp = temp; rec.press = press;
        showToast(`Registro ${id} actualizado`, 'success');
      }
    } else {
      const newRec = {
        id: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
        time: new Date().toISOString().replace('T', ' ').substring(0, 19),
        temp, press, lat: state.liveTelemetry.lat, lng: state.liveTelemetry.lng, mode: 'MANUAL'
      };
      state.dbRecords.unshift(newRec);
      showToast('Nuevo registro añadido a la BD', 'success');
    }

    closeCrudModal();
    renderDbTable();
  }

  function deleteRecord(id) {
    if (state.user.role !== 'admin') {
      return showToast('Acción denegada: Privilegios insuficientes', 'error');
    }
    state.dbRecords = state.dbRecords.filter(r => r.id !== id);
    renderDbTable();
    showToast(`Registro ${id} eliminado`, 'info');
  }

  function exportData(type) {
    let content = '', filename = `telemetry_export.${type}`, mime = '';
    if (type === 'json') {
      content = JSON.stringify(state.dbRecords, null, 2);
      mime = 'application/json';
    } else {
      content = 'id,time,temp,press,lat,lng,mode\n' + 
        state.dbRecords.map(r => `${r.id},${r.time},${r.temp},${r.press},${r.lat},${r.lng},${r.mode}`).join('\n');
      mime = 'text/csv';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast(`Archivo ${type.toUpperCase()} exportado`, 'success');
  }

  function handleSDFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      parseAndRenderSDData(file.name, e.target.result);
    };
    reader.readAsText(file);
  }

  function parseAndRenderSDData(fileName, csvText) {
    const lines = csvText.trim().split('\n');
    const parsed = [];

    lines.forEach((line, idx) => {
      if (idx === 0 && line.toLowerCase().includes('temp')) return;
      const parts = line.split(',');
      if (parts.length >= 5) {
        parsed.push({
          time: parts[0] || `T-${idx}`,
          temp: parseFloat(parts[1]) || 24.0,
          press: parseFloat(parts[2]) || 1013.0,
          lat: parseFloat(parts[3]) || (19.2433 + (idx * 0.00005)),
          lng: parseFloat(parts[4]) || (-103.7247 + (idx * 0.00005))
        });
      }
    });

    if (parsed.length === 0) {
      return showToast('Archivo CSV inválido o vacío', 'error');
    }

    document.getElementById('sdAnalysisContainer').classList.remove('hidden');
    document.getElementById('sdFileName').textContent = fileName;
    document.getElementById('sdFileStats').textContent = `${parsed.length} Puntos procesados correctamente.`;

    setTimeout(() => {
      if (!sdMap) {
        sdMap = L.map('sdMap').setView([parsed[0].lat, parsed[0].lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(sdMap);
      }
      if (sdPolyline) sdMap.removeLayer(sdPolyline);

      const latlngs = parsed.map(p => [p.lat, p.lng]);
      sdPolyline = L.polyline(latlngs, { color: '#f59e0b', weight: 4 }).addTo(sdMap);
      sdMap.fitBounds(sdPolyline.getBounds());

      const ctx = document.getElementById('sdChart').getContext('2d');
      if (sdChart) sdChart.destroy();
      sdChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: parsed.map(p => p.time),
          datasets: [{
            label: 'Temperatura SD (°C)',
            data: parsed.map(p => p.temp),
            borderColor: '#f59e0b',
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#94a3b8' } },
            y: { ticks: { color: '#94a3b8' } }
          }
        }
      });
    }, 200);

    showToast('Bitácora MicroSD reconstruida exitosamente', 'success');
  }

  function setControlMode(mode) {
    state.controlMode = mode;
    const btnMan = document.getElementById('btnModeManual');
    const btnAuto = document.getElementById('btnModeAuto');
    const viewMan = document.getElementById('viewManualControl');
    const viewAuto = document.getElementById('viewAutoControl');

    if (mode === 'manual') {
      btnMan.className = 'px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 bg-emerald-600 text-white';
      btnAuto.className = 'px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 text-slate-400 hover:text-white';
      viewMan.classList.remove('hidden');
      viewAuto.classList.add('hidden');
    } else {
      btnAuto.className = 'px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 bg-emerald-600 text-white';
      btnMan.className = 'px-5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 text-slate-400 hover:text-white';
      viewAuto.classList.remove('hidden');
      viewMan.classList.add('hidden');
      setTimeout(() => { if (autoMap) autoMap.invalidateSize(); }, 200);
    }

    showToast(`Modo cambiado a: ${mode.toUpperCase()}`, 'info');
  }

  // Envío del comando por Mosquitto MQTT y registro simultáneo en SD / Base de Datos
  function sendDriveCommand(cmd) {
    if (!state.user || state.user.role !== 'admin') {
      return showToast('Acción denegada: Privilegio exclusivo de Administrador', 'error');
    }

    const payloadObj = {
      device: "ESP32_ROVER",
      command: cmd,
      pwm: state.currentPwm,
      timestamp: new Date().toISOString()
    };

    const payloadString = JSON.stringify(payloadObj);

    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(MQTT_TOPIC_CMD, payloadString, { qos: 0 }, (err) => {
        if (err) {
          showToast('Fallo al publicar el comando en Mosquitto', 'error');
          console.error(err);
        } else {
          showToast(`Mosquitto -> Comando [${cmd}] publicado`, 'success');
        }
      });
    } else {
      showToast('Mosquitto desconectado. Comando simulado', 'info');
      console.warn('MQTT Client not connected, payload simulated:', payloadString);
    }

    const newDbRecord = {
      id: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
      time: payloadObj.timestamp.replace('T', ' ').substring(0, 19),
      temp: state.liveTelemetry.temp,
      press: state.liveTelemetry.pressure,
      lat: state.liveTelemetry.lat,
      lng: state.liveTelemetry.lng,
      mode: `CMD_${cmd}`
    };

    state.dbRecords.unshift(newDbRecord);
    renderDbTable();
  }

  function updatePWM(val) {
    state.currentPwm = val;
    document.getElementById('pwmValue').textContent = `${val}%`;
  }

  function toggleActuator(type) {
    if (!state.user || state.user.role !== 'admin') {
      return showToast('Acción denegada: Privilegio exclusivo de Administrador', 'error');
    }
    showToast(`Actuador ${type.toUpperCase()} conmutado`, 'info');
  }

  function sendAutonomousMission() {
    if (!state.user || state.user.role !== 'admin') {
      return showToast('Acción denegada: Solo administradores pueden lanzar misiones', 'error');
    }
    if (!state.targetCoords) {
      return showToast('Por favor seleccione un punto de destino en el mapa', 'error');
    }
    showToast(`Misión Autónoma Iniciada -> Lat: ${state.targetCoords.lat.toFixed(5)}, Lng: ${state.targetCoords.lng.toFixed(5)}`, 'success');
  }

  function initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      if (!state.user || state.activeTab !== 'tab-control' || state.controlMode !== 'manual') return;

      const key = e.key.toUpperCase();
      if (['W', 'A', 'S', 'D', 'ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT'].includes(key)) {
        e.preventDefault();
      }

      if (key === 'W' || key === 'ARROWUP') {
        sendDriveCommand('FORWARD');
      } else if (key === 'S' || key === 'ARROWDOWN') {
        sendDriveCommand('BACKWARD');
      } else if (key === 'A' || key === 'ARROWLEFT') {
        sendDriveCommand('LEFT');
      } else if (key === 'D' || key === 'ARROWRIGHT') {
        sendDriveCommand('RIGHT');
      }
    });
  }

  function initJoystick() {
    const canvas = document.getElementById('joystickCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let dragging = false;
    const center = { x: canvas.width / 2, y: canvas.height / 2 };
    const maxRadius = 70;
    let stick = { x: center.x, y: center.y };

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.beginPath();
      ctx.arc(center.x, center.y, maxRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(stick.x, stick.y, 25, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    function moveStick(evt) {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

      const dx = clientX - rect.left - center.x;
      const dy = clientY - rect.top - center.y;
      const dist = Math.hypot(dx, dy);

      if (dist < maxRadius) {
        stick.x = center.x + dx;
        stick.y = center.y + dy;
      } else {
        const angle = Math.atan2(dy, dx);
        stick.x = center.x + Math.cos(angle) * maxRadius;
        stick.y = center.y + Math.sin(angle) * maxRadius;
      }

      draw();
    }

    function endStick() {
      dragging = false;
      stick = { x: center.x, y: center.y };
      draw();
    }

    canvas.addEventListener('mousedown', (e) => { dragging = true; moveStick(e); });
    window.addEventListener('mousemove', moveStick);
    window.addEventListener('mouseup', endStick);

    canvas.addEventListener('touchstart', (e) => { dragging = true; moveStick(e); });
    window.addEventListener('touchmove', moveStick);
    window.addEventListener('touchend', endStick);

    draw();
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-950 border-emerald-500/40 text-emerald-200',
      error: 'bg-rose-950 border-rose-500/40 text-rose-200',
      info: 'bg-slate-900 border-slate-700 text-slate-200'
    };

    const icons = {
      success: '<i class="fa-solid fa-circle-check text-emerald-400"></i>',
      error: '<i class="fa-solid fa-triangle-exclamation text-rose-400"></i>',
      info: '<i class="fa-solid fa-circle-info text-cyan-400"></i>'
    };

    toast.className = `toast-enter pointer-events-auto border rounded-xl px-4 py-3 text-xs font-medium shadow-xl flex items-center space-x-3 max-w-sm ${colors[type]}`;
    toast.innerHTML = `
      ${icons[type]}
      <span class="flex-1">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  window.app = {
    handleLogin,
    handleLogout,
    switchTab,
    recenterLiveMap,
    filterTable,
    openCreateModal,
    openEditModal,
    closeCrudModal,
    saveCrudRecord,
    deleteRecord,
    exportData,
    handleSDFileUpload,
    setControlMode,
    sendDriveCommand,
    updatePWM,
    toggleActuator,
    sendAutonomousMission
  };

})();