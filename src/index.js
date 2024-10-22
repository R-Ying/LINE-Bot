import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import $ from 'jquery';
import EXIF from 'exif-js';
import { startRecording, stopRecording, getRecordedData } from './sensor_module.js';
import VConsole from 'vconsole';
const vConsole = new VConsole();
console.log('vConsole 已啟動');

const LiffAppId = "2000183206-NjVg83LK";
let selectedLatitude = null;
let selectedLongitude = null;

const categoryTranslations = {
  road_maintenance: "道路養護",
  pedestrian_environment: "人行環境",
  traffic_engineering: "交通工程",
  parking_management: "停車規劃與管理",
  node_house_number: "節點及門牌數"
};

const subcategoryTranslations = {
  cleanliness: "道路整潔",
  drainage: "整體排水",
  iri: "IRI 平坦度",
  smoothness: "暢行性",
  comfort: "舒適性",
  safety: "安全性",
  usability: "使用性",
  signs: "標誌",
  lines: "標線",
  signals: "號誌",
  facilities: "行人及自行車設施",
  planning: "規劃完善",
  violations: "違規停車",
  nodes: "節點數",
  house_numbers: "門牌數"
};

function initializeLiff(myLiffId) {
  liff
    .init({
      liffId: myLiffId,
    })
    .then(() => {
      if (!liff.isLoggedIn()) {
        liff.login();
      } else {
        liff.getProfile().then(function (profile) {
          console.log("User ID:", profile.userId);
          document.getElementById("detailsInput").value = profile.userId;
        }).catch(function (error) {
          console.error("Error getting profile:", error);
        });
      }
    })
    .catch((err) => {
      console.log(err.code, err.message);
    });
}

