import './style.css';

let map;
let allCases = [];
let userId;
let userLoginRecorded = false;
let pageViewRecorded = false;
let isInitialized = false;
let initializationInProgress = false;

const originalFetch = window.fetch;
window.fetch = function(...args) {
    console.log('Fetch request:', args[0]);
    return originalFetch.apply(this, args);
};

// Debounce function (unchanged)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Wrap initializeLIFF in a debounce function with additional checks
const debouncedInitializeLIFF = debounce(async function() {
    if (isInitialized || initializationInProgress) {
        console.log('LIFF initialization already in progress or completed. Skipping...');
        return;
    }

    initializationInProgress = true;
    console.log('Initializing LIFF');

    if (!liff) {
        console.error('LIFF SDK not loaded');
        document.body.innerHTML = '<p>LIFF SDK 未加載，請確保在 LINE 應用內打開此頁面</p>';
        initializationInProgress = false;
        return;
    }

    try {
        await liff.init({ liffId: "2005958463-KeJ5Rme1" });
        console.log("LIFF initialized successfully");
        
        if (!liff.isLoggedIn()) {
            console.log("User not logged in. Redirecting to login...");
            liff.login();
        } else {
            console.log("User is logged in. Handling logged in user...");
            await handleLoggedInUser();
        }
        isInitialized = true;
    } catch (err) {
        console.error('LIFF 初始化失敗', err);
        alert(`LIFF 初始化失敗: ${err.message}`);
        document.body.innerHTML = `<p>LIFF 初始化失敗: ${err.message}</p>`;
    } finally {
        initializationInProgress = false;
    }
}, 300);

// Only attach the event listener once
if (!window.liffInitialized) {
    window.liffInitialized = true;
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOMContentLoaded event fired');
        debouncedInitializeLIFF();
    });
}

