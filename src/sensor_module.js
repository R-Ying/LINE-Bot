let isRecording = false;
let accelerometerData = [];
let gpsData = [];
let updateCallback = null;

function startRecording(callback) {
    isRecording = true;
    accelerometerData = [];
    gpsData = [];
    updateCallback = callback;
    
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(response => {
                if (response == 'granted') {
                    window.addEventListener('devicemotion', handleAccelerometer);
                }
            })
            .catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleAccelerometer);
    }
    
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition(handleGPS, handleGPSError, {
            enableHighAccuracy: true,
            maximumAge: 0
        });
    }
}

function stopRecording() {
    isRecording = false;
    window.removeEventListener('devicemotion', handleAccelerometer);
    navigator.geolocation.clearWatch(watchId);
}

function handleAccelerometer(event) {
    if (isRecording) {
        const newData = {
            x: event.accelerationIncludingGravity.x,
            y: event.accelerationIncludingGravity.y,
            z: event.accelerationIncludingGravity.z,
            timestamp: new Date().getTime()
        };
        accelerometerData.push(newData);
        if (updateCallback) {
            updateCallback({ accelerometer: newData, gps: gpsData[gpsData.length - 1] });
        }
    }
}

function handleGPS(position) {
    if (isRecording) {
        const newData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().getTime()
        };
        gpsData.push(newData);
        if (updateCallback) {
            updateCallback({ accelerometer: accelerometerData[accelerometerData.length - 1], gps: newData });
        }
    }
}

function handleGPSError(error) {
    console.warn(`GPS错误 (${error.code}): ${error.message}`);
}

function getRecordedData() {
    return {
        accelerometer: accelerometerData,
        gps: gpsData
    };
}

export { startRecording, stopRecording, getRecordedData };