document.addEventListener('DOMContentLoaded', function () {
  console.log("DOMContentLoaded event triggered");
  initializeLiff(LiffAppId);

  const categorySelect = document.getElementById("categorySelect");
  const subcategorySelect = document.getElementById("subcategorySelect");
  const newFormSelect = document.getElementById("newFormSelect");
  const detailOptionsSelect = document.getElementById("detailOptionsSelect");
  const uploadInput = document.getElementById("uploadInput");
  const imagePreview = document.getElementById("imagePreview");

  categorySelect.addEventListener("change", (event) => {
    const selectedCategory = event.target.value;
    console.log("Selected category:", selectedCategory);
    populateSubcategories(selectedCategory);
  });

  subcategorySelect.addEventListener("change", (event) => {
    const selectedSubcategory = event.target.value;
    console.log("Selected subcategory:", selectedSubcategory);
    populateNewFormOptions(selectedSubcategory);
  });

  newFormSelect.addEventListener("change", (event) => {
    const selectedNewFormOption = event.target.value;
    console.log("Selected new form option:", selectedNewFormOption);
    populateDetailOptions(selectedNewFormOption);
    updateExampleImages(selectedNewFormOption);
  });

  uploadInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file && file.type.match("image.*")) {
      const reader = new FileReader();
      reader.onload = function (e) {
        imagePreview.innerHTML = `<img src="${e.target.result}" style="max-width: 200px;">`;
      };
      reader.readAsDataURL(file);
    }
  });

  const submitButton = document.getElementById("submitButton");
  submitButton.addEventListener("click", async () => {
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    submitButton.style.display = "none";
    const data = new FormData();
    const file = document.getElementById("uploadInput").files[0];
    if (file && file.type.match("image.*")) {
      data.append("image_file", file, "image_file");
      EXIF.getData(file, async function () {
        const location = getLocation(this);
        console.log("Extracted location:", location);
        data.append(
          "latitude",
          location.latitude ? location.latitude.toString() : ""
        );
        data.append(
          "longitude",
          location.longitude ? location.longitude.toString() : ""
        );

        const profile = await liff.getProfile();
        const userId = profile.userId;
        const category = categoryTranslations[categorySelect.value];
        const subcategory = subcategoryTranslations[subcategorySelect.value];

        data.append("userId", userId);
        data.append("category", category);
        data.append("subcategory", subcategory);
        data.append("detailOption", detailOptionsSelect.value);
        data.append("newFormOption", newFormSelect.value);
        data.append("extraDetails", document.getElementById("extraDetailsInput").value);

        console.log("Form data:", {
          userId,
          category,
          subcategory,
          detailOption: detailOptionsSelect.value,
          extraDetails: document.getElementById("extraDetailsInput").value
        });

        const response = await fetch("/detect", {
          method: "post",
          body: data,
        });
        const result = await response.json();

        if (result.message === "Success") {
          await fetch("/api/save-upload-info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId }),
          });
          alert("圖片上傳成功");
        } else {
          alert(result.detail);
          showMap();
        }
      });
    }
  });

  function populateSubcategories(category) {
    subcategorySelect.innerHTML = '<option value="" disabled selected>選擇細項</option>';
    const subcategories = getSubcategories(category);
    subcategories.forEach(subcategory => {
      const option = document.createElement("option");
      option.value = subcategory.value;
      option.text = subcategory.text;
      subcategorySelect.appendChild(option);
    });
  }

  function populateNewFormOptions(subcategory) {
    // 如果選擇的是 IRI，隱藏 newFormSelect 並自動選擇 detailOptionsSelect 的值
    if (subcategory === 'iri') {
        newFormSelect.style.display = 'none';
        detailOptionsSelect.style.display = 'block';

        // 清空 detailOptionsSelect 並選擇一個預設值
        detailOptionsSelect.innerHTML = '<option value="" disabled selected>選擇具體內容</option>';
        const detailOptions = getDetailOptions('使用檢測車檢測道路之平坦度');
        detailOptions.forEach(optionText => {
            const option = document.createElement("option");
            option.value = optionText;
            option.text = optionText;
            detailOptionsSelect.appendChild(option);
        });

        // 預設選擇第一個 detailOptions 項目
        if (detailOptions.length > 0) {
            detailOptionsSelect.value = detailOptions[0];
            updateExampleImages(detailOptions[0]); // 自動更新示例圖片
        }
    } else {
        newFormSelect.style.display = 'block';
        detailOptionsSelect.style.display = 'block';

        // 清空並重新填充 newFormSelect 的選項
        newFormSelect.innerHTML = '<option value="" disabled selected>選擇子項目內容</option>';
        const newFormOptions = getNewFormOptions(subcategory);
        newFormOptions.forEach(optionText => {
            const option = document.createElement("option");
            option.value = optionText;
            option.text = optionText;
            newFormSelect.appendChild(option);
        });

        detailOptionsSelect.innerHTML = '<option value="" disabled selected>選擇具體內容</option>';
        const detailOptions = getDetailOptions(subcategory);
        detailOptions.forEach(optionText => {
            const option = document.createElement("option");
            option.value = optionText;
            option.text = optionText;
            detailOptionsSelect.appendChild(option);
        });
    }

    if (subcategory === 'iri') {
        // 移除先前的錄音控制區域，避免重複添加
        const existingControls = document.getElementById('recordingControls');
        if (existingControls) {
            existingControls.remove();
        }

        const recordingControls = document.createElement('div');
        recordingControls.id = 'recordingControls';
        recordingControls.innerHTML = `
            <button id="startRecording">開始記錄</button>
            <button id="stopRecording" disabled>停止記錄</button>
            <p id="recordingStatus">未記錄</p>
            <div id="liveDataDisplay">
                <h4>即時數據：</h4>
                <p id="accelerometerData">加速度計：等待數據...</p>
                <p id="gpsData">GPS：等待數據...</p>
                <p id="distanceData">總行駛距離：0.00 米</p>
                <p id="ariData">ARI：尚未計算</p>
            </div>
            <div id="recordedDataSummary"></div>
        `;
        newFormSelect.parentNode.appendChild(recordingControls);

        // 定義開始和停止記錄的事件處理器
        function startRecordingHandler() {
            console.log('開始記錄');
            startRecording(updateLiveData);
            document.getElementById('startRecording').disabled = true;
            document.getElementById('stopRecording').disabled = false;
            document.getElementById('recordingStatus').textContent = '記錄中...';
        }

        function stopRecordingHandler() {
            console.log('停止記錄');
            stopRecording();
            document.getElementById('startRecording').disabled = false;
            document.getElementById('stopRecording').disabled = true;
            document.getElementById('recordingStatus').textContent = '記錄完成';
            const data = getRecordedData();
        }

        // 為按鈕添加事件監聽器
        document.getElementById('startRecording').addEventListener('click', startRecordingHandler);
        document.getElementById('stopRecording').addEventListener('click', stopRecordingHandler);
    }
}

  function populateDetailOptions(subcategory) {
    detailOptionsSelect.innerHTML = '<option value="" disabled selected>選擇具體內容</option>';
    const detailOptions = getDetailOptions(subcategory);
    detailOptions.forEach(optionText => {
      const option = document.createElement("option");
      option.value = optionText;
      option.text = optionText;
      detailOptionsSelect.appendChild(option);
    });
  }

  function getSubcategories(category) {
    const subcategories = {
      road_maintenance: [
        { value: "cleanliness", text: "道路整潔" },
        { value: "drainage", text: "整體排水" },
        { value: "iri", text: "IRI 平坦度" },
      ],
      pedestrian_environment: [
        { value: "smoothness", text: "暢行性" },
        { value: "comfort", text: "舒適性" },
        { value: "safety", text: "安全性" },
        { value: "usability", text: "使用性" },
      ],
      traffic_engineering: [
        { value: "signs", text: "標誌" },
        { value: "lines", text: "標線" },
        { value: "signals", text: "號誌" },
        { value: "facilities", text: "行人及自行車設施" },
      ],
      parking_management: [
        { value: "planning", text: "規劃完善且無違規停車情形" },
        { value: "uncomplete_planning", text: "規劃未盡完善，人行道上設置機車停車位(無違規停車)" },
        { value: "violations", text: "人行空間有違規停車或行駛情形" },
      ],
      node_house_number: [
        { value: "nodes", text: "節點數" },
        { value: "house_numbers", text: "門牌數" },
      ],
    };
    return subcategories[category] || [];
  }

  function getNewFormOptions(subcategory) {
    // 這裡需要根據您的需求定義新表單的選項
    const newFormOptions = {
      cleanliness: ["道路整潔維護情形"],
      drainage: ["道路排水設施之設計", "排水設施結構體、水溝蓋板或預鑄蓋板損壞情況", "溝內通水狀況"],
      iri: ["使用檢測車檢測道路之平坦度"],
      smoothness: ["淨寬(步行寬度)=人行道整體寬度-(公共設施帶寬度 或 機車停車格位寬度 或 天橋、地下道出入口寬度)", "阻礙情況", "無障礙設施", "人行道人行空間淨高"],
      comfort: ["整潔維護", "整體感受"],
      safety: ["全盲評級", "鋪面狀況", "行人防護設施建置及維護狀況", "人行道上設置排水溝清掃孔", "路口安全"],
      usability: ["使用需求", "串聯性"],
      signs:["交通標誌標示內容之正確性、辨識度或損壞狀況"],
      lines:["交通標線劃設之適當性及辨識度"],
      signals:["交通號誌設施之設置適當性、功能性、損壞狀況"],
      facilities:["提升行人及自行車安全相關交通設施"],
      nodes:["街廓範圍內節點數(行經路徑測)"],
      house_numbers:["街廓範圍內門牌數(1F行經路徑側)"]
      // ... 為其他subcategory添加相應的選項 ...
    };
    return newFormOptions[subcategory] || [];
  }

  function getDetailOptions(subcategory) {
    const detailOptions = {
      "道路整潔維護情形": [
        "道路整潔",
        "大致整潔但有些許垃圾",
        "不整潔，有明顯垃圾但不影響行車安全或部分揚塵",
        "相當不整潔，明顯未維護致使影響行車安全或嚴重揚塵"
      ],
      "道路排水設施之設計": [
        "排水設施設計完整，具備集水、排水之完善功能",
        "有排水設施之設計，少部分集水、排水功能運作不彰",
        "排水設施之設計不良，無法有效發揮集水、排水功能",
        "沒有排水設施之設計",
        "自然排水"
      ],
      "排水設施結構體、水溝蓋板或預鑄蓋板損壞情況": [
        "- 設施完善",
        "設施完善，僅部分遭遮蔽",
        "少數設施損壞，但不影響排水功能",
        "嚴重設施損壞或溝蓋遺失",
        "無此設施",
      ],
      "溝內通水狀況": [
        "溝內無雜物且通水良好",
        "溝內少部分雜物但無淤積，不影響排水功能",
        "溝內雜物或淤泥占斷面1/3以上，影響排水功能",
        "溝內雜物或淤泥阻塞，嚴重影響排水功能",
        "無此設施或喪失排水功能"
      ],
      "使用檢測車檢測道路之平坦度": [
        "IRI 4.0以下",
        "IRI 5.0以下",
        "IRI 6.0以下",
        "IRI 超過6.0"
      ],
      "淨寬(步行寬度)=人行道整體寬度-(公共設施帶寬度 或 機車停車格位寬度 或 天橋、地下道出入口寬度)": [
        "人行道淨寬佔該側道路寬度30%以上或淨寬達5公尺以上",
        "人行道淨寬佔該側道路寬度20%以上或淨寬達2.5公尺以上",
        "1.5公尺以上",
        "0.9公尺~1.5公尺(未達1.5公尺)",
        "未達0.9公尺"
      ],
      "阻礙情況": [
        "因民眾私自佔用之情形(路霸、機車違規停車等)",
        "固定設施物設置不當之情形(含車阻)",
      ],
      "無障礙設施": [
        "設有相關設施且維護良好(含路緣斜坡、導盲設施)",
        "設有設施但無法完全發揮功能",
        "缺乏部分設施",
        "完全未設相關設施",
        "不良影響通行安全設施"
      ],
      "人行道人行空間淨高": [
        "全線均高於2.1公尺無突出物",
        "淨高不足(柔性物質，如樹葉)，或有突出物但有設置防護設施不影響通行安全",
        "淨高不足或有突出物影響通行安全"
      ],
      "整潔維護": [
        "人行道整潔",
        "大致整潔但有些許垃圾",
        "不整潔，有明顯垃圾但不影響行走",
        "相當不整潔，明顯未清掃或垃圾未清運，且影響行走(如雜草叢生)"
      ],
      "整體感受": [
        "覺得安全、舒適、有趣",
        "部分指標未達成",
        "多數指標未達成",
        "雜亂不安全"
      ],
      "全盲評級": [
        "路口設有定位點:方便找到垂直於行穿線的定位點，以利能直線通行，避免因偏向走入車道中發生危險",
        "路口設有警示帶:方便辨識是否接近路口，避免走入車道上，同時可以進行通過路口的準備動作",
        "路面高度淨空:人行空間避免有突出物，例如行道樹、站牌或告示牌...等是否影響通行安全",
        "路面寬度淨空:人行道主要通行路徑淨空無障礙物，例如電箱、車阻、攤販、機車...等是否影響通行安全",
        "路面平順(路面連續平順完整，方便視障者直線前進)"
      ],
      "鋪面狀況": [
        "設置適當且無損壞",
        "設置適當，但損壞面積10%以下",
        "設置不適當或不平整，損壞面積11%~50%",
        "損壞超過50%，或有影響通行安全之情況"
      ],
      "行人防護設施建置及維護狀況": [
        "設施完善，且維護良好",
        "設有設施但無法完全發揮功能或維護不佳(如可跨式緣石，人行道有汽機車可任意出入)",
        "缺乏部分設施",
        "有影響通行安全之情況"
      ],
      "人行道上設置排水溝清掃孔": [
        "無設置",
        "設置成蓋板型式且不影響通行安全",
        "有設置，不影響通行安全",
        "有設置，可能影響通行安全"
      ],
      "路口安全": [
        "行人可安心通過",
        "行人通過時覺得有壓力",
        "老弱婦孺無法順利通過",
        "一般行人覺得危險，無法順利通過"
      ],
      "使用需求": [
        "使用需求高",
        "使用需求中",
        "使用需求低"
      ],
      "串聯性": [
        "形成完整人行路網",
        "1個方向無法暢通",
        "2個方向無法暢通",
        "3個方向無法暢通",
        "4個方向以上無法暢通"
      ],
      "交通標誌標示內容之正確性、辨識度或損壞狀況": [
        "標誌設置適當、內容正確且無損壞",
        "標誌設置適當、內容正確但部分損壞",
        "少數(30%以下)標誌設置不適當、或標示內容有誤，標誌損壞、宜再設置或違規附掛",
        "多數(超過30%)標誌設置不適當、或標示內容有誤，或標誌嚴重損壞",
        "應設未設置交通標誌",
        "無須設置"
      ],
      "交通標線劃設之適當性及辨識度": [
        "劃設適當，且能清楚辨識",
        "劃設適當，部分(30%以下)無法清楚辨識",
        "劃設適當，多數(超過30%)無法清楚辨識",
        "部分(30%以下)劃設不適當",
        "多數(超過30%)劃設不適當，有影響人車安全之虞",
        "應劃未劃設標線"
      ],
      "交通號誌設施之設置適當性、功能性、損壞狀況": [
        "設置適當、功能正常無損壞",
        "設置適當、功能正常，但部分損壞",
        "設置適當、功能運作不正常，多數損壞或違規附掛",
        "設置不適當、功能運作不正常，或多數損壞",
        "應設未設置交通號誌設施",
        "無須設置"
      ],
      "提升行人及自行車安全相關交通設施": [
        "設置適當，且能清楚辨識",
        "設置適當，部分(30%以下)無法清楚辨識",
        "設置適當，多數(超過30%)無法清楚辨識",
        "部分(30%以下)設施不適當",
        "多數(超過30%)設施不適當，有影響人車安全之虞",
        "無相關設施"
      ],
      "街廓範圍內節點數(行經路徑測)": [
        "4個以上",
        "3個",
        "2個",
        "1個",
        "0個"
      ],
      "街廓範圍內門牌數": [
        "40戶以上",
        "30-39戶",
        "20-29戶",
        "15-19戶",
        "10-14戶",
        "6-9戶",
        "5戶以下"
      ]
    };
    return detailOptions[subcategory] || [];
  }

  function updateExampleImages(selectedOption) {
    const bestCaseImage = document.getElementById("bestCaseImage");
    const worstCaseImage = document.getElementById("worstCaseImage");
    
    // 這裡需要根據您的實際情況來設定圖片路徑
    const imagePaths = {
      "道路整潔維護情形": {
        best: "/images/road_cleanliness_best.png",
        worst: "/images/road_cleanliness_worst.png"
      },
      "道路排水設施之設計": {
        best: "/images/道路排水-優.png",
        worst: "/images/道路排水-差.png"
      },
      "排水設施結構體、水溝蓋板或預鑄蓋板損壞情況": {
        best: "/images/排水設施-優.png",
        worst: "/images/排水設施-差.png"
      },
      "溝內通水狀況": {
        best: "/images/溝內通水-優.png",
        worst: "/images/溝內通水-差.png"
      },
      "淨寬(步行寬度)=人行道整體寬度-(公共設施帶寬度 或 機車停車格位寬度 或 天橋、地下道出入口寬度)": {
        best: "/images/淨寬-優.png",
        worst: "/images/淨寬-差.png"
      },
      "阻礙情況": {
        best: "/images/阻礙情況-優.png",
        worst: "/images/阻礙情況-差.png"
      },
      "無障礙設施": {
        best: "/images/無障礙設施-優.png",
        worst: "/images/無障礙設施-差.png"
      },
      "人行道人行空間淨高": {
        best: "/images/淨高-優.png",
        worst: "/images/淨高-差.png"
      },
      "整潔維護": {
        best: "/images/整潔維護-優.png",
        worst: "/images/整潔維護-差.png"
      },
      "整體感受": {
        best: "/images/整體感受-優.png",
        worst: "/images/整體感受-差.png"
      },
      "全盲評級": {
        best: "/images/全盲評級-優.png",
        worst: "/images/全盲評級-差.png"
      },
      "鋪面狀況": {
        best: "/images/鋪面狀況-優.png",
        worst: "/images/鋪面狀況-差.png"
      },
      "行人防護設施建置及維護狀況": {
        best: "/images/人行道-優.png",
        worst: "/images/人行道-差.png"
      },
      "人行道上設置排水溝清掃孔": {
        best: "/images/鋪面狀況-優.png",
        worst: "/images/鋪面狀況-差.png"
      },
      "路口安全": {
        best: "/images/路口安全-優.png",
        worst: "/images/路口安全-差.png"
      },
      "串聯性": {
        best: "/images/串聯性-優.png",
        worst: "/images/串聯性-差.png"
      },
      "交通標誌標示內容之正確性、辨識度或損壞狀況": {
        best: "/images/交通標誌-優.png",
        worst: "/images/交通標誌-差.png"
      },
      "交通標線劃設之適當性及辨識度": {
        best: "/images/交通標線-優.png",
        worst: "/images/交通標線-差.png"
      },
      "交通號誌設施之設置適當性、功能性、損壞狀況": {
        best: "/images/交通號誌-優.png",
        worst: "/images/交通號誌-差.png"
      },
      "提升行人及自行車安全相關交通設施": {
        best: "/images/行人及自行車-優.png",
        worst: "/images/行人及自行車-差.png"
      }
    };
  
    if (imagePaths[selectedOption]) {
      bestCaseImage.src = imagePaths[selectedOption].best;
      worstCaseImage.src = imagePaths[selectedOption].worst;
      document.getElementById("exampleImagesContainer").style.display = "block";
    } else {
      document.getElementById("exampleImagesContainer").style.display = "none";
    }
  }

  function convertDMSToDD(degrees, minutes, seconds, direction) {
    let dd = degrees + minutes / 60 + seconds / (60 * 60);
    if (direction == "S" || direction == "W") {
      dd = dd * -1;
    }
    return dd;
  }

  function getLocation(imgExif) {
    const lat = EXIF.getTag(imgExif, "GPSLatitude");
    const lon = EXIF.getTag(imgExif, "GPSLongitude");
    const latRef = EXIF.getTag(imgExif, "GPSLatitudeRef");
    const lonRef = EXIF.getTag(imgExif, "GPSLongitudeRef");

    const latitude = lat ? convertDMSToDD(lat[0], lat[1], lat[2], latRef) : null;
    const longitude = lon ? convertDMSToDD(lon[0], lon[1], lon[2], lonRef) : null;

    return { latitude, longitude };
  }

  function showMap() {
    document.getElementById("map").style.display = "block";
    mapboxgl.accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/streets-v11",
      center: [121.5654, 25.033],
      zoom: 12
    });

    map.on("click", function (e) {
      selectedLatitude = e.lngLat.lat;
      selectedLongitude = e.lngLat.lng;
      new mapboxgl.Marker()
        .setLngLat([selectedLongitude, selectedLatitude])
        .addTo(map);

      document.getElementById("map").style.display = "none";
      console.log("Map clicked, latitude:", selectedLatitude, "longitude:", selectedLongitude);
      submitLocation();
    });
  }

  function submitLocation() {
    const id = document.getElementById("detailsInput").value;
    if (!selectedLatitude || !selectedLongitude) {
      alert("請選擇有效的地點");
      return;
    }

    const file = document.getElementById("uploadInput").files[0];
    if (!file) {
      alert("文件已失效，請重新選擇文件上傳");
      return;
    }

    if (subcategorySelect.value === 'iri') {
      const sensorData = getRecordedData();
      formData.append('accelerometerData', JSON.stringify(sensorData.accelerometer));
      formData.append('gpsData', JSON.stringify(sensorData.gps));
    }

    const formData = new FormData();
    formData.append("image_file", file);
    formData.append("latitude", selectedLatitude);
    formData.append("longitude", selectedLongitude);
    formData.append("manualLocation", "");
    formData.append("userId", id);

    fetch("/detect", {
      method: "POST",
      body: formData
    })
      .then((response) => response.json())
      .then((result) => {
        console.log(result);
        if (result.message === "Success") {
          alert("圖片和位置資訊已上傳成功");
        } else {
          alert("上傳失敗：" + result.detail);
        }
      })
      .catch((error) => {
        console.error("上傳失敗：", error);
        alert("上傳過程中出錯");
      });
  }
});

function updateLiveData(data) {
  if (data.accelerometer) {
      document.getElementById('accelerometerData').textContent = 
          `加速度計：X: ${data.accelerometer.x.toFixed(2)}, Y: ${data.accelerometer.y.toFixed(2)}, Z: ${data.accelerometer.z.toFixed(2)}`;
  }
  if (data.gps) {
      document.getElementById('gpsData').textContent = 
          `GPS：緯度: ${data.gps.latitude.toFixed(6)}, 經度: ${data.gps.longitude.toFixed(6)}`;
  }
  document.getElementById('distanceData').textContent = 
      `總行駛距離：${data.distance.toFixed(2)} 米`;

      if (data.ARI !== null && data.ARI !== undefined) {
        document.getElementById('ariData').textContent = 
            `ARI：${data.ARI.toFixed(4)}`;
    } else {
        document.getElementById('ariData').textContent = 
            `ARI：尚未計算或數據不足`;
    }
}