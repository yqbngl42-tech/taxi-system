// 🔐 בדוק תוקף ואבטחה
const token = localStorage.getItem('authToken');
console.log("Token בזיכרון:", token ? "✅ יש" : "❌ אין");

if (!token) {
  window.location.href = '/login.html';
}

// 🚪 התנתקות
function logout() {
  localStorage.removeItem('authToken');
  window.location.href = '/login.html';
}

// יצור נסיעה
async function sendRide() {
  const customerName = document.getElementById('customerName').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();
  const pickup = document.getElementById('pickup').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const scheduledTime = document.getElementById('scheduledTime').value.trim();
  const price = parseFloat(document.getElementById('price').value) || 0;
  const commissionRate = (parseFloat(document.getElementById('commissionRate').value) || 10) / 100;
  const sendToRaw = document.getElementById('sendTo').value.trim();
  const rideType = document.getElementById('rideType').value;
  const specialNotesRaw = document.getElementById('specialNotes').value;
  const specialNotes = specialNotesRaw ? specialNotesRaw.split(',').map(s => s.trim()).filter(s => s) : [];

  console.log("שולח נסיעה:", { customerName, pickup, destination });

  if (!customerName || !customerPhone || !pickup || !destination) {
    alert('❌ אנא מלא את כל השדות הנדרשים');
    return;
  }

  const sendTo = sendToRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);

  if (sendTo.length === 0) {
    alert('❌ אנא הזן לפחות טלפון אחד של נהג');
    return;
  }

  const formattedPhones = sendTo.map(phone => {
    if (!phone.startsWith('whatsapp:+')) {
      return 'whatsapp:+' + phone;
    }
    return phone;
  });

  const data = {
    customerName,
    customerPhone,
    pickup,
    destination,
    scheduledTime,
    price,
    commissionRate,
    sendTo: formattedPhones,
    rideType,
    specialNotes
  };

  const statusDiv = document.getElementById('sendStatus');
  statusDiv.innerHTML = '<div class="status">⏳ שולח...</div>';

  try {
    console.log("קריאה ל-API עם token:", token.substring(0, 20) + "...");

    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(data)
    });

    console.log("סטטוס תשובה:", response.status);

    const result = await response.json();

    console.log("תוצאה מהשרת:", result);

    if (result.ok) {
      statusDiv.innerHTML = '<div class="status success">✅ נסיעה נשלחה בהצלחה!</div>';
      
      document.getElementById('customerName').value = '';
      document.getElementById('customerPhone').value = '';
      document.getElementById('pickup').value = '';
      document.getElementById('destination').value = '';
      document.getElementById('scheduledTime').value = '';
      document.getElementById('specialNotes').value = '';
      document.getElementById('sendTo').value = '';
      
      setTimeout(() => {
        loadRides();
        statusDiv.innerHTML = '';
      }, 2000);
    } else {
      statusDiv.innerHTML = `<div class="status error">❌ שגיאה: ${result.error}</div>`;
    }
  } catch (err) {
    console.error('❌ שגיאה:', err);
    statusDiv.innerHTML = `<div class="status error">❌ שגיאה בתקשורת</div>`;
  }
}

