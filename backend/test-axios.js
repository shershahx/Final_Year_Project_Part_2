const axios = require('axios');
axios.get('http://localhost:5000/api/degrees/hec/invalid_id/pdf?token=abc', { responseType: 'blob' })
  .catch(err => {
    console.log("err.message:", err.message);
    if(err.response) {
       console.log("has response");
    } else {
       console.log("no response");
    }
  });
