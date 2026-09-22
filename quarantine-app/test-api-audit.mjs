async function auditApis() {
  const BASE = 'http://localhost:3000';
  const endpoints = [
    { name: 'Facility Dashboard', url: '/api/v1/dashboards/facility', method: 'GET' },
    { name: 'Beds Status', url: '/api/v1/beds', method: 'GET' },
    { name: 'Nurse Tasks', url: '/api/v1/tasks/nurse', method: 'GET' },
    { name: 'Doctor Tasks', url: '/api/v1/tasks/doctor', method: 'GET' },
    { name: 'Discharge Queue', url: '/api/v1/discharge-queue', method: 'GET' },
    { name: 'Waitlist', url: '/api/v1/waitlist', method: 'GET' },
    { name: 'Analytics Trends', url: '/api/v1/analytics/trends', method: 'GET' },
    { name: 'Sync Flush Endpoint', url: '/api/v1/sync', method: 'POST', body: { records: [] } },
    { name: 'PIN Staff List', url: '/api/v1/auth/pin/staff', method: 'GET' },
  ];

  console.log('=== BACKEND API AUDIT BEGIN ===');
  let failures = 0;
  for (const ep of endpoints) {
    try {
      const res = await fetch(BASE + ep.url, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'x-facility-id': '00000000-0000-0000-0000-000000000001'
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      const text = await res.text();
      const ok = res.status >= 200 && res.status < 400;
      console.log((ok ? '[PASS] ' : '[FAIL] ') + ep.name + ' (' + ep.url + '): HTTP ' + res.status);
      if (!ok) {
        console.log('       Response: ' + text.slice(0, 120));
        failures++;
      }
    } catch (err) {
      console.log('[FAIL] ' + ep.name + ' (' + ep.url + '): Exception ' + err.message);
      failures++;
    }
  }

  // Also test mutations
  console.log('=== MUTATIONS AUDIT ===');
  // 1. PIN switch
  try {
    const pinRes = await fetch(BASE + '/api/v1/auth/pin/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'a0000000-0000-4000-8000-000000000001',
        pin: '1234'
      })
    });
    const pinOk = pinRes.status === 200;
    console.log((pinOk ? '[PASS] ' : '[FAIL] ') + 'PIN Auth Switch (1234): HTTP ' + pinRes.status);
    if (!pinOk) {
      console.log('       Response: ' + (await pinRes.text()).slice(0, 120));
      failures++;
    }
  } catch (err) {
    console.log('[FAIL] PIN Auth Switch: Exception ' + err.message);
    failures++;
  }

  // 2. Temperature logging
  try {
    const tempRes = await fetch(BASE + '/api/v1/admissions/adm-101/temperatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueC: 36.7,
        clientUuid: 'a0000000-0000-4000-8000-000000000002',
        clientRecordedAt: new Date().toISOString()
      })
    });
    const tempOk = tempRes.status === 201;
    console.log((tempOk ? '[PASS] ' : '[FAIL] ') + 'Log Temperature: HTTP ' + tempRes.status);
    if (!tempOk) failures++;
  } catch (err) {
    console.log('[FAIL] Log Temperature: Exception ' + err.message);
    failures++;
  }

  // 3. Doctor visit
  try {
    const visitRes = await fetch(BASE + '/api/v1/admissions/adm-101/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientUuid: 'a0000000-0000-4000-8000-000000000003',
        visitDate: new Date().toISOString().slice(0, 10),
        notes: 'Routine morning audit examination: stable'
      })
    });
    const visitOk = visitRes.status === 201;
    console.log((visitOk ? '[PASS] ' : '[FAIL] ') + 'Record Doctor Visit: HTTP ' + visitRes.status);
    if (!visitOk) failures++;
  } catch (err) {
    console.log('[FAIL] Record Doctor Visit: Exception ' + err.message);
    failures++;
  }

  // 4. Discharge approval
  try {
    const appRes = await fetch(BASE + '/api/v1/admissions/adm-101/discharge-approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved: true,
        notes: 'Clinical criteria met for discharge'
      })
    });
    const appOk = appRes.status === 201;
    console.log((appOk ? '[PASS] ' : '[FAIL] ') + 'Discharge Approval: HTTP ' + appRes.status);
    if (!appOk) failures++;
  } catch (err) {
    console.log('[FAIL] Discharge Approval: Exception ' + err.message);
    failures++;
  }

  console.log('=== AUDIT COMPLETE: ' + (failures === 0 ? '100% HEALTHY' : failures + ' ISSUES FOUND') + ' ===');
}

auditApis();