const debouncedRecordUserLogin = debounce(async (userId) => {
    console.log('Attempting to record user login. Current state:', userLoginRecorded);
    if (!userLoginRecorded) {
        try {
            const response = await fetch('/api/record-user-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            });
            const result = await response.json();
            console.log('User login record result:', result);
            userLoginRecorded = true;
            console.log('User login recorded. New state:', userLoginRecorded);
        } catch (error) {
            console.error('Error recording user login:', error);
        }
    } else {
        console.log('User login already recorded. Skipping.');
    }
}, 300);

const debouncedRecordPageView = debounce(async () => {
    console.log('Attempting to record page view. Current state:', pageViewRecorded);
    if (!pageViewRecorded) {
        try {
            const response = await fetch('/api/record-page-view', {
                method: 'POST',
            });
            const result = await response.json();
            console.log('Page view record result:', result);
            pageViewRecorded = true;
            console.log('Page view recorded. New state:', pageViewRecorded);
        } catch (error) {
            console.error('Error recording page view:', error);
        }
    } else {
        console.log('Page view already recorded. Skipping.');
    }
}, 300);

async function handleLoggedInUser() {
    if (userId) {
        console.log('User already handled. Skipping...');
        return;
    }

    try {
        console.log('Handling logged in user...');
        const profile = await liff.getProfile();
        userId = profile.userId;
        console.log("User logged in:", userId);
        
        await debouncedRecordUserLogin(userId);
        await debouncedRecordPageView();
        
        await fetchCases();
        setupNavigation();
    } catch (error) {
        console.error('Error getting user profile:', error);
        alert('獲取用戶信息失敗，請稍後再試');
    }
}

async function recordPageView() {
    try {
        const response = await fetch('/api/record-page-view', {
            method: 'POST',
        });
        const result = await response.json();
        console.log('Page view record result:', result);
    } catch (error) {
        console.error('Error recording page view:', error);
    }
}

function setupNavigation() {
    console.log("Setting up navigation...");
    const caseListLink = document.getElementById('caseListLink');
    const mapViewLink = document.getElementById('mapViewLink');
    const caseListView = document.getElementById('caseListView');
    const mapView = document.getElementById('mapView');

    caseListLink.addEventListener('click', function(e) {
        e.preventDefault();
        caseListView.style.display = 'block';
        mapView.style.display = 'none';
        caseListLink.classList.add('active');
        mapViewLink.classList.remove('active');
    });

    mapViewLink.addEventListener('click', function(e) {
        e.preventDefault();
        showMapView();
    });
}

function showMapView(caseId = null) {
    const caseListView = document.getElementById('caseListView');
    const mapView = document.getElementById('mapView');
    const mapViewLink = document.getElementById('mapViewLink');
    const caseListLink = document.getElementById('caseListLink');

    caseListView.style.display = 'none';
    mapView.style.display = 'block';
    mapViewLink.classList.add('active');
    caseListLink.classList.remove('active');

    initializeFullMap(caseId);
}

function initializeFullMap(focusCaseId = null) {
    console.log('開始初始化地圖...');
    const mapContainer = document.getElementById('fullMap');
    if (!mapContainer) {
        console.error('找不到地圖容器元素');
        return;
    }

    if (!mapboxgl.supported()) {
        console.warn('瀏覽器不支持 Mapbox GL');
        mapContainer.innerHTML = '您的瀏覽器不支持 Mapbox GL';
        return;
    }

    // Use environment variable or set access token directly
    mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    console.log('Mapbox access token:', mapboxgl.accessToken);

    if (!mapboxgl.accessToken) {
        console.error('Mapbox access token 未設置');
        mapContainer.innerHTML = 'Mapbox access token 未設置';
        return;
    }

    try {
        if (!map) {
            console.log('創建新的 Mapbox 實例');
            map = new mapboxgl.Map({
                container: 'fullMap',
                style: 'mapbox://styles/mapbox/streets-v11',
                center: [120.9605, 23.6978], // 台灣中心點
                zoom: 7
            });

            map.on('load', () => {
                console.log('地圖加載完成');
                addMarkersToMap(focusCaseId);
            });

            map.on('error', (e) => {
                console.error('地圖加載錯誤:', e);
            });

            map.addControl(new mapboxgl.NavigationControl());
        } else {
            console.log('使用現有的 Mapbox 實例');
            addMarkersToMap(focusCaseId);
        }
    } catch (error) {
        console.error('初始化地圖時發生錯誤:', error);
        mapContainer.innerHTML = '初始化地圖時發生錯誤';
    }
}

function addMarkersToMap(focusCaseId) {
    console.log('開始添加標記...');
    // Clear existing markers
    const markers = document.getElementsByClassName('mapboxgl-marker');
    while(markers[0]) {
        markers[0].parentNode.removeChild(markers[0]);
    }

    let focusedMarker = null;
    allCases.forEach(caseItem => {
        const marker = new mapboxgl.Marker()
            .setLngLat([caseItem.longitude, caseItem.latitude])
            .setPopup(new mapboxgl.Popup().setHTML(`
                <h3>案件編號: ${caseItem.caseId}</h3>
                <p>狀態: ${caseItem.status || '未知'}</p>
                <p>類別: ${caseItem.category}</p>
            `))
            .addTo(map);

        if (caseItem.caseId === focusCaseId) {
            focusedMarker = marker;
        }
    });

    if (focusedMarker) {
        map.flyTo({
            center: focusedMarker.getLngLat(),
            zoom: 15,
            essential: true
        });
        focusedMarker.togglePopup();
    }
    console.log('標記添加完成');
}

function createCaseElement(caseItem) {
    console.log('Creating case element:', caseItem.caseId);
    const caseElement = document.createElement('div');
    caseElement.className = 'case-item';

    caseElement.innerHTML = `
        <h3>案件編號: ${caseItem.caseId}</h3>
        <p><strong>狀態：</strong> ${caseItem.status || '未知'}</p>
        <p><strong>類別：</strong> ${caseItem.category}</p>
        <p><strong>詳細選項：</strong> ${caseItem.detailOption}</p>
        <p><strong>新表單選項：</strong> ${caseItem.newFormOption || '無'}</p>
        <p><strong>額外詳情：</strong> ${caseItem.extraDetails || '無'}</p>
        <p><strong>位置：</strong> <a href="#" class="map-link" data-case-id="${caseItem.caseId}">查看地圖</a></p>
        <p><strong>上傳時間：</strong> ${new Date(caseItem.uploadTime).toLocaleString()}</p>
        <button class="like-button" data-case-id="${caseItem.caseId}">
            <i class="fas fa-thumbs-up"></i> 
            <span class="like-count">${caseItem.likes || 0}</span>
        </button>
    `;

    if (caseItem.additionalImageUrls && caseItem.additionalImageUrls.length > 0) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'media-container';

        caseItem.additionalImageUrls.forEach((img, index) => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';

            const imgElement = document.createElement('img');
            imgElement.src = typeof img === 'string' ? img : img.imageUrl;
            imgElement.alt = `案件圖片 ${index + 1}`;
            imgElement.className = 'additional-image';

            const descriptionElement = document.createElement('p');
            descriptionElement.className = 'image-description';
            descriptionElement.textContent = typeof img === 'object' ? (img.description || '無描述') : '無描述';

            const uploadTimeElement = document.createElement('p');
            uploadTimeElement.className = 'image-upload-time';
            uploadTimeElement.textContent = typeof img === 'object' && img.uploadTime ? new Date(img.uploadTime).toLocaleString() : '未知上傳時間';

            imgContainer.appendChild(imgElement);
            imgContainer.appendChild(descriptionElement);
            imgContainer.appendChild(uploadTimeElement);

            imagesContainer.appendChild(imgContainer);
        });

        caseElement.appendChild(imagesContainer);
    }

    // Add event listener to map link
    caseElement.querySelector('.map-link').addEventListener('click', function(e) {
        e.preventDefault();
        showMapView(caseItem.caseId);
    });

    // Add event listener to like button
    caseElement.querySelector('.like-button').addEventListener('click', function() {
        likeCaseFunc(caseItem.caseId);
    });

    return caseElement;
}

