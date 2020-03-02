//node packages
const express = require("express");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
require("dotenv").config();

const app = express();

app.use(express.static("public"));
app.use(express.json());


//rate limiting per IP
const limiter = rateLimit({
    windowMs: 1000 * 60,
    max: 5,
    message: "Too many requests. Only 5 requests allowed per minute."
});
app.use(limiter);


//Limiting all requests to prevent exceeding 3rd party API limits (this solution is temporary)
global.savedReqData = null;
try {
    savedReqData = JSON.parse(fs.readFileSync("default.json"));
}
catch {
    console.log("file corruption");
    //in case of file corruption, or deleted file contents
    savedReqData = {
        dailyReqsMet: true, //assume worst case since saved data was lost
        OWMTimeout: null,
        nextMinute: null,
        UTCMidnight: null,
        dailyCounter: null,
        minuteCounter: null
    };
    fs.writeFileSync("default.json", JSON.stringify(savedReqData));
}

global.dailyReqsMet = savedReqData.dailyReqsMet || false;
global.OWMTimeout = savedReqData.OWMTimeout || false;
global.nextMinute = savedReqData.nextMinute || null;
global.UTCMidnight = savedReqData.UTCMidnight || null;
global.dailyCounter = savedReqData.dailyCounter || 0;
global.minuteCounter = savedReqData.minuteCounter || 0;

function writeReqData() {
    savedReqData.dailyReqsMet = dailyReqsMet;
    savedReqData.OWMTimeout = OWMTimeout;
    savedReqData.nextMinute = nextMinute;
    savedReqData.UTCMidnight = UTCMidnight;
    savedReqData.dailyCounter = dailyCounter;
    savedReqData.minuteCounter = minuteCounter;

    let data = JSON.stringify(savedReqData);
    fs.writeFileSync("default.json", data);
}

function updateCounters() {
    if(!nextMinute) {
        nextMinute = Date.now() + (1000 * 60);
    }
    else if(Date.now() >= nextMinute && nextMinute) {
        minuteCounter = 0;
        OWMTimeout = false;
        nextMinute = null;
    }

    if(!UTCMidnight) {
        UTCMidnight = new Date();
        UTCMidnight.setDate(new Date().getDate() + 1);
        UTCMidnight.setHours(0, 0, 0, 0);
        UTCMidnight.setUTCHours(23, 59, 59, 999);
        UTCMidnight = UTCMidnight.getTime();
    }
    else if(Date.now() >= UTCMidnight && UTCMidnight) {
        dailyCounter = 0;
        dailyReqsMet = false;
        UTCMidnight = null;
    }
}


//enforces 50 requests per minute, resets the counter each minute
function checkMinuteUsage(res) {
    const MINUTE_LIMIT = 50;

    updateCounters();

    if(!dailyReqsMet)
    {
        if(!OWMTimeout)
        {
            minuteCounter++;
            console.log(`Minute Counter: ${minuteCounter}`);
            if(minuteCounter == MINUTE_LIMIT)
            {
                OWMTimeout = true;
                nextMinute = null;
                updateCounters();

                console.log(`Maximum OWM requests reached. Service unavilable until the next minute.`);
                res.status(429).send(`Maximum OWM requests reached. Service unavilable until the next minute.`);
            }
        }
        else {
            console.log(`Maximum OWM requests reached. Service unavilable until the next minute.`);
            res.status(429).send(`Maximum OWM requests reached. Service unavilable until the next minute.`);
        }
    }
    writeReqData();
}
//enforces 799 requests per day, resets counter at 00:00 UTC
function checkDailyUsage(res) {
    const DAILY_LIMIT = 799;

    updateCounters();

    if(!dailyReqsMet)
    {
        dailyCounter++;
        console.log(`Daily Counter: ${dailyCounter}`);
        if(dailyCounter == DAILY_LIMIT)
        {
            dailyReqsMet = true;
            UTCMidnight = null;
            updateCounters();

            console.log(`Maximum DarkSky requests reached. Service unavailable until 00:00 UTC.`);
            res.status(403).send(`Maximum DarkSky requests reached. Service unavilable until 00:00 UTC.`);
        }
    }
    else
    {
        console.log(`Maximum DarkSky requests reached. Service unavailable until 00:00 UTC.`);
        res.status(403).send(`Maximum DarkSky requests reached. Service unavilable until 00:00 UTC.`);
    }
    writeReqData();
}


//OWM & DarkSky proxy - returns both json files to client
app.get("/weather/:city", async (request, response) => {

    const ow_key = process.env.OWM_KEY;
    const ds_key = process.env.DS_KEY;

    const location = request.params.city;

    checkMinuteUsage(response);
    checkDailyUsage(response);
    if(!dailyReqsMet && !OWMTimeout)
    {

        //will not make API reqs if term is empty or has numeric symbols
        let regex = /\d+/;

        if(location.trim() === "" || location.match(regex))
        {
            console.log(`400 - Invalid Search Term: "${location}"`);
            response.status(400).send(`Invalid Search Term: "${location}"`);
        }
        else    //make the requests, OWM & DarkSky Requests 
        {
            //grab latitude and longitude from OWM
            const owmQuery = `https://api.openweathermap.org/data/2.5/weather?q=${location}&APPID=${ow_key}`;
            const owmResponse = await fetch(owmQuery)
            const owmData = await owmResponse.json();
            if(owmResponse.status == 404)
            {
                console.log(`404 - Could not find the city: "${location}"`);
                response.status(404).send(`Could not find the city: "${location}"`);
            }
            else if(owmResponse.status == 403)
            {
                console.log(`403 - Unable to retrieve coordinates. Too many OWM requests. OWM requests cannot exceed 50/min.`);
                response.status(404).send(`Unable to retrieve coordinates. Too many OWM requests.`);
            }
            else 
            {
                //grab the weather data from DarkSky
                const dsQuery = `https://api.darksky.net/forecast/${ds_key}/${owmData.coord.lat},${owmData.coord.lon}?exclude=minutely&units=us`;
                const dsResponse = await fetch(dsQuery);
                const dsData = await dsResponse.json();
                if(dsResponse.status == 403)
                {
                    console.log(`403 - Maximum DarkSky API requests reached.`);
                    response.status(403).send(`Maximum DarkSky API requests reached. App unavailable until 00:00 UTC.`);
                }
                else
                {
                    //send the data to the client
                    const output = [owmData, dsData];
                    response.status(200).json(output);
                }
            }
        }
    }
})

//default port = 3000
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running at port: ${port}`));