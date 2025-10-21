// ✨ קוד דאשבורד אבא

// ============================================
// 📝 שליחת נסיעה חדשה
// ============================================
async function sendRide() {
  const customerName = document.getElementById('customerName').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();
  const pickup = document.getElementById('pickup').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const scheduledTime = document.getElementById('scheduledTime').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const price = parseFloat(document.getElementById('price').value) || 0;
  const commissionRate = (parseFloat(document.getElementById('commissionRate').value) || 10) / 100;
  const sendToRaw = document.getElementById('sendTo').value.trim();

  // ✅ בדיקות בסיסיות
  if (!customerName || !customerPhone || !pickup || !destination) {
    alert('❌ אנא מלא את כל השדות הנדרשים');
    return;
  }

  // 📞 עיבוד טלפונים
  const sendTo = sendToRaw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sendTo.length === 0) {
    alert('❌ אנא הזן לפחות טלפון אחד של נהג');
    return;
  }

  // הוסף whatsapp: אם חסר
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
    notes,
    price,
    commissionRate,
    sendTo: formattedPhones
  };

  const statusDiv = document.getElementById('sendStatus');
  statusDiv.innerHTML = '<div class="status">⏳ שולח...</div>';

  try {
    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.ok) {
      statusDiv.innerHTML = '<div class="status success">✅ נסיעה נשלחה בהצלחה! נהגים מקבלים בWhatsApp...</div>';
      
      // 🧹 נקה את הטופס
      document.getElementById('customerName').value = '';
      document.getElementById('customerPhone').value = '';
      document.getElementById('pickup').value = '';
      document.getElementById('destination').value = '';
      document.getElementById('scheduledTime').value = '';
      document.getElementById('notes').value = '';
      document.getElementById('sendTo').value = '';
      
      // רענן את הטבלה
      setTimeout(() => {
        loadRides();
        statusDiv.innerHTML = '';
      }, 2000);
    } else {
      statusDiv.innerHTML = `<div class="status error">❌ שגיאה: ${result.error}</div>`;
    }
  } catch (err) {
    console.error('שגיאה:', err);
    statusDiv.innerHTML = `<div class="status error">❌ שגיאה בתקשורת: ${err.message}</div>`;
  }
}

// ============================================
// 📊 טעינת כל הנסיעות
// ============================================
async function loadRides() {
  try {
    const response = await fetch('/api/rides');
    const rides = await response.json();

    // 📈 עדכון סטטיסטיקה
    updateStatistics(rides);

    // 📋 עדכון טבלה
    const tbody = document.getElementById('ridesBody');
    
    if (rides.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">אין נסיעות עדיין</td></tr>';
      return;
    }

    let html = '';
    rides.forEach(ride => {
      const createdTime = new Date(ride.createdAt).toLocaleTimeString('he-IL');
      const statusClass = `status-${ride.status}`;
      
      html += `
        <tr>
          <td>${ride._id.substring(0, 8)}...</td>
          <td>${ride.customerName}</td>
          <td>${ride.pickup.substring(0, 20)}</td>
          <td>${ride.destination.substring(0, 20)}</td>
          <td>₪${ride.price}</td>
          <td>₪${ride.commissionAmount}</td>
          <td>${ride.driverPhone ? ride.driverPhone.substring(-10) : '---'}</td>
          <td><span class="status-badge ${statusClass}">${translateStatus(ride.status)}</span></td>
          <td>${createdTime}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error('שגיאה בטעינה:', err);
    document.getElementById('ridesBody').innerHTML = '<tr><td colspan="9" style="text-align: center; color: red;">❌ שגיאה בטעינה</td></tr>';
  }
}

// ============================================
// 📈 עדכון סטטיסטיקה
// ============================================
function updateStatistics(rides) {
  const stats = {
    created: rides.filter(r => r.status === 'created').length,
    sent: rides.filter(r => r.status === 'sent').length,
    approved: rides.filter(r => r.status === 'approved').length,
    enroute: rides.filter(r => r.status === 'enroute').length,
    arrived: rides.filter(r => r.status === 'arrived').length,
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
      <div style="background: #bbdefb; padding: 10px; border-radius: 5px;">
        <strong>🚗 בדרך:</strong> ${stats.enroute}
      </div>
      <div style="background: #e1bee7; padding: 10px; border-radius: 5px;">
        <strong>📍 הגיעה:</strong> ${stats.arrived}
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

// ============================================
// 🔤 תרגום סטטוסים
// ============================================
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

// 🔄 רענן אוטומטי כל 5 שניות
setInterval(loadRides, 5000);