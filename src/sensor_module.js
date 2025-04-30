let isRecording = false;
let accelerometerData = [];
let gpsData = [];
let updateCallback = null;
let totalDistance = 0;
let lastPosition = null;
let watchId = null;
let ARI = null;

// 追蹤ARI閾值路段的變數
let isTracking = false;
let currentSegment = null;
let badRoadSegments = [];
let segmentStartIndex = null;  // 新增：記錄路段開始時的數據索引
const ARI_THRESHOLD = 1.6;

function startRecording(callback) {
    isRecording = true;
    accelerometerData = [];
    gpsData = [];
    totalDistance = 0;
    lastPosition = null;
    updateCallback = callback;
    ARI = null;
    
    // 重置路段追蹤
    isTracking = false;
    currentSegment = null;
    badRoadSegments = [];
    
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

    if (updateCallback) {
        updateCallback({ accelerometer: null, gps: null, distance: totalDistance });
    }
}

function stopRecording() {
    isRecording = false;
    window.removeEventListener('devicemotion', handleAccelerometer);

    if (isTracking && currentSegment) {
        finishCurrentSegment();
    }

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

        if (totalDistance >= 100) {
            calculateARI();
            checkARIThreshold();
        }

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
            updateCallback({
                accelerometer: accelerometerData[accelerometerData.length - 1],
                gps: newData,
                distance: totalDistance
            });
        }
    }
}

function handleGPSError(error) {
    console.warn(`GPS錯誤 (${error.code}): ${error.message}`);
}

function calculateARI() {
    const g = 9.81;
    const N = accelerometerData.length;

    if (N < 1) {
        console.log('加速度數據不足，無法計算 ARI');
        return;
    }

    const sumOfSquares = accelerometerData.reduce((sum, data) => {
        const ai = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z) / g;
        return sum + Math.pow(ai - 1, 2);
    }, 0);

    ARI = Math.sqrt(sumOfSquares / N);
    console.log(`計算出 ARI 值: ${ARI}`);
}

function checkARIThreshold() {
    if (!ARI) return;

    const currentPosition = gpsData[gpsData.length - 1];
    if (!currentPosition) return;

    if (ARI >= ARI_THRESHOLD) {
        if (!isTracking) {
            // 開始新的路段記錄
            isTracking = true;
            segmentStartIndex = gpsData.length - 1;  // 記錄開始位置的索引
            currentSegment = {
                startPosition: { ...currentPosition },  // 複製當前位置資料
                startARI: ARI,
                startIndex: segmentStartIndex
            };
        }
    } else if (ARI < ARI_THRESHOLD && isTracking) {
        finishCurrentSegment();
    }
}

function finishCurrentSegment() {
    if (!currentSegment) return;

    const currentPosition = gpsData[gpsData.length - 1];
    if (!currentPosition) return;

    // 計算路段總距離
    let segmentDistance = 0;
    for (let i = currentSegment.startIndex; i < gpsData.length - 1; i++) {
        segmentDistance += calculateDistance(gpsData[i], gpsData[i + 1]);
    }

    const segment = {
        ...currentSegment,
        endPosition: { ...currentPosition },  // 複製結束位置資料
        endARI: ARI,
        distance: segmentDistance  // 使用累積計算的距離
    };

    badRoadSegments.push(segment);
    isTracking = false;
    currentSegment = null;
    segmentStartIndex = null;
}

function calculateDistance(pos1, pos2) {
    const R = 6371;  // 地球半徑，單位：公里
    const φ1 = pos1.latitude * Math.PI/180;
    const φ2 = pos2.latitude * Math.PI/180;
    const Δφ = (pos2.latitude - pos1.latitude) * Math.PI/180;
    const Δλ = (pos2.longitude - pos1.longitude) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c * 1000;  // 轉換為公尺
}

function getRecordedData() {
    return {
        accelerometer: accelerometerData,
        gps: gpsData,
        totalDistance: totalDistance,
        ARI: ARI,
        badRoadSegments: badRoadSegments,
        recordingEndTime: new Date().toISOString()
    };
}

export { startRecording, stopRecording, getRecordedData };