//////////////////////////
//HTML element references
//////////////////////////
const searchForm = document.querySelector(".search-form");
const currentForecast = document.querySelector(".today");
const hourlyForecast = document.querySelector(".hourly-list-container");
const extendedForecast = document.querySelector(".xtend-forecast-container");
const unitSelection = document.querySelector(".m-units");
const menu = document.querySelector(".menu");

//weather data retrieved from API
let forecast = null;
let city = null;
let searchTerm = null;

//vars used in unit conversion, time
let isMetric = false;
let units = [
    {am: "AM", pm: "PM", distance: "miles", speed: "mph"},
    {am: "", pm: "", distance: "km", speed: "km/h"}
];
let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
let timezone = null;    //UTC timezone offset from OWM API

///////////////////////
//function expressions
///////////////////////

//unit & time conversion functions
const calcMoonPhase = (moonPhase) => {

    let phase = {file: "", name: ""};

    if(moonPhase == 0)
    {
        phase.file = "newmoon";
        phase.name = "New Moon";
    }
    else if(moonPhase > 0 && moonPhase < .25)
    {
        phase.file = "waxingcrescent";
        phase.name = "Waxing Crescent";
    }
    else if(moonPhase == .25)
    {
        phase.file = "firstquarter";
        phase.name = "First Quarter";
    }
    else if(moonPhase > .25 && moonPhase < .50)
    {
        phase.file = "waxinggibbous";
        phase.name = "Waxing Gibbous";
    }
    else if(moonPhase == .50)
    {
        phase.file = "fullmoon";
        phase.name = "Full Moon";
    }
    else if(moonPhase > .50 && moonPhase < .75)
    {
        phase.file = "waninggibbous";
        phase.name = "Waning Gibbous";
    }
    else if(moonPhase == .75)
    {
        phase.file = "thirdquarter";
        phase.name = "Third Quarter";
    }
    else if(moonPhase > .75)
    {
        phase.file = "waningcrescent";
        phase.name = "Waning Crescent";
    }

    return phase;
};

const ftoc = (fTemp) => {

    return (fTemp - 32) * (5/9); 
};

const mtokm = (miles) => {

    return miles * 1.6;
};

const getWindDirection = (windBearing) => {

    //follow the compass rose, north starts at 0 - (0-15)
    let windDir = "";
    const baseDegs = 22.5;
    const directions = [
        {direction: "N", min: 0, max: baseDegs},
        {direction: "NNE", min: baseDegs, max: baseDegs*2},
        {direction: "NE", min: baseDegs*2, max: baseDegs*3},
        {direction: "ENE", min: baseDegs*3, max: baseDegs*4},
        {direction: "E", min: baseDegs*4, max: baseDegs*5},
        {direction: "ESE", min: baseDegs*5, max: baseDegs*6},
        {direction: "SE", min: baseDegs*6, max: baseDegs*7},
        {direction: "SSE", min: baseDegs*7, max: baseDegs*8},
        {direction: "S", min: baseDegs*8, max: baseDegs*9},
        {direction: "SSW", min: baseDegs*9, max: baseDegs*10},
        {direction: "SW", min: baseDegs*10, max: baseDegs*11},
        {direction: "WSW", min: baseDegs*11, max: baseDegs*12},
        {direction: "W", min: baseDegs*12, max: baseDegs*13},
        {direction: "WNW", min: baseDegs*13, max: baseDegs*14},
        {direction: "NW", min: baseDegs*14, max: baseDegs*15},
        {direction: "NNW", min: baseDegs*15, max: baseDegs*16}
    ];

    for(let i = 0; i < directions.length; i++)
    {
        if(windBearing >= directions[i].min &&
            windBearing < directions[i].max)
        {
            windDir = directions[i].direction;
            break;
        }
    }

    return windDir;
};