// טעינת נסיעות
async function loadRides() {
  try {
    const response = await fetch('/api/rides', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('authToken');
      window.location.href = '/login.html';
      return;
    }

    const rides = await response.json();

    updateStatistics(rides);

    const tbody = document.getElementById('ridesBody');
    
    if (rides.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">אין נסיעות עדיין</td></tr>';
      return;
    }

    let html = '';
    rides.forEach(ride => {
      const statusClass = `status-${ride.status}`;
      
      html += `
        <tr>
          <td>${ride._id.substring(0, 8)}...</td>
          <td>${ride.customerName}</td>
          <td>${ride.pickup.substring(0, 15)}</td>
          <td>${ride.destination.substring(0, 15)}</td>
          <td>${ride.rideType === 'vip' ? '👑 VIP' : ride.rideType === 'delivery' ? '📦 משלוח' : '🚖 רגילה'}</td>
          <td>${ride.driverPhone ? ride.driverPhone.substring(-10) : '---'}</td>
          <td><span class="status-badge ${statusClass}">${translateStatus(ride.status)}</span></td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error('❌ שגיאה בטעינה:', err);
  }
}

// טעינת נהגים
async function loadDrivers() {
  try {
    const response = await fetch('/api/drivers', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    const drivers = await response.json();

    const tbody = document.getElementById('driversBody');
    
    if (drivers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">אין נהגים</td></tr>';
      return;
    }

    let html = '';
    drivers.forEach(driver => {
      const stars = '⭐'.repeat(Math.round(driver.rating));
      const statusClass = driver.isBlocked ? 'blocked' : '';
      
      html += `
        <tr class="${statusClass}">
          <td>${driver.name}</td>
          <td>${driver.phone}</td>
          <td class="rating">${stars} ${driver.rating}</td>
          <td>${driver.totalRides}</td>
          <td>₪${driver.totalEarnings}</td>
          <td>${driver.isBlocked ? '🚫 חסום' : '✅ פעיל'}</td>
          <td>
            <div class="action-buttons">
              ${driver.isBlocked ? 
                `<button onclick="unblockDriver('${driver._id}')">הסר חסימה</button>` :
                `<button onclick="blockDriver('${driver._id}')">חסום</button>`
              }
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error('❌ שגיאה:', err);
  }
}

// טעינת נהגים חסומים
async function loadBlockedDrivers() {
  try {
    const response = await fetch('/api/drivers', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    const drivers = await response.json();
    const blocked = drivers.filter(d => d.isBlocked);

    const tbody = document.getElementById('blockedBody');
    
    if (blocked.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">אין נהגים חסומים</td></tr>';
      return;
    }

    let html = '';
    blocked.forEach(driver => {
      const blockedDate = new Date(driver.blockedAt).toLocaleDateString('he-IL');
      
      html += `
        <tr class="blocked">
          <td>${driver.name}</td>
          <td>${driver.phone}</td>
          <td>${driver.blockedReason || 'לא צוינה'}</td>
          <td>${blockedDate}</td>
          <td>
            <button onclick="unblockDriver('${driver._id}')" style="background: #28a745;">הסר חסימה</button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error('❌ שגיאה:', err);
  }
}

// חסימת נהג
async function blockDriver(driverId) {
  const reason = prompt('סיבת החסימה:');
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

    if (response.ok) {
      alert('✅ נהג חסום בהצלחה');
      loadDrivers();
      loadBlockedDrivers();
    }
  } catch (err) {
    alert('❌ שגיאה בחסימה');
  }
}

// הסרת חסימה
async function unblockDriver(driverId) {
  try {
    const response = await fetch(`/api/drivers/${driverId}/unblock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });

    if (response.ok) {
      alert('✅ חסימה הוסרה');
      loadDrivers();
      loadBlockedDrivers();
    }
  } catch (err) {
    alert('❌ שגיאה בהסרת חסימה');
  }
}

// סטטיסטיקה
async function loadStats() {
  try {
    const response = await fetch('/api/rides', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    const rides = await response.json();
    
    const dResponse = await fetch('/api/drivers', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    const drivers = await dResponse.json();

    const stats = {
      totalRides: rides.length,
      completed: rides.filter(r => r.status === 'commission_paid').length,
      totalRevenue: rides.filter(r => r.status === 'commission_paid').reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
      topDriver: drivers.reduce((top, d) => d.totalRides > (top?.totalRides || 0) ? d : top, null),
      avgRating: (drivers.reduce((sum, d) => sum + d.rating, 0) / drivers.length).toFixed(1),
      vipRides: rides.filter(r => r.rideType === 'vip').length
    };

    const html = `
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
        <div style="background: #e3f2fd; padding: 20px; border-radius: 8px;">
          <h3>📊 סה"כ נסיעות</h3>
          <p style="font-size: 32px; color: #1976d2; font-weight: bold;">${stats.totalRides}</p>
        </div>
        <div style="background: #c8e6c9; padding: 20px; border-radius: 8px;">
          <h3>✅ הושלמו</h3>
          <p style="font-size: 32px; color: #388e3c; font-weight: bold;">${stats.completed}</p>
        </div>
        <div style="background: #fff9c4; padding: 20px; border-radius: 8px;">
          <h3>💰 הכנסה</h3>
          <p style="font-size: 32px; color: #f57f17; font-weight: bold;">₪${stats.totalRevenue}</p>
        </div>
        <div style="background: #ffe0b2; padding: 20px; border-radius: 8px;">
          <h3>👑 VIP נסיעות</h3>
          <p style="font-size: 32px; color: #e65100; font-weight: bold;">${stats.vipRides}</p>
        </div>
        <div style="background: #f8bbd0; padding: 20px; border-radius: 8px;">
          <h3>⭐ דירוג ממוצע</h3>
          <p style="font-size: 32px; color: #c2185b; font-weight: bold;">${stats.avgRating}</p>
        </div>
        <div style="background: #b2dfdb; padding: 20px; border-radius: 8px;">
          <h3>🏆 נהג מוביל</h3>
          <p style="font-size: 20px; color: #00695c; font-weight: bold;">${stats.topDriver?.name || 'אין'}</p>
          <p>${stats.topDriver?.totalRides || 0} נסיעות</p>
        </div>
      </div>
    `;

    document.getElementById('statsContent').innerHTML = html;
  } catch (err) {
    console.error('❌ שגיאה:', err);
  }
}

function updateStatistics(rides) {
  const stats = {
    created: rides.filter(r => r.status === 'created').length,
    sent: rides.filter(r => r.status === 'sent').length,
    approved: rides.filter(r => r.status === 'approved').length,
    finished: rides.filter(r => r.status === 'finished').length,
    commission_paid: rides.filter(r => r.status === 'commission_paid').length,
  };

  const totalRevenue = rides
    .filter(r => r.status === 'commission_paid')
    .reduce((sum, r) => sum + (r.commissionAmount || 0), 0);

  const html = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div style="background: #fff9c4; padding: 10px; border-radius: 5px;">
        <strong>📝 חדשה:</strong> ${stats.created}
      </div>
      <div style="background: #e3f2fd; padding: 10px; border-radius: 5px;">
        <strong>📨 שנשלחה:</strong> ${stats.sent}
      </div>
      <div style="background: #c8e6c9; padding: 10px; border-radius: 5px;">
        <strong>✅ אושרה:</strong> ${stats.approved}
      </div>
      <div style="background: #ffe0b2; padding: 10px; border-radius: 5px;">
        <strong>🏁 סגורה:</strong> ${stats.finished}
      </div>
      <div style="background: #a5d6a7; padding: 10px; border-radius: 5px;">
        <strong>💰 תשלום:</strong> ${stats.commission_paid}
      </div>
      <div style="background: #ffb74d; padding: 10px; border-radius: 5px; font-weight: bold;">
        <strong>💵 הכנסה:</strong> ₪${totalRevenue}
      </div>
    </div>
  `;

  document.getElementById('statistics').innerHTML = html;
}

function translateStatus(status) {
  const translations = {
    'created': '✏️ חדשה',
    'sent': '📨 שנשלחה',
    'approved': '✅ אושרה',
    'enroute': '🚗 בדרך',
    'arrived': '📍 הגיעה',
    'finished': '🏁 סגורה',
    'commission_paid': '💰 תשלום ✓'
  };
  return translations[status] || status;
}

setInterval(loadRides, 5000);