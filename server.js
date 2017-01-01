var url     = require('url'),
    http    = require('http'),
    https   = require('https'),
    fs      = require('fs'),
    qs      = require('querystring'),
    express = require('express'),
    app     = express();

// Load config defaults from JSON file.
// Environment variables override defaults.
function loadConfig() {
  var config = JSON.parse(fs.readFileSync(__dirname+ '/config.json', 'utf-8'));
  for (var i in config) {
    config[i] = process.env[i.toUpperCase()] || config[i];
  }
  console.log('Configuration');
  console.log(config);
  return config;
}

var config = loadConfig();

function authenticate(code, cb) {
  var data = qs.stringify({
    client_id: config.oauth_client_id,
    client_secret: config.oauth_client_secret,
    code: code
  });

  var reqOptions = {
    host: config.oauth_host,
    port: config.oauth_port,
    path: config.oauth_path,
    method: config.oauth_method,
    headers: { 'content-length': data.length }
  };

  var body = "";
  var req = https.request(reqOptions, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) { body += chunk; });
    res.on('end', function() {
      cb(null, qs.parse(body).access_token);
    });
  });

  req.write(data);
  req.end();
  req.on('error', function(e) { cb(e.message); });
}

function authenticateTravis(github_token, cb) {
  var data = qs.stringify({
    github_token: github_token
  });

  var reqOptions = {
    host: config.travis_host,
    port: config.oauth_port,
    path: config.travis_auth_path,
    method: config.oauth_method,
    headers: {
      'User-Agent': 'Travis/1.0.0'
    }
  };

  var body = '';
  var req = https.request(reqOptions, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) { body += chunk; });
    res.on('end', function() {
      var tokenString = body.match(':"(.*)"}');
      if (tokenString[1]) {
        cb(null, tokenString[1]); //this is our Travis API token
      }
    });
  });

  req.write(data);
  req.end();
  req.on('error', function(e) { cb(e.message); });
}

function setEnvVar(name, value, travisToken, repoid, cb) {
  var data = JSON.stringify({
    env_var: { name: name, value: value},
  });

  var setVars = {
    host: config.travis_host,
    port: config.oauth_port,
    path: config.travis_env_path+repoid,
    method: config.oauth_method,
    headers: {
      'Authorization': 'token ' + travisToken,
      "Content-Type": "application/json"
    }
  }

  var req = https.request(setVars, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) { console.log('Response: ' + chunk); });
    res.on('end', function() {
      cb(null, 'environment variable set'); //this is our Travis API token
    });
  });

  //console.log('var sent')
  req.write(data);
  req.end();
  req.on('error', function(e) { cb(e.message); });

}


// Convenience for allowing CORS on routes - GET only
app.all('*', function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


app.get('/authenticate/:code', function(req, res) {
  console.log('authenticating code:' + req.params.code);
  authenticate(req.params.code, function(err, token) {
    var result = err || !token ? {"error": "bad_code"} : { "token": token };
    console.log(result);
    res.json(result);
  });
});

app.get('/auth/travis/:github_token', function(req, res) {
  authenticateTravis(req.params.github_token, function(err, access_token) {
    var result = err || !access_token ? {"error": "bad_github_token"} : { access_token };
    console.log(result)
    res.json(result);
  });
});

app.get('/setenv/:repoid/:travis_token', function(req, res) {
  setEnvVar('SURGE_LOGIN', config.surge_login, req.params.travis_token, req.params.repoid, function(err, cb) {
    var result = err || !cb ? {"error": "could not set environment variables"} : { cb };
    console.log('1st set! '+result)
    setEnvVar('SURGE_TOKEN', config.surge_token, req.params.travis_token, req.params.repoid, function(err, cb) {
      console.log('2nd set! '+result)
      res.json('Set Env Vars');
    });
  });
});

var port = process.env.PORT || config.port || 9999;

app.listen(port, null, function (err) {
  console.log('Gatekeeper, at your service: http://localhost:' + port);
});