//converts the time to local time, adjusts for timezone differences
const convertTime = (hour, minute, simple) => {

    let time = null;
    
    let tzOffset = (timezone / 60) / 60; //timezone offset in hrs
    hour += tzOffset;

    //corrects for 30 minute timezones (e.g. south australia)
    if(hour - Math.floor(hour) != 0)
    {
        minute += (hour - Math.floor(hour)) * 60;
        minute = Math.floor(minute);

        if(minute >= 60)
        {
            hour++;
            minute = minute - 60;
        }
    }
    
    if(hour >= 24)
    {
        hour -= 24;
    }
    else if(hour < 0)
    {
        hour += 24;
    }
    hour = Math.floor(hour);

    if(simple)
    {
        if(!isMetric)
        {
            if(hour == 12)
            {
                time = `${hour} ${units[0].pm}`;
            }
            else if(hour > 12)
            {
                time = `${hour - 12} ${units[0].pm}`;
            }
            else if (hour == 0)
            {
                time = `${12} ${units[0].am}`;
            }
            else 
            {
                time = `${hour} ${units[0].am}`;
            }
        }
        else 
        {
            if(hour < 10)
            {
                time = `0${hour}:00`;
            }
            else
            {
                time = `${hour}:00`;
            }
        }
    }
    else 
    {
        if(minute < 10)
        {
            minute = "0" + minute;
        }

        if(!isMetric)
        {
            if(hour == 12)
            {
                time = `${hour}:${minute} ${units[0].pm}`;
            }
            else if(hour > 12)
            {
                time = `${hour - 12}:${minute} ${units[0].pm}`;
            }
            else if (hour === 0)
            {
                time = `${12}:${minute} ${units[0].am}`;
            }
            else 
            {
                time = `${hour}:${minute} ${units[0].am}`;
            }
        }
        else 
        {
            if(hour < 10)
            {
                time = `0${hour}:${minute}`;
            }
            else
            {
                time = `${hour}:${minute}`;
            }
        }
    }

    return time;
};

//this function is designed to handle timezone differences (~1 day ahead / behind)
const getDate = (date) => {
    
    let adjustedTime = {date: "", weekday:""};

    const months = [
        {month: 1, days: 31},
        {month: 2, days: 28},
        {month: 3, days: 31},
        {month: 4, days: 30},
        {month: 5, days: 31},
        {month: 6, days: 30},
        {month: 7, days: 31},
        {month: 8, days: 31},
        {month: 9, days: 30},
        {month: 10, days: 31},
        {month: 11, days: 30},
        {month: 12, days: 31}
    ];
    const firstDay = 1;

    //UTC date
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hours = date.getHours() + (date.getTimezoneOffset() / 60);
    let weekday = date.getDay();

    let isLeapYr = false;

    //hours to offset the time by
    let tzHrsOffset = (timezone / 60) / 60;

    if(hours + tzHrsOffset >= 24)
    {
        day++;
        weekday++;
    }
    else if(hours + tzHrsOffset < 0)
    {
        day--;
        weekday--;
    }

    if(month === 2 && (year % 4 === 0) ||
        (year % 100 === 0 && year % 400 === 0))
    {
        isLeapYr = true;
    }

    if(isLeapYr && month === 2)
    {
        if(day > months[month-1].days+1)
        {
            month++;
            day = firstDay;
        }
    }
    else
    {
        if(day > months[month-1].days)
        {
            month++;
            day = firstDay;
        }
        else if(day < firstDay)
        {
            month--;
            if(month >= months[0].month)
            {
                day = months[month-1].days;
            }
            if(month === 2 && isLeapYr)
            {
                day++;
            }
        }
    }

    //new years
    if(month > months[months.length-1].month)
    {
        year++;
        month = 1;
        day = firstDay;
    }
    else if(month < months[0].month)
    {
        year--;
        month = months[months.length-1].month;
        day = months[months.length-1].days;
    }

    //set the weekday, handle overflow
    if(weekday < 0)
    {
        weekday = 6;
    }
    else if(weekday > 6)
    {
        weekday = 0;
    }
    adjustedTime.weekday = weekdays[weekday];

    //format the date
    if(isMetric)
    {
        adjustedTime.date = `${day}/${month}/${year}`;
    }
    else
    {
        adjustedTime.date = `${month}/${day}/${year}`;
    }


    return adjustedTime;
};


const convertAllValues = () => {
    populateDashboard(forecast, searchTerm);
    generateHourlyCards(forecast);
    generateXFCList(forecast);
};


