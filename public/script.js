// 🔐 בדוק תוקף ואבטחה
const token = localStorage.getItem('authToken');

if (!token) {
  window.location.href = '/login.html';
}

let currentPhoneList = [];
let currentRideId = null;
let currentGroupId = null;
let isDarkMode = localStorage.getItem('darkMode') === 'true';

// טעינת Dark Mode
if (isDarkMode) {
  applyDarkMode();
}

// 🌙 Toggle Dark Mode
function toggleDarkMode() {
  isDarkMode = !isDarkMode;
  localStorage.setItem('darkMode', isDarkMode);
  if (isDarkMode) {
    applyDarkMode();
  } else {
    removeDarkMode();
  }
}

function applyDarkMode() {
  document.body.classList.add('dark-mode');
  document.querySelectorAll('input, select, textarea').forEach(el => {
    el.classList.add('dark-mode');
  });
  document.querySelectorAll('.card, .stat-card, .table-container, .modal-content').forEach(el => {
    el.classList.add('dark-mode');
  });
}

function removeDarkMode() {
  document.body.classList.remove('dark-mode');
  document.querySelectorAll('input, select, textarea').forEach(el => {
    el.classList.remove('dark-mode');
  });
  document.querySelectorAll('.card, .stat-card, .table-container, .modal-content').forEach(el => {
    el.classList.remove('dark-mode');
  });
}

// 🚪 התנתקות
async function logout() {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
  } catch (err) {
    console.error('❌ שגיאה:', err);
  }
}

// 📑 Tab Navigation
function showTab(tabName) {
  // הסתר את כל ה-tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // הסר את ה-active מ-buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('active');
  });

  // הצג את הTab הנבחר
  document.getElementById(tabName).classList.add('active');

  // סמן את הbutton
  event.target.classList.add('active');

  // טעין נתונים
  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'rides') loadRides();
  if (tabName === 'drivers') loadDrivers();
  if (tabName === 'groups') loadGroups();
  if (tabName === 'admin') loadAdminContact();
}

