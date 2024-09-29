let isRecording = false;
let accelerometerData = [];
let gpsData = [];
let updateCallback = null;
let totalDistance = 0;
let lastPosition = null;
let watchId = null;

function startRecording(callback) {
    isRecording = true;
    accelerometerData = [];
    gpsData = [];
    totalDistance = 0;
    lastPosition = null;
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
        watchId = navigator.geolocation.watchPosition(handleGPS, handleGPSError, {
            enableHighAccuracy: true,
            maximumAge: 0
        });
    }

    // 立即更新回調，顯示初始距離為0
    if (updateCallback) {
        updateCallback({ accelerometer: null, gps: null, distance: totalDistance });
    }
}

function stopRecording() {
    isRecording = false;
    window.removeEventListener('devicemotion', handleAccelerometer);
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }
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
            updateCallback({ accelerometer: newData, gps: gpsData[gpsData.length - 1], distance: totalDistance });
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
        
        if (lastPosition) {
            totalDistance += calculateDistance(lastPosition, newData);
        }
        lastPosition = newData;
        
        if (updateCallback) {
            updateCallback({ accelerometer: accelerometerData[accelerometerData.length - 1], gps: newData, distance: totalDistance });
        }
    }
}

function handleGPSError(error) {
    console.warn(`GPS錯誤 (${error.code}): ${error.message}`);
}

function calculateDistance(pos1, pos2) {
    const R = 6371e3; // 地球半徑（米）
    const φ1 = pos1.latitude * Math.PI/180;
    const φ2 = pos2.latitude * Math.PI/180;
    const Δφ = (pos2.latitude - pos1.latitude) * Math.PI/180;
    const Δλ = (pos2.longitude - pos1.longitude) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // 以米為單位的距離
}

function getRecordedData() {
    return {
        accelerometer: accelerometerData,
        gps: gpsData,
        totalDistance: totalDistance
    };
}

export { startRecording, stopRecording, getRecordedData };