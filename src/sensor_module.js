let isRecording = false; // 是否正在記錄數據
let accelerometerData = []; // 加速度數據
let gpsData = []; // GPS 數據
let updateCallback = null; // 在數據更新時調用的回調函數
let totalDistance = 0; // 總行駛距離
let lastPosition = null; // 上一個 GPS 位置
let watchId = null; // GPS 監聽 ID
let ARI = null; // ARI 值

// 開始記錄數據
function startRecording(callback) {
    // 初始化所有數據，重置累積的加速度、GPS 數據、總行駛距離和上一個位置
    isRecording = true;
    accelerometerData = [];
    gpsData = [];
    totalDistance = 0;
    lastPosition = null;
    updateCallback = callback;
    ARI = null;  // 重置 ARI
    
    // 請求許可權並添加監聽器來收集加速度數據
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
    
    // 使用navigator.geolocation.watchPosition開始持續更新GPS數據
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

// 停止記錄數據
function stopRecording() {
    // 停止記錄，並清除所有監聽器
    isRecording = false;
    window.removeEventListener('devicemotion', handleAccelerometer);

    // 停止監聽GPS位置
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }
}

// 處理加速度數據
function handleAccelerometer(event) {
    if (isRecording) {
        // 收集加速度數據（x、y、z軸加速度）
        const newData = {
            x: event.accelerationIncludingGravity.x,
            y: event.accelerationIncludingGravity.y,
            z: event.accelerationIncludingGravity.z,
            timestamp: new Date().getTime()
        };
        accelerometerData.push(newData);
        console.log(`加速度數據已添加：`, newData);
        console.log(`當前加速度數據點數：${accelerometerData.length}`);

        // 如果總行駛距離超過100米，則計算ARI
        if (totalDistance >= 100) {
            calculateARI();
        }

        // 更新回調，顯示最新的加速度數據、GPS數據、總行駛距離和ARI
        if (updateCallback) {
            updateCallback({
                accelerometer: newData,
                gps: gpsData[gpsData.length - 1],
                distance: totalDistance,
                ARI: ARI
            });
        }
    }
}

// 處理GPS數據
function handleGPS(position) {
    if (isRecording) {
        // 收集GPS數據（緯度、經度和時間戳）
        const newData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().getTime()
        };
        gpsData.push(newData);
        
        // 使用calculateDistance函數計算新位置和上一個位置之間的距離，並將其添加到總行駛距離中
        if (lastPosition) {
            totalDistance += calculateDistance(lastPosition, newData);
        }

        // 更新lastPosition為當前位置
        lastPosition = newData;
        
        // 更新回調，顯示最新的加速度數據、GPS數據和總行駛距離
        if (updateCallback) {
            updateCallback({ accelerometer: accelerometerData[accelerometerData.length - 1], gps: newData, distance: totalDistance });
        }
    }
}

function handleGPSError(error) {
    console.warn(`GPS錯誤 (${error.code}): ${error.message}`);
}

// 計算兩個位置之間的距離（以米為單位），使用Haversine公式
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

// 獲取所有已記錄的數據，包括加速度、GPS、總行駛距離和ARI
function getRecordedData() {
    return {
        accelerometer: accelerometerData,
        gps: gpsData,
        totalDistance: totalDistance,
        ARI: ARI
    };
}

// 計算ARI值
function calculateARI() {
    const g = 9.81;  // 重力加速度
    const N = accelerometerData.length;

    // 如果加速度數據不足，則不進行計算
    if (N < 1) {
        console.log('加速度數據不足，無法計算 ARI');
        return;  // 沒有足夠的數據，不進行計算
    }

    // 對每個加速度數據點計算平方和，然後取平均並開平方根，得到ARI值，ai是每個加速度數據點相對於重力加速度的比值
    const sumOfSquares = accelerometerData.reduce((sum, data) => {
        const ai = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z) / g;
        return sum + Math.pow(ai - 1, 2);
    }, 0);

    ARI = Math.sqrt(sumOfSquares / N);
    console.log(`計算出 ARI 值: ${ARI}`);
}

export { startRecording, stopRecording, getRecordedData };