// 📊 Dashboard
async function loadDashboard() {
  try {
    const response = await fetch('/api/statistics', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת סטטיסטיקה', 'error');
      return;
    }

    const stats = data.statistics;

    // צור קארטים
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">🚖</div>
        <div class="stat-label">נסיעות כוללות</div>
        <div class="stat-value">${stats.totalRides}</div>
      </div>
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">✅</div>
        <div class="stat-label">הסתיימו</div>
        <div class="stat-value">${stats.completedRides}</div>
      </div>
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">📊</div>
        <div class="stat-label">שיעור השלמה</div>
        <div class="stat-value">${stats.completionRate}</div>
      </div>
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">👨‍💼</div>
        <div class="stat-label">נהגים פעילים</div>
        <div class="stat-value">${stats.activeDrivers}</div>
      </div>
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">🚫</div>
        <div class="stat-label">נהגים חסומים</div>
        <div class="stat-value">${stats.blockedDrivers}</div>
      </div>
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">💰</div>
        <div class="stat-label">הרווח הכוללי</div>
        <div class="stat-value">₪${stats.totalEarnings}</div>
      </div>
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">💼</div>
        <div class="stat-label">עמלות</div>
        <div class="stat-value">₪${stats.totalCommission}</div>
      </div>
      <div class="stat-card ${isDarkMode ? 'dark-mode' : ''}">
        <div class="stat-icon">👥</div>
        <div class="stat-label">קבוצות WhatsApp</div>
        <div class="stat-value">${stats.totalGroups}</div>
      </div>
    `;

    // גרפים
    drawCharts(stats);
  } catch (err) {
    console.error('❌ שגיאה בDashboard:', err);
    showToast('שגיאה בטעינת Dashboard', 'error');
  }
}

function drawCharts(stats) {
  // נסיעות לפי סוג
  const rideTypeData = stats.ridesByType || [];
  const ctx1 = document.getElementById('rideTypeChart');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: rideTypeData.map(d => translateRideType(d._id)),
        datasets: [{
          data: rideTypeData.map(d => d.count),
          backgroundColor: ['#3498db', '#9b59b6', '#e74c3c']
        }]
      }
    });
  }

  // הרווחים
  const ctx2 = document.getElementById('earningsChart');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['הרווח הכוללי', 'עמלות'],
        datasets: [{
          label: 'סכום (₪)',
          data: [stats.totalEarnings, stats.totalCommission],
          backgroundColor: ['#27ae60', '#e74c3c']
        }]
      }
    });
  }
}

function translateRideType(type) {
  const types = {
    'regular': '🚖 רגילה',
    'vip': '👑 VIP',
    'delivery': '📦 משלוח'
  };
  return types[type] || type;
}

// 🚖 Rides
async function loadRides() {
  try {
    // טען קבוצות לה-dropdown
    const groupsRes = await fetch('/api/groups', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const groupsData = await groupsRes.json();
    const groupSelect = document.getElementById('sendToGroup');
    if (groupsData.ok) {
      groupSelect.innerHTML = '<option value="">בחר קבוצה...</option>' +
        groupsData.groups.map(g => `<option value="${g._id}">${g.name} (${g.membersCount})</option>`).join('');
    }

    // טען נסיעות
    const search = document.getElementById('rideSearch')?.value || '';
    const status = document.getElementById('rideStatusFilter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    params.append('limit', 100);

    const response = await fetch(`/api/rides?${params}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת נסיעות', 'error');
      return;
    }

    const tbody = document.getElementById('ridesTable');
    if (data.rides.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">אין נסיעות</td></tr>';
      return;
    }

    tbody.innerHTML = data.rides.map(ride => `
      <tr>
        <td>${ride.rideNumber || '#---'}</td>
        <td>${ride.customerName}</td>
        <td>${ride.pickup.substring(0, 15)} → ${ride.destination.substring(0, 15)}</td>
        <td>${translateRideType(ride.rideType)}</td>
        <td>₪${ride.price}</td>
        <td>${ride.driverPhone || '---'}</td>
        <td><span class="status-badge status-${ride.status}">${translateStatus(ride.status)}</span></td>
        <td>
          <button class="btn btn-small btn-primary" onclick="showRideDetails('${ride._id}')">👁️</button>
          <button class="btn btn-small btn-success" onclick="updateRideStatus('${ride._id}')">📝</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בטעינת נסיעות', 'error');
  }
}

async function loadGroups() {
  try {
    const response = await fetch('/api/groups', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת קבוצות', 'error');
      return;
    }

    const tbody = document.getElementById('groupsTable');
    if (data.groups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">אין קבוצות</td></tr>';
      return;
    }

    tbody.innerHTML = data.groups.map(group => `
      <tr>
        <td>${group.name}</td>
        <td>${group.description || '---'}</td>
        <td>${group.membersCount}</td>
        <td><span class="status-badge ${group.isActive ? 'status-approved' : 'status-cancelled'}">${group.isActive ? '✅ פעיל' : '❌ לא פעיל'}</span></td>
        <td>
          <button class="btn btn-small btn-primary" onclick="editGroup('${group._id}')">✏️</button>
          <button class="btn btn-small btn-danger" onclick="deleteGroup('${group._id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בטעינת קבוצות', 'error');
  }
}

