/**
 * Estación Geoespacial de Reconocimiento - Frontend SPA (Lógica Principal)
 * Universidad de Colima - Entornos Inteligentes
 */

(function () {
  'use strict';

  const state = {
    user: null,
    activeTab: 'tab-inicio',
    controlMode: 'manual',
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
      { id: 'REC-1002', time: '2026-11-05 10:14:03', temp: 24.6, press: 1013.22, lat: 19.2435, lng: -103.7245, mode: 'AUTOMÁTICO' }
    ]
  };

  let liveMap, liveMarker, livePolyline;
  let autoMap, autoTargetMarker;
  let sdMap, sdPolyline;
  let liveChart, sdChart;
  let liveInterval = null;

  document.addEventListener('DOMContentLoaded', () => {
    checkSavedSession();
    startClock();
    initJoystick();
    initKeyboardListeners();
  });

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
    
    // Inicializar el servicio MQTT externo si está disponible
    if (window.mqttService && typeof window.mqttService.init === 'function') {
      window.mqttService.init();
    }
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
      if (navBtn) {
        navBtn.classList.remove('text-emerald-400', 'bg-emerald-500/10', 'border', 'border-emerald-500/20');
        navBtn.classList.add('text-slate-400');
      }
    });

    document.getElementById(tabId).classList.remove('hidden');
    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
      activeBtn.classList.add('text-emerald-400', 'bg-emerald-500/10', 'border', 'border-emerald-500/20');
      activeBtn.classList.remove('text-slate-400');
    }

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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(liveMap);
      liveMarker = L.marker(colimaCoords).addTo(liveMap).bindPopup('<b>Rover ESP32</b>');
      livePolyline = L.polyline([], { color: '#10b981', weight: 4 }).addTo(liveMap);
    }

    if (!autoMap) {
      autoMap = L.map('autoMap').setView(colimaCoords, 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(autoMap);
      autoMap.on('click', (e) => {
        state.targetCoords = e.latlng;
        if (autoTargetMarker) autoMap.removeLayer(autoTargetMarker);
        autoTargetMarker = L.marker(e.latlng).addTo(autoMap).bindPopup('Destino Fijado').openPopup();
        showToast('Waypoint seleccionado', 'info');
      });
    }

    if (!liveChart) {
      const ctx = document.getElementById('liveChart').getContext('2d');
      liveChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Temp (°C)', data: [], borderColor: '#f43f5e', tension: 0.3 },
            { label: 'Presión (hPa)', data: [], borderColor: '#6366f1', tension: 0.3 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
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
    if (liveMap && liveMarker) liveMap.setView(liveMarker.getLatLng(), 17);
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
        <td class="p-3"><span class="px-2 py-0.5 text-[10px] rounded font-bold bg-amber-500/10 text-amber-400">${rec.mode}</span></td>
        <td class="p-3 text-right"><button onclick="window.app.deleteRecord('${rec.id}')" class="admin-only text-rose-400"><i class="fa-solid fa-trash"></i></button></td>
      `;
      tbody.appendChild(tr);
    });
    if (state.user && state.user.role === 'user') {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }
  }

  function filterTable() {
    const q = document.getElementById('dbSearch').value.toLowerCase();
    const mode = document.getElementById('dbFilterMode').value;
    const filtered = state.dbRecords.filter(r => (r.id.toLowerCase().includes(q) || r.temp.toString().includes(q)) && (mode === 'ALL' || r.mode === mode));
    renderDbTable(filtered);
  }

  // Función principal de movimiento que interactúa con la BD/SD y delega el envío a MQTT
  function sendDriveCommand(cmd) {
    if (!state.user || state.user.role !== 'admin') {
      return showToast('Acción denegada: Privilegios insuficientes', 'error');
    }

    const payload = {
      device: "ESP32_ROVER",
      command: cmd,
      pwm: state.currentPwm,
      timestamp: new Date().toISOString()
    };

    // 1. Delegar publicación al servicio MQTT independiente si está activo
    if (window.mqttService && typeof window.mqttService.publish === 'function') {
      window.mqttService.publish(payload);
    } else {
      showToast(`Comando [${cmd}] ejecutado (Modo local sin MQTT)`, 'success');
    }

    // 2. Registro automático en la BD simulada y Datalogger SD
    const newRec = {
      id: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
      time: payload.timestamp.replace('T', ' ').substring(0, 19),
      temp: state.liveTelemetry.temp,
      press: state.liveTelemetry.pressure,
      lat: state.liveTelemetry.lat,
      lng: state.liveTelemetry.lng,
      mode: `CMD_${cmd}`
    };
    state.dbRecords.unshift(newRec);
    renderDbTable();
  }

  function updatePWM(val) {
    state.currentPwm = val;
    document.getElementById('pwmValue').textContent = `${val}%`;
  }

  function initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      if (!state.user || state.activeTab !== 'tab-control' || state.controlMode !== 'manual') return;
      const key = e.key.toUpperCase();
      if (['W', 'A', 'S', 'D', 'ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT'].includes(key)) e.preventDefault();

      if (key === 'W' || key === 'ARROWUP') sendDriveCommand('FORWARD');
      else if (key === 'S' || key === 'ARROWDOWN') sendDriveCommand('BACKWARD');
      else if (key === 'A' || key === 'ARROWLEFT') sendDriveCommand('LEFT');
      else if (key === 'D' || key === 'ARROWRIGHT') sendDriveCommand('RIGHT');
    });
  }

  function initJoystick() {
    const canvas = document.getElementById('joystickCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let dragging = false;
    let lastCmd = null;
    const center = { x: canvas.width / 2, y: canvas.height / 2 };
    const maxRadius = 70;
    const deadzone = 0.35;
    let stick = { x: center.x, y: center.y };

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath(); ctx.arc(center.x, center.y, maxRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(stick.x, stick.y, 25, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981'; ctx.fill();
    }

    function emitJoystickCommand(normX, normY) {
      if (!state.user || state.activeTab !== 'tab-control' || state.controlMode !== 'manual') return;

      let cmd = null;
      if (Math.hypot(normX, normY) >= deadzone) {
        if (Math.abs(normY) >= Math.abs(normX)) {
          cmd = normY > 0 ? 'FORWARD' : 'BACKWARD';
        } else {
          cmd = normX > 0 ? 'RIGHT' : 'LEFT';
        }
      }

      if (cmd && cmd !== lastCmd) {
        lastCmd = cmd;
        sendDriveCommand(cmd);
      }
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

      const normX = +((stick.x - center.x) / maxRadius).toFixed(2);
      const normY = +(-(stick.y - center.y) / maxRadius).toFixed(2);
      const joyXEl = document.getElementById('joyX');
      const joyYEl = document.getElementById('joyY');
      if (joyXEl) joyXEl.textContent = normX;
      if (joyYEl) joyYEl.textContent = normY;

      emitJoystickCommand(normX, normY);
    }

    function endStick() {
      if (!dragging) return;
      dragging = false;
      stick = { x: center.x, y: center.y };
      draw();
      const joyXEl = document.getElementById('joyX');
      const joyYEl = document.getElementById('joyY');
      if (joyXEl) joyXEl.textContent = '0.00';
      if (joyYEl) joyYEl.textContent = '0.00';
      if (lastCmd) {
        lastCmd = null;
        sendDriveCommand('STOP');
      }
    }

    canvas.addEventListener('mousedown', (e) => { dragging = true; moveStick(e); });
    window.addEventListener('mousemove', moveStick);
    window.addEventListener('mouseup', endStick);

    canvas.addEventListener('touchstart', (e) => { dragging = true; moveStick(e); }, { passive: true });
    window.addEventListener('touchmove', moveStick, { passive: true });
    window.addEventListener('touchend', endStick);

    draw();
  }

  function handleSDFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const lines = e.target.result.trim().split('\n');
      const parsed = lines.slice(1).map(l => {
        const p = l.split(',');
        return { time: p[0], temp: parseFloat(p[1]), lat: parseFloat(p[3]), lng: parseFloat(p[4]) };
      });
      document.getElementById('sdAnalysisContainer').classList.remove('hidden');
      document.getElementById('sdFileName').textContent = file.name;
      document.getElementById('sdFileStats').textContent = `${parsed.length} puntos procesados`;
      
      setTimeout(() => {
        if (!sdMap) {
          sdMap = L.map('sdMap').setView([parsed[0].lat, parsed[0].lng], 16);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(sdMap);
        }
        if (sdPolyline) sdMap.removeLayer(sdPolyline);
        sdPolyline = L.polyline(parsed.map(p => [p.lat, p.lng]), { color: '#f59e0b', weight: 4 }).addTo(sdMap);
        sdMap.fitBounds(sdPolyline.getBounds());
      }, 200);
      showToast('MicroSD procesada con éxito', 'success');
    };
    reader.readAsText(file);
  }

  function exportData(type) {
    const content = type === 'json' ? JSON.stringify(state.dbRecords, null, 2) : 'id,time,temp,press,lat,lng,mode\n' + state.dbRecords.map(r => `${r.id},${r.time},${r.temp},${r.press},${r.lat},${r.lng},${r.mode}`).join('\n');
    const blob = new Blob([content], { type: type === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `telemetry.${type}`; a.click();
    showToast(`Exportado a ${type.toUpperCase()}`, 'success');
  }

  function deleteRecord(id) {
    if (state.user.role !== 'admin') return showToast('Acceso denegado', 'error');
    state.dbRecords = state.dbRecords.filter(r => r.id !== id);
    renderDbTable();
    showToast(`Registro ${id} eliminado`, 'info');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    const colors = { success: 'bg-emerald-950 border-emerald-500/40 text-emerald-200', error: 'bg-rose-950 border-rose-500/40 text-rose-200', info: 'bg-slate-900 border-slate-700 text-slate-200' };
    toast.className = `toast-enter pointer-events-auto border rounded-xl px-4 py-3 text-xs font-medium shadow-xl flex items-center space-x-3 max-w-sm ${colors[type]}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
  }

  window.app = {
    handleLogin, handleLogout, switchTab, recenterLiveMap, filterTable,
    openCreateModal: () => document.getElementById('crudModal').classList.remove('hidden'),
    closeCrudModal: () => document.getElementById('crudModal').classList.add('hidden'),
    saveCrudRecord: () => {
      state.dbRecords.unshift({
        id: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
        time: new Date().toISOString().replace('T', ' ').substring(0, 19),
        temp: parseFloat(document.getElementById('inputTemp').value),
        press: parseFloat(document.getElementById('inputPress').value),
        lat: state.liveTelemetry.lat, lng: state.liveTelemetry.lng, mode: 'MANUAL'
      });
      document.getElementById('crudModal').classList.add('hidden');
      renderDbTable();
      showToast('Creado con éxito', 'success');
    },
    deleteRecord, exportData, handleSDFileUpload,
    setControlMode: (m) => { state.controlMode = m; showToast(`Modo ${m}`, 'info'); },
    sendDriveCommand, updatePWM,
    sendAutonomousMission: () => showToast('Misión autónoma enviada al rover', 'success')
  };

})();