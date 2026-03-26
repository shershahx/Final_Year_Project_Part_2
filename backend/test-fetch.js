fetch("http://localhost:5000/api/degrees/hec/undefined/pdf?token=wrong")
  .then(res => {
      console.log("res.ok:", res.ok, "res.status:", res.status);
      return res.text();
  })
  .then(text => console.log(text))
  .catch(err => {
      console.log("catch:", err.message);
  });
