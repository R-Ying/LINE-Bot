const LiffAppId = "2005908466-lQ188J90";
const MapboxAccessToken = process.env.MAPBOX_ACCESS_TOKEN;

if (!MapboxAccessToken) {
  console.error('Mapbox access token is not set. Please check your environment variables.');
}

mapboxgl.accessToken = MapboxAccessToken;

function initializeLiff(myLiffId) {
  liff
    .init({
      liffId: myLiffId,
    })
    .then(() => {
      if (!liff.isLoggedIn()) {
        liff.login();
      } else {
        console.log('LIFF initialized and user is logged in');
        loadCases();
      }
    })
    .catch((err) => {
      console.log('LIFF initialization failed', err.code, err.message);
    });
}

document.addEventListener('DOMContentLoaded', function () {
  console.log('DOMContentLoaded event triggered');
  initializeLiff(LiffAppId);
});

function loadCases() {
    console.log('Fetching completed cases...');
    fetch('/api/get-completed-cases')
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(cases => {
        console.log('Completed cases fetched:', cases);
        displayCases(cases); // 使用帶有位置的數據
      })
      .catch(error => {
        console.error('Error fetching cases:', error);
      });
  }  

  function displayCases(cases) {
    const casesContainer = document.getElementById('casesContainer');
    casesContainer.innerHTML = '';

    if (!cases || cases.length === 0) {
        casesContainer.innerHTML = '<p>No completed cases found.</p>';
        return;
    }

    cases.forEach((caseData, index) => {
        const caseElement = document.createElement('div');
        caseElement.className = 'card mb-3';

        // 檢查並打印主要圖片 URL
        console.log(`Case ${index} Repair Image URL:`, caseData.repairImageUrl);
        
        // 處理 additionalUrls
        let additionalImagesHtml = '';
        if (caseData.additionalImageUrls && caseData.additionalImageUrls.length > 0) {
            additionalImagesHtml = caseData.additionalImageUrls.map((url, imgIndex) => {
                console.log(`Case ${index} Additional Image ${imgIndex} URL:`, url); // 打印每張圖片的 URL
                return `<img src="${url}" class="img-fluid additional-image" alt="Additional Case Image ${imgIndex}">`;
            }).join('');
        }

        caseElement.innerHTML = `
            <div class="card-body">
                <h5 class="card-title">案件編號: ${caseData.caseId}</h5>
                <h5 class="card-title">${caseData.category} - ${caseData.subcategory}</h5>
                <p class="card-text">詳細內容: ${caseData.detailOption}</p>
                <p class="card-text">補充說明: ${caseData.extraDetails}</p>
                <p class="card-text">上傳時間: ${new Date(caseData.uploadTime).toLocaleString()}</p>
                <p class="card-text">回復時間: ${caseData.responseTime ? new Date(caseData.responseTime).toLocaleString() : '未回復'}</p>
                <div class="media-container">
                    <img src="${caseData.repairImageUrl}" class="img-fluid repair-image" alt="Case Image">
                    ${additionalImagesHtml}
                </div>
                <div id="map-${index}" class="map-container"></div>
            </div>
        `;
        casesContainer.appendChild(caseElement);

        console.log('Initializing map for case:', index);
        console.log('Location:', caseData.location);

        if (caseData.location && caseData.location.longitude && caseData.location.latitude) {
            try {
                const map = new mapboxgl.Map({
                    container: `map-${index}`,
                    style: 'mapbox://styles/mapbox/streets-v11',
                    center: [caseData.location.longitude, caseData.location.latitude],
                    zoom: 14
                });
                console.log('Map initialized successfully');

                new mapboxgl.Marker()
                    .setLngLat([caseData.location.longitude, caseData.location.latitude])
                    .addTo(map);
            } catch (error) {
                console.error('Error initializing map:', error);
            }
        } else {
            console.error('Invalid location data for case:', index);
        }
    });
}
