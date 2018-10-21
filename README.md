crowd-pulse-web-service
=======================

Crowd Pulse RESTful Web Service.

-----------------------

## Requirements

Install NodeJS with the following commands:

```
sudo apt-get update -y
sudo apt-get install -y build-essential
curl -sL https://deb.nodesource.com/setup_4.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo apt-get install libkrb5-dev
```

## Configuration

You can configure the Web service by creating a `config.json` just as the following sample:

```json
{
  "port": 5000,
  "database": {
    "url": "localhost",
    "db": "admin"
  },
  "crowd-pulse": {
    "main": "/path/to/crowd-pulse/core"
  },
  "logs": {
    "path": "/path/to/crowd-pulse/logs/ws"
  }
}
```

Alternatively, you can replace the same information with the following environment variables:

* `CROWD_PULSE_WS_PORT` instead of `port`
* `CROWD_PULSE_WS_MONGO_URL` instead of `database.url`
* `CROWD_PULSE_WS_MONGO_DB` instead of `database.db`
* `CROWD_PULSE_MAIN_EXE` instead of `crowd-pulse.main`
* `CROWD_PULSE_LOGS_PATH` instead of `logs.path`


## Run

To execute the application, run `sudo node ./bin/crowd-pulse-web-service.js`.


## OAuth 2.0

**The OAuth 2.0 implementation is still in progress.**

Call with a `GET` the following **authorization** endpoint:

```
GET http://oauth-service:3000/oauth/authorize?
    response_type=code&
    client_id=theclientid123&
    redirect_uri=http://yourapp.com&
    scope=some,scopes
```

If the process is correct, the user will be redirected to the `redirect_uri`, that will hold the generated
authorization code for the user.

Then, make a `GET` request to the following **token** endpoint:

```
GET http://oauth-service:3000/oauth/token?
    response_type=code&
    client_id=theclientid123&
    redirect_uri=http://yourapp.com&
    scope=some,scopes
```