// 👨‍💼 Drivers
async function loadDrivers() {
  try {
    const response = await fetch('/api/drivers', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת נהגים', 'error');
      return;
    }

    const tbody = document.getElementById('driversTable');
    if (data.drivers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">אין נהגים</td></tr>';
      return;
    }

    tbody.innerHTML = data.drivers.map(driver => {
      const stars = '⭐'.repeat(Math.round(driver.rating));
      return `
        <tr style="${driver.isBlocked ? 'opacity: 0.6;' : ''}">
          <td>${driver.name}</td>
          <td>${driver.phone}</td>
          <td>${stars} ${driver.rating}</td>
          <td>${driver.totalRides}</td>
          <td>₪${driver.totalEarnings}</td>
          <td>
            <span class="status-badge ${driver.isBlocked ? 'status-cancelled' : 'status-approved'}">
              ${driver.isBlocked ? '🚫 חסום' : '✅ פעיל'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 5px; flex-wrap: wrap;">
              ${driver.isBlocked ? 
                `<button class="btn btn-small btn-success" onclick="unblockDriver('${driver._id}')">🔓 שחרר</button>` :
                `<button class="btn btn-small btn-danger" onclick="promptBlockDriver('${driver._id}', '${driver.name}')">🚫 חסום</button>`
              }
              <button class="btn btn-small btn-danger" onclick="deleteDriver('${driver._id}', '${driver.name}')">🗑️ מחק</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בטעינת נהגים', 'error');
  }
}

// 📝 Ride Form
document.getElementById('rideForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const customerName = document.getElementById('customerName').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();
  const pickup = document.getElementById('pickup').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const price = parseFloat(document.getElementById('price').value);
  const commissionRate = (parseFloat(document.getElementById('commissionRate').value) || 10) / 100;
  const rideType = document.getElementById('rideType').value;
  const sendToGroup = document.getElementById('sendToGroup').value;
  const sendTo = document.getElementById('sendTo').value.split(',').map(s => s.trim()).filter(s => s.length > 0);

  if (!customerName || !customerPhone || !pickup || !destination || !price) {
    showToast('אנא מלא את כל השדות החובה', 'warning');
    return;
  }

  const statusDiv = document.getElementById('sendStatus');
  statusDiv.innerHTML = '<div class="toast info">⏳ שולח נסיעה...</div>';

  try {
    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        customerName,
        customerPhone,
        pickup,
        destination,
        price,
        commissionRate,
        rideType,
        sendToGroup,
        sendTo
      })
    });

    const result = await response.json();

    if (result.ok) {
      showToast('✅ נסיעה נשלחה בהצלחה!', 'success');
      document.getElementById('rideForm').reset();
      statusDiv.innerHTML = '';
      loadRides();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בשליחת נסיעה', 'error');
  }
});

// 📝 Group Form
document.getElementById('groupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('groupName').value.trim();
  const description = document.getElementById('groupDescription').value.trim();

  if (!name || currentPhoneList.length === 0) {
    showToast('אנא מלא שם וטלפונים', 'warning');
    return;
  }

  try {
    const response = await fetch('/api/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        name,
        description,
        phoneNumbers: currentPhoneList
      })
    });

    const result = await response.json();

    if (result.ok) {
      showToast('✅ קבוצה נוצרה בהצלחה!', 'success');
      document.getElementById('groupForm').reset();
      currentPhoneList = [];
      document.getElementById('phoneList').innerHTML = '';
      loadGroups();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה ביצירת קבוצה', 'error');
  }
});

// ➕ הוסף טלפון לרשימה
function addPhoneToList() {
  const phone = document.getElementById('newPhone').value.trim();
  if (!phone) {
    showToast('אנא הזן טלפון', 'warning');
    return;
  }

  if (currentPhoneList.includes(phone)) {
    showToast('הטלפון כבר ברשימה', 'warning');
    return;
  }

  currentPhoneList.push(phone);
  document.getElementById('newPhone').value = '';
  renderPhoneList();
}

function renderPhoneList() {
  const phoneList = document.getElementById('phoneList');
  phoneList.innerHTML = currentPhoneList.map(phone => `
    <div class="phone-tag">
      ${phone}
      <button type="button" onclick="removePhone('${phone}')">×</button>
    </div>
  `).join('');
}

function removePhone(phone) {
  currentPhoneList = currentPhoneList.filter(p => p !== phone);
  renderPhoneList();
}

// ⚙️ Admin Contact
document.getElementById('adminForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const adminName = document.getElementById('adminName').value.trim();
  const adminPhone = document.getElementById('adminPhone').value.trim();
  const adminEmail = document.getElementById('adminEmail').value.trim();
  const appealMessage = document.getElementById('appealMessage').value.trim();

  try {
    const response = await fetch('/api/admin-contact', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        adminName,
        adminPhone,
        adminEmail,
        appealMessage
      })
    });

    const result = await response.json();

    if (result.ok) {
      showToast('✅ פרטים שמורים!', 'success');
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בשמירת פרטים', 'error');
  }
});

// טעינת פרטי אדמין
async function loadAdminContact() {
  try {
    const response = await fetch('/api/admin-contact', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (data.ok) {
      document.getElementById('adminName').value = data.contact.adminName || '';
      document.getElementById('adminPhone').value = data.contact.adminPhone || '';
      document.getElementById('adminEmail').value = data.contact.adminEmail || '';
      document.getElementById('appealMessage').value = data.contact.appealMessage || '';
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
  }
}

// 🚫 חסום נהג
async function promptBlockDriver(driverId, driverName) {
  const reason = prompt(`הזן סיבה לחסימת ${driverName}:`);
  if (!reason) return;

  try {
    const response = await fetch(`/api/drivers/${driverId}/block`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ reason })
    });

    const result = await response.json();

    if (result.ok) {
      showToast(`✅ ${driverName} חסום!`, 'success');
      loadDrivers();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בחסימה', 'error');
  }
}

// 🔓 שחרר נהג
async function unblockDriver(driverId) {
  try {
    const response = await fetch(`/api/drivers/${driverId}/unblock`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    const result = await response.json();

    if (result.ok) {
      showToast('✅ נהג שוחרר!', 'success');
      loadDrivers();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בשחרור', 'error');
  }
}

// ➕ הוסף נהג חדש
async function openAddDriverModal() {
  const driverName = prompt('הזן שם הנהג:');
  if (!driverName) return;

  const driverPhone = prompt('הזן מספר טלפון (לדוגמה: 0501234567):');
  if (!driverPhone) return;

  try {
    const response = await fetch('/api/drivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        name: driverName,
        phone: driverPhone
      })
    });

    const result = await response.json();

    if (result.ok) {
      showToast(`✅ נהג "${driverName}" הוסף בהצלחה!`, 'success');
      loadDrivers();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בהוספת נהג', 'error');
  }
}

// 🗑️ מחק נהג
async function deleteDriver(driverId, driverName) {
  if (!confirm(`האם אתה בטוח שתרצה למחוק את ${driverName}?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/drivers/${driverId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    const result = await response.json();

    if (result.ok) {
      showToast(`✅ נהג "${driverName}" נמחק בהצלחה!`, 'success');
      loadDrivers();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה במחיקת נהג', 'error');
  }
}

// 👁️ הצג פרטי נסיעה
async function showRideDetails(rideId) {
  try {
    const response = await fetch(`/api/rides?limit=1000`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();
    const ride = data.rides.find(r => r._id === rideId);

    if (!ride) {
      showToast('נסיעה לא נמצאה', 'error');
      return;
    }

    const statusOptions = ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled"];
    
    const content = `
      <div class="ride-details">
        <div class="detail-row">
          <div class="detail-label">מספר סידורי</div>
          <div class="detail-value">${ride.rideNumber || '#---'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">שם לקוח</div>
          <div class="detail-value">${ride.customerName}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">טלפון לקוח</div>
          <div class="detail-value">${ride.customerPhone}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">מיקום איסוף</div>
          <div class="detail-value">${ride.pickup}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">יעד</div>
          <div class="detail-value">${ride.destination}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">מחיר</div>
          <div class="detail-value">₪${ride.price}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">עמלה</div>
          <div class="detail-value">₪${ride.commissionAmount}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">סוג נסיעה</div>
          <div class="detail-value">${translateRideType(ride.rideType)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">נהג</div>
          <div class="detail-value">${ride.driverPhone || '---'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">סטטוס</div>
          <div class="detail-value"><span class="status-badge status-${ride.status}">${translateStatus(ride.status)}</span></div>
        </div>
      </div>

      <div style="margin-top: 20px;">
        <h4>📝 היסטוריה</h4>
        <div class="history-list">
          ${ride.history.map(h => `
            <div class="history-item ${isDarkMode ? 'dark-mode' : ''}">
              <div class="history-icon">📌</div>
              <div class="history-content">
                <strong>${translateStatus(h.status)}</strong> - ${h.by} (${new Date(h.timestamp).toLocaleString('he-IL')})
                ${h.details ? `<br>${h.details}` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-top: 20px;">
        <label>🔄 שנה סטטוס:</label>
        <select id="newStatus">
          ${statusOptions.map(s => `<option value="${s}" ${s === ride.status ? 'selected' : ''}>${translateStatus(s)}</option>`).join('')}
        </select>
        <button class="btn btn-success" style="margin-top: 10px; width: 100%;" onclick="updateRideStatus('${rideId}')">💾 עדכן</button>
      </div>
    `;

    document.getElementById('rideDetailsContent').innerHTML = content;
    document.getElementById('rideModal').classList.add('active');
    currentRideId = rideId;
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בטעינת פרטים', 'error');
  }
}

// 📝 עדכן סטטוס נסיעה
async function updateRideStatus(rideId) {
  const status = document.getElementById('newStatus')?.value;

  if (!status) {
    showToast('בחר סטטוס', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/rides/${rideId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ status })
    });

    const result = await response.json();

    if (result.ok) {
      showToast('✅ סטטוס עודכן!', 'success');
      closeModal('rideModal');
      loadRides();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בעדכון', 'error');
  }
}

// 📥 ייצוא ל-Excel
function exportRidesToCSV() {
  const table = document.getElementById('ridesTable');
  if (!table.rows.length) {
    showToast('אין נתונים לייצוא', 'warning');
    return;
  }

  let csv = 'מספר,לקוח,מ,עד,סוג,מחיר,עמלה,נהג,סטטוס\n';
  
  for (let row of table.rows) {
    const cells = [];
    for (let cell of row.cells) {
      cells.push('"' + cell.textContent + '"');
    }
    csv += cells.join(',') + '\n';
  }

  const link = document.createElement('a');
  link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  link.download = `rides-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showToast('✅ ייצוא הסתיים!', 'success');
}

// 🗑️ מחק קבוצה
async function deleteGroup(groupId) {
  if (!confirm('בטוח שברצונך למחוק קבוצה זו?')) return;

  try {
    const response = await fetch(`/api/groups/${groupId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const result = await response.json();

    if (result.ok) {
      showToast('✅ קבוצה נמחקה!', 'success');
      loadGroups();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה במחיקה', 'error');
  }
}

// ✏️ ערוך קבוצה
async function editGroup(groupId) {
  try {
    const response = await fetch(`/api/groups`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();
    const group = data.groups.find(g => g._id === groupId);

    if (!group) {
      showToast('קבוצה לא נמצאה', 'error');
      return;
    }

    const content = `
      <div class="form-group">
        <label>שם הקבוצה</label>
        <input type="text" id="editGroupName" value="${group.name}" required>
      </div>
      <div class="form-group">
        <label>תיאור</label>
        <input type="text" id="editGroupDesc" value="${group.description || ''}">
      </div>
      <div class="form-group">
        <label>הוסף טלפון חדש</label>
        <div class="phone-input-group">
          <input type="tel" id="addNewPhone" placeholder="05012345678">
          <button type="button" class="btn btn-primary btn-small" onclick="addPhoneToGroup('${groupId}')">➕</button>
        </div>
      </div>
      <div class="form-group">
        <label>טלפונים בקבוצה</label>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${group.phoneNumbers.map(phone => `
            <div class="phone-tag">
              ${phone}
              <button type="button" onclick="removePhoneFromGroup('${groupId}', '${phone}')">×</button>
            </div>
          `).join('')}
        </div>
      </div>
      <button class="btn btn-success" style="width: 100%; margin-top: 20px;" onclick="saveGroupChanges('${groupId}')">💾 שמור</button>
    `;

    document.getElementById('groupDetailsContent').innerHTML = content;
    document.getElementById('groupModal').classList.add('active');
    currentGroupId = groupId;
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בטעינת קבוצה', 'error');
  }
}

// ➕ הוסף טלפון לקבוצה
async function addPhoneToGroup(groupId) {
  const phone = document.getElementById('addNewPhone').value.trim();
  if (!phone) return;

  try {
    const response = await fetch(`/api/groups/${groupId}/add-phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ phone })
    });

    const result = await response.json();

    if (result.ok) {
      editGroup(groupId);
      showToast('✅ טלפון נוסף!', 'success');
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בהוספה', 'error');
  }
}

// ➖ הסר טלפון מקבוצה
async function removePhoneFromGroup(groupId, phone) {
  try {
    const response = await fetch(`/api/groups/${groupId}/remove-phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ phone })
    });

    const result = await response.json();

    if (result.ok) {
      editGroup(groupId);
      showToast('✅ טלפון הוסר!', 'success');
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בהסרה', 'error');
  }
}

// 💾 שמור שינויים בקבוצה
async function saveGroupChanges(groupId) {
  const name = document.getElementById('editGroupName')?.value.trim();
  const description = document.getElementById('editGroupDesc')?.value.trim();

  if (!name) {
    showToast('שם קבוצה נדרש', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/groups/${groupId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ name, description })
    });

    const result = await response.json();

    if (result.ok) {
      showToast('✅ שינויים שמורים!', 'success');
      closeModal('groupModal');
      loadGroups();
    } else {
      showToast('❌ ' + result.error, 'error');
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    showToast('שגיאה בשמירה', 'error');
  }
}

// 🔄 Modal
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// 🔔 Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// 🔤 Status Translation
function translateStatus(status) {
  const statuses = {
    'created': '✏️ נוצרה',
    'sent': '📤 נשלחה',
    'approved': '✅ אושרה',
    'enroute': '🚗 בדרך',
    'arrived': '📍 הגיעה',
    'finished': '🎉 הסתיימה',
    'commission_paid': '💰 עמלה שולמה',
    'cancelled': '❌ בוטלה'
  };
  return statuses[status] || status;
}

// 🔄 Auto-refresh כל 30 שניות
setInterval(() => {
  if (document.getElementById('dashboard').classList.contains('active')) {
    loadDashboard();
  }
}, 30000);

// טעינה ראשונית
window.addEventListener('load', () => {
  loadDashboard();
});

// ============================================
// ACTIVITY LOGGING SYSTEM (תוספת חדשה)
// ============================================

let activities = [];

async function loadActivities() {
  try {
    const response = await fetch('/api/activities');
    if (response.ok) {
      activities = await response.json();
      displayActivities();
    }
  } catch (error) {
    console.error('שגיאה בטעינת פעילויות:', error);
    showToast('❌ שגיאה בטעינת פעילויות', 'error');
  }
}

function displayActivities() {
  const container = document.getElementById('activitiesContainer');
  const searchTerm = document.getElementById('activitySearch')?.value.toLowerCase() || '';
  const filter = document.getElementById('activityFilter')?.value || '';

  let filteredActivities = activities.filter(activity => {
    const matchSearch = activity.message.toLowerCase().includes(searchTerm);
    const matchFilter = !filter || activity.type === filter;
    return matchSearch && matchFilter;
  });

  if (filteredActivities.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px;">📭 אין פעילויות</div>';
    return;
  }

  container.innerHTML = filteredActivities.map(activity => `
    <div style="padding: 15px; border-left: 4px solid #3498db; background-color: #f8f9fa; margin-bottom: 10px; border-radius: 4px; display: grid; grid-template-columns: 80px 1fr 200px; gap: 15px; align-items: center;">
      <div style="font-size: 12px; color: #7f8c8d; font-weight: 600;">
        🕐 ${new Date(activity.timestamp).toLocaleTimeString('he-IL')}
      </div>
      <div style="font-size: 14px; color: #555;">
        ${activity.emoji} ${activity.message}
        ${activity.details ? `<br><small style="color: #7f8c8d;">${activity.details}</small>` : ''}
      </div>
      <div style="font-size: 12px; padding: 4px 10px; border-radius: 20px; text-align: center; font-weight: 600; background-color: #e8f4f8; color: #2980b9;">
        ${activity.type.toUpperCase()}
      </div>
    </div>
  `).join('');
}

async function clearActivities() {
  if (confirm('האם אתה בטוח שברצונך לנקות את כל ההרשומה?')) {
    try {
      const response = await fetch('/api/activities', { method: 'DELETE' });
      if (response.ok) {
        activities = [];
        displayActivities();
        showToast('✅ הרשומה נוקתה בהצלחה', 'success');
      }
    } catch (error) {
      console.error('שגיאה:', error);
      showToast('❌ שגיאה בניקוי הרשומה', 'error');
    }
  }
}

// ============================================
// DEFAULT GROUP MANAGEMENT (תוספת חדשה)
// ============================================

async function loadDefaultGroupForForm() {
  try {
    const response = await fetch('/api/admin/default-group');
    if (response.ok) {
      const data = await response.json();
      const groupSelect = document.getElementById('sendToGroup');
      
      if (data.groupId && groupSelect) {
        groupSelect.value = data.groupId;
      }
    }
  } catch (error) {
    console.error('שגיאה בטעינת ברירת מחדל:', error);
  }
}

async function setDefaultGroup(groupId) {
  try {
    const response = await fetch('/api/admin/default-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId })
    });
    
    if (response.ok) {
      await loadDefaultGroupForForm();
      await loadGroups();
      showToast('✅ ברירת מחדל עודכנה בהצלחה', 'success');
    }
  } catch (error) {
    console.error('שגיאה:', error);
    showToast('❌ שגיאה בהגדרת ברירת מחדל', 'error');
  }
}

// Search filters
document.getElementById('activitySearch')?.addEventListener('input', displayActivities);
document.getElementById('activityFilter')?.addEventListener('change', displayActivities);

// Load activities on page load
window.addEventListener('load', () => {
  loadActivities();
  loadDefaultGroupForForm();
});

// Auto-refresh activities every 30 seconds
setInterval(loadActivities, 30000);