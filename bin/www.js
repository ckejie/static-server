
let Server = require('../src/app.js');
let argv = JSON.parse(process.argv[2]); 
let server = new Server(argv);
server.startServer();