//hourly forecast cards
const generateHourlyCards = (forecast) => {

    const HRS = 24;

    const time = new Date();
    let hour = null;
    let temp = null;
    let weatherIcon = null;
    let precipChance = null;

    hourlyForecast.innerHTML = "";

    for(let i = 1; i < HRS+1; i++)
    {
        time.setTime(forecast.hourly.data[i].time * 1000);
        hour = convertTime(time.getHours() + (time.getTimezoneOffset() / 60), 0, true);
        temp = Math.ceil(forecast.hourly.data[i].temperature);
        weatherIcon = forecast.hourly.data[i].icon;
        precipChance = Math.ceil(forecast.hourly.data[i].precipProbability * 100);

        if(isMetric)
        {
            temp = Math.ceil(ftoc(temp));
        }

        hourlyForecast.innerHTML += 
        `  
        <div class="hourly-weather-item">
            <span class="hw-time">${hour}</span>
            <div class="hw-temp">
                <span>${temp}</span>
                <span>&deg;</span>
            </div>
            <img src="images/icons/${weatherIcon}.svg" alt="weather-icon" class="hw-icon weather-icon">
            <div class="hw-precip">
                <img src="images/precip.png" alt="precip-icon" class="hw-precip-icon">
                <span class="hw-precip-chance">${precipChance}</span>
                <span>%</span>
            </div>
        </div>
        `;
    }
};

//extended forecast list
const generateXFCList = (forecast) => {

    const WEEK = 7;

    //test variables - replace with object
    let time = new Date();
    let weekday = null;
    let weatherIcon = null;
    let precipChance = null;
    let hiValue = null;
    let loValue = null;

    extendedForecast.innerHTML = "";

    for(let i = 1; i < WEEK+1; i++)
    {
        time.setTime(forecast.daily.data[i].time * 1000);
        weekday = getDate(time);
        weatherIcon = forecast.daily.data[i].icon;
        precipChance = Math.ceil(forecast.daily.data[i].precipProbability * 100);
        hiValue = Math.ceil(forecast.daily.data[i].temperatureMax);
        loValue = Math.ceil(forecast.daily.data[i].temperatureMin);

        if(isMetric)
        {
            hiValue = Math.ceil(ftoc(hiValue));
            loValue = Math.ceil(ftoc(loValue));
        }

        extendedForecast.innerHTML += 
        `
            <li class="daily-weather-item">
                <span class="dw-weekday">${weekday.weekday}</span>
                <img src="images/icons/${weatherIcon}.svg" alt="weather-icon" class="dw-weather-icon weather-icon">
                <div class="dw-precip">
                    <img src="images/precip.png" alt="precip-icon" class="dw-precip-icon">
                    <span class="dw-precip-value">${precipChance}</span>
                    <span>%</span>
                </div>
                <div class="dw-hi-lo">
                    <span>H:</span>
                    <span class="dw-hi-value">${hiValue}</span>
                    <span>&deg;</span>
                </div>
                <div class="dw-hi-lo">
                    <span>L:</span>
                    <span class="dw-lo-value">${loValue}</span>
                    <span>&deg;</span>
                </div>
            </li>
        `;
    }
};

