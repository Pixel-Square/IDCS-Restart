const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/api/obe/iqac/qp-pattern?class_type=THEORY&question_paper_type=QP2&exam=SSA2',
  method: 'GET',
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let out = '';
  res.on('data', d => {
    out += d;
  });
  res.on('end', () => console.log(out));
});

req.on('error', error => {
  console.error(error);
});

req.end();