async function fetchCases() {
    console.log("Fetching cases...");
    try {
        console.log('正在獲取案件...');
        const response = await fetch('/api/get-in-progress-cases');
        console.log('回應狀態：', response.status);
        if (!response.ok) {
            throw new Error(`HTTP 錯誤！狀態：${response.status}`);
        }
        allCases = await response.json();
        console.log('獲取的數據：', JSON.stringify(allCases, null, 2));

        const casesContainer = document.getElementById('casesContainer');
        if (casesContainer) {
            casesContainer.innerHTML = ''; // Clear container
            if (allCases.length === 0) {
                casesContainer.innerHTML = '<p>沒有找到處理中的案件。</p>';
            } else {
                allCases.forEach(caseItem => {
                    console.log('處理案件：', caseItem.caseId);
                    console.log('案件圖片：', caseItem.additionalImageUrls);
                    casesContainer.appendChild(createCaseElement(caseItem));
                });
            }
        } else {
            console.error("找不到 id 為 'casesContainer' 的元素。");
        }
    } catch (error) {
        console.error('獲取案件時出錯：', error);
        const casesContainer = document.getElementById('casesContainer');
        if (casesContainer) {
            casesContainer.innerHTML = `<p>載入案件時出錯：${error.message}</p>`;
        }
    }
}

function likeCaseFunc(caseId) {
    fetch('/api/like-case', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caseId: caseId, userId: userId }),
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            const likeButton = document.querySelector(`.like-button[data-case-id="${caseId}"]`);
            const likeCount = likeButton.querySelector('.like-count');
            likeCount.textContent = data.likes;
        } else {
            console.error('按讚失敗:', data.message);
            alert('按讚失敗，請稍後再試。');
        }
    })
    .catch((error) => {
        console.error('按讚時發生錯誤:', error);
        alert(`按讚時發生錯誤：${error.message}`);
    });
}