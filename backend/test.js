const jwt = require('./node_modules/jsonwebtoken');
const token = jwt.sign({
  id: 'some-id',
  email: 'admin@university.edu.pk',
  role: 'UNIVERSITY_ADMIN',
  userType: 'university',
  universityId: 'UNI_1775717780970',
  isHEC: false,
  isUniversity: true,
  isSuperAdmin: false
}, 'hec_university_secret_key_2024', { expiresIn: '24h' });

(async () => {
  try {
    const res = await fetch('http://localhost:5000/api/degrees/workflow/DEG_WORKFLOW_1775717975975_4heg7d/download', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
    if(res.ok) {
       const blob = await res.arrayBuffer();
       console.log("Size:", blob.byteLength);
    } else {
       const txt = await res.text();
       console.log("Error:", txt);
    }
  } catch(e) {
    console.error("Fetch Exception:", e);
  }
})();