//plug values into the current weather dashboard
const populateDashboard = (forecast, searchedCity) => {

    const time = new Date(forecast.currently.time * 1000);
    const srTime = new Date(forecast.daily.data[0].sunriseTime * 1000);
    const ssTime = new Date(forecast.daily.data[0].sunsetTime * 1000);
    let currentTime = convertTime(time.getHours() + (time.getTimezoneOffset() / 60), time.getMinutes(), false);
    let currentDate = getDate(time);
    let weatherIcon = forecast.currently.icon;
    let dashboardImg = forecast.currently.icon;
    let moonPhase = calcMoonPhase(forecast.daily.data[0].moonPhase);
    let sunrise = convertTime(srTime.getHours() + (time.getTimezoneOffset() / 60), srTime.getMinutes(), false);
    let sunset = convertTime(ssTime.getHours() + (time.getTimezoneOffset() / 60), ssTime.getMinutes(), false);
    let windspeed = Math.round((forecast.currently.windSpeed * 10) / 10);
    let wsUnit = null;
    let windbearing = getWindDirection(forecast.currently.windBearing);
    let visUnit = null;
    let visDist = Math.round((forecast.currently.visibility * 10) / 10);
    let curTemp = Math.ceil(forecast.currently.temperature);
    let curHi = Math.ceil(forecast.daily.data[0].temperatureHigh);
    let curLo = Math.ceil(forecast.daily.data[0].temperatureLow);
    let curFeelsLike = Math.ceil(forecast.currently.apparentTemperature);
    let alertMessage = null;

    //format the searched city
    let dashCity = searchedCity;
    dashCity.toLowerCase();
    let words = dashCity.split(' ');
    dashCity = "";

    words.forEach((word) => {
        dashCity += word.charAt(0).toUpperCase() + word.substring(1).toLowerCase() + " ";
    });
    dashCity.trim();

    //toggle alert message
    if(forecast.hasOwnProperty("alerts"))
    {
        if(forecast.alerts[0].hasOwnProperty("title"))
        {
            showHideAlert(true);
            alertMessage = forecast.alerts[0].title;
        }
    }
    else 
    {
        showHideAlert(false);
        alertMessage = "";
    }

    //unit converison
    if(isMetric)
    {
        windspeed = Math.round((mtokm(windspeed) * 10) / 10);
        wsUnit = units[1].speed;
        visUnit = units[1].distance;
        visDist = Math.round((mtokm(visDist) * 10) / 10);
        curTemp = Math.ceil(ftoc(curTemp));
        curHi = Math.ceil(ftoc(curHi));
        curLo = Math.ceil(ftoc(curLo));
        curFeelsLike = Math.ceil(ftoc(curFeelsLike));
    }
    else
    {
        wsUnit = units[0].speed;
        visUnit = units[0].distance;
    }

    //fill in the data
    currentForecast.style.background = `url(images/conditions/${dashboardImg}.jpg) no-repeat center center`;
    currentForecast.style.backgroundSize = "cover";

    currentForecast.querySelector(".cur-city").textContent = dashCity;
    currentForecast.querySelector(".cur-country").textContent = city.sys.country;
    currentForecast.querySelector(".cur-date").textContent = currentDate.date;
    currentForecast.querySelector(".cur-time").textContent = currentTime;

    currentForecast.querySelector(".weather-icon").setAttribute("src",`images/icons/${weatherIcon}.svg`);
    currentForecast.querySelector(".cond-description span").textContent = forecast.currently.summary;
    currentForecast.querySelector(".current-temp .temp").textContent = curTemp;
    currentForecast.querySelector(".cur-fl-temp").textContent = curFeelsLike;
    currentForecast.querySelector(".today-hi-temp").textContent = curHi;
    currentForecast.querySelector(".today-lo-temp").textContent = curLo;

    currentForecast.querySelector(".cur-ws-value").textContent = windspeed;
    currentForecast.querySelector(".cur-ws-unit").textContent = wsUnit;
    currentForecast.querySelector(".cur-ws-direction").textContent = windbearing;
    currentForecast.querySelector(".cur-humid-value").textContent = Math.round(forecast.currently.humidity * 100);
    currentForecast.querySelector(".cur-uv-value").textContent = forecast.currently.uvIndex;
    currentForecast.querySelector(".cur-vis-distance").textContent = visDist;
    currentForecast.querySelector(".cur-vis-unit").textContent = visUnit;

    currentForecast.querySelector(".today-sunrise-time").textContent = sunrise;
    currentForecast.querySelector(".today-sunset-time").textContent = sunset;
    currentForecast.querySelector(".today-moon-icon").setAttribute("src",`images/moonsun/${moonPhase.file}.png`);
    currentForecast.querySelector(".today-moon-phase span").textContent = moonPhase.name;

    currentForecast.querySelector(".cond-summary p").textContent = forecast.hourly.summary;

    currentForecast.querySelector(".alert-message").textContent = alertMessage;
};

//show/hide the app
const showHideApp = (visible) => {
    if(visible)
    {
        currentForecast.classList.remove("d-none");
        document.querySelector(".hourly").classList.remove("d-none");
        document.querySelector(".forecast").classList.remove("d-none");
        document.querySelector("footer").classList.remove("d-none");
    }
    else
    {
        currentForecast.classList.add("d-none");
        document.querySelector(".hourly").classList.add("d-none");
        document.querySelector(".forecast").classList.add("d-none");
        document.querySelector("footer").classList.add("d-none");
    }
};

