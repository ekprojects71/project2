const getWeatherData = async (city) => {
    
    const url = `/weather/${city}`;
    
    const response = await fetch(url);
    
    if(!response.ok)
    {   
        throw response.status;
    }
    else
    {
        const data = await response.json();
        return data;
    } 
};