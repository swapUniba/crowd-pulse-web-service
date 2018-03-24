crowd-pulse-web-service
=======================

Crowd Pulse RESTful Web Service.

-----------------------

## Requirements

Install NodeJS with the following commands ([official guide](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions)):

```
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Installation
To install the dependencies, run the following command in the project root:

```
sudo npm install
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
    "main": "/your/crowd-pulse/installation",
    "projects": ["crowdpulse-projectname-1", "crowdpulse-projectname-2"]
  },
  "logs": {
    "path": "/your/logs/path"
  },
  "session": {
    "secret": "your-secret"
  },
  "androidAppBlackList": ["com.android.launcher3", "com.swapuniba.crowdpulse", "com.google.android.packageinstaller",
    "com.android.settings", "com.google.android.setupwizard", "com.android.systemui"],
  "batch": {
    "cleaningPersonalDataTimeout": "*/10 * * * *",
    "crowdPulseRunTimeout": "30 0 * * *",
    "socialProfileTimeout": "0 0 * * *",
    "demographicsTimeout": "0 0 1 * *",
    "interestsTimeout": "0 0 * * *"
  }
}
```

## Run

To execute the application, run `sudo node ./bin/crowd-pulse-web-service.js`.

**Recommended**: use [forever](https://www.npmjs.com/package/forever) in project `./bin` folder:

Start:
```
sudo forever start -l ./forever.log -a -o ./out.log -e ./err.log crowd-pulse-web-service.js
```

Stop:
```
sudo forever stop crowd-pulse-web-service.js
```