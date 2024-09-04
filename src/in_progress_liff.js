let map;
let allCases = [];

document.addEventListener('DOMContentLoaded', function() {
    if (liff) {
        liff.init({ liffId: "2005958463-KeJ5Rme1" })  // 請確保這是正確的 LIFF ID
            .then(() => {
                console.log("LIFF initialized successfully");
                fetchCases();
                setupNavigation();
            })
            .catch((err) => {
                console.error('LIFF 初始化失敗', err);
                document.body.innerHTML = `<p>LIFF 初始化失敗: ${err.message}</p>`;
            });
    } else {
        console.error('LIFF SDK not loaded');
        document.body.innerHTML = '<p>LIFF SDK 未加載，請確保在 LINE 應用內打開此頁面</p>';
    }
});

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
    const mapContainer = document.getElementById('fullMap');
    if (!mapContainer) return;

    if (!mapboxgl.supported()) {
        mapContainer.innerHTML = '您的瀏覽器不支持 Mapbox GL';
        return;
    }

    mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN; // 請替換為您的 Mapbox access token
    
    if (!map) {
        map = new mapboxgl.Map({
            container: 'fullMap',
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [120.9605, 23.6978], // 台灣中心點
            zoom: 7
        });

        map.addControl(new mapboxgl.NavigationControl());
    }

    // 清除現有的標記
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
}

function createCaseElement(caseItem) {
    console.log('創建案件元素：', caseItem.caseId);
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
    `;

    if (caseItem.additionalImageUrls && caseItem.additionalImageUrls.length > 0) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'media-container';

        caseItem.additionalImageUrls.forEach((img, index) => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';

            const imgElement = document.createElement('img');
            imgElement.src = img.imageUrl;
            imgElement.alt = `案件圖片 ${index + 1}`;
            imgElement.className = 'additional-image';

            const descriptionElement = document.createElement('p');
            descriptionElement.className = 'image-description';
            descriptionElement.textContent = img.description || '無描述';

            const uploadTimeElement = document.createElement('p');
            uploadTimeElement.className = 'image-upload-time';
            uploadTimeElement.textContent = new Date(img.uploadTime).toLocaleString();

            imgContainer.appendChild(imgElement);
            imgContainer.appendChild(descriptionElement);
            imgContainer.appendChild(uploadTimeElement);

            imagesContainer.appendChild(imgContainer);
        });

        caseElement.appendChild(imagesContainer);
    }

    // 添加事件監聽器到地圖連結
    caseElement.querySelector('.map-link').addEventListener('click', function(e) {
        e.preventDefault();
        showMapView(caseItem.caseId);
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
            casesContainer.innerHTML = ''; // 清空容器
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