//show/hide the weather alert
const showHideAlert = (visible) => {
    if(visible)
    {
        currentForecast.querySelector(".weather-alert").classList.remove("d-none");
    }
    else
    {
        currentForecast.querySelector(".weather-alert").classList.add("d-none");
    }
};

//menu functions, error messages
const showHideMenu = (visible) => {
    if(visible)
    {
        menu.classList.remove("d-none");
    }
    else
    {
        menu.classList.add("d-none");
    }
};

const searchError = (searchedCity) => {
    menu.querySelector(".welcome").classList.add("d-none");
    menu.querySelector(".error").classList.remove("d-none");

    menu.querySelector(".error p").innerHTML = `Could not find "${searchedCity}".<br>
    Please check your spelling and try again.<br>
    If this problem persists, the data may not be availabe at this time.`;
};

const invalidSearchTerm = (searchedCity) => {
    menu.querySelector(".welcome").classList.add("d-none");
    menu.querySelector(".error").classList.remove("d-none");

    if(searchedCity === "")
    {
        menu.querySelector(".error p").innerHTML = `Search field is blank. Type in a city and try again.`;
    }
    else {
        menu.querySelector(".error p").innerHTML = `"${searchedCity}" cannot be searched since it contains numeric symbols.<br>
        If your city has numbers in its name, please spell them out when searching.<br>
        E.g. <i>Three Rivers, Seven Oaks, Acht, etc.</i>`;
    }
};

const rateLimit = () => {
    menu.querySelector(".welcome").classList.add("d-none");
    menu.querySelector(".error").classList.remove("d-none");

    menu.querySelector(".error p").innerHTML = `The server is experiencing 
    heavy traffic and cannot handle your request at this time. Please try again later.`;
};

const dailyRequestsMet = () => {
    menu.querySelector(".welcome").classList.add("d-none");
    menu.querySelector(".error").classList.remove("d-none");

    menu.querySelector(".error p").innerHTML = `The server has reached its daily limit of DarkSky API requests.<br>
    To test this app, please try again tomorrow. (Midnight UTC)`;
};

//click event for measurment unit selection
unitSelection.addEventListener("click", (e) => {

    if(e.target.classList.contains("unit-btn") &&
    (e.target.classList.contains("active-unit") == false))
    {
        if(e.target.classList.contains("metric"))
        {
            unitSelection.querySelector(".metric").classList.add("active-unit");
            unitSelection.querySelector(".imperial").classList.remove("active-unit");
            isMetric = true;
            convertAllValues();
        }
        
        if(e.target.classList.contains("imperial") && 
        (e.target.classList.contains("active-unit") == false))
        {
            unitSelection.querySelector(".imperial").classList.add("active-unit");
            unitSelection.querySelector(".metric").classList.remove("active-unit");
            isMetric = false;
            convertAllValues();
        }
    }
});


//submit event listener
searchForm.addEventListener("submit", (e) => {

    e.preventDefault();

    searchTerm = searchForm.querySelector(".search-field").value.trim();

    //request data from express proxy
    getWeatherData(searchTerm)
        .then((data) => {
            city = data[0];
            forecast = data[1];
            
            timezone = city.timezone;

            if(searchTerm.includes(","))
            {
                searchTerm = searchTerm.split(",")[0];
            }

            //show the main app, display data
            showHideMenu(false);
            showHideApp(true);
            populateDashboard(forecast, searchTerm);
            generateHourlyCards(forecast);
            generateXFCList(forecast);
        })
        .catch((error) => {
            console.log(error);
            showHideMenu(true);
            showHideApp(false);

            switch(error) {
                case 400:
                    console.log("400");
                    invalidSearchTerm(searchTerm);
                    break;
                case 403:
                    console.log("403");
                    dailyRequestsMet();
                    break;
                case 404:
                    console.log("404");
                    searchError(searchTerm);
                    break;
                case 429:
                    console.log("429");
                    rateLimit();
                    break;
                default:
                    searchError(searchTerm);
                    break;
            }
        });

    searchForm.reset();
});