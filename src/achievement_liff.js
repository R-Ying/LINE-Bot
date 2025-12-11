/* global liff */

// 全局變數
const LiffAppId = "2005908466-lQ188J90";
let userId = null;
let userName = '';
let userLoginRecorded = false;

// 檢查 LIFF SDK 是否可用的函數
function checkLiffAvailability() {
  if (!window.liff) {
    console.error('LIFF SDK 未載入，請確保在 LINE App 內開啟此頁面');
    document.getElementById('casesContainer').innerHTML = 
      '<div class="alert alert-danger">LIFF SDK 未載入，請確保在 LINE App 內開啟此頁面</div>';
    return false;
  }
  return true;
}

// 初始化 LIFF
function initializeLiff() {
  console.log('開始初始化 LIFF...');
  
  // 確保 LIFF SDK 已載入
  if (!checkLiffAvailability()) {
    return;
  }
  
  liff.init({ liffId: LiffAppId })
    .then(() => {
      console.log('LIFF 初始化成功');
      
      if (!liff.isLoggedIn()) {
        console.log('用戶未登入，開始登入流程');
        liff.login();
      } else {
        console.log('用戶已登入');
        getUserProfile().then(() => {
          loadCases();
        });
      }
    })
    .catch((err) => {
      console.error('LIFF 初始化失敗', err);
      document.getElementById('casesContainer').innerHTML = 
        `<div class="alert alert-danger">LIFF 初始化失敗: ${err.message}</div>`;
    });
}

// 獲取用戶資料
async function getUserProfile() {
  try {
    const profile = await liff.getProfile();
    userId = profile.userId;
    userName = profile.displayName || '匿名用戶';
    console.log('用戶登入成功:', userId, 'Name:', userName);
    
    // 記錄用戶登入
    if (!userLoginRecorded) {
      await recordUserLogin(userId);
      userLoginRecorded = true;
    }
    
    return profile;
  } catch (error) {
    console.error('獲取用戶資料時出錯:', error);
    document.getElementById('casesContainer').innerHTML = 
      `<div class="alert alert-danger">獲取用戶資訊失敗: ${error.message}</div>`;
    throw error;
  }
}

// 記錄用戶登入
async function recordUserLogin(userId) {
  try {
    console.log('正在記錄用戶登入...');
    const response = await fetch('/api/record-user-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });
    const result = await response.json();
    console.log('用戶登入記錄結果:', result);
  } catch (error) {
    console.error('記錄用戶登入時出錯:', error);
    // 繼續執行，不中斷程序
  }
}

// DOM 載入完成後初始化
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM 載入完成');
  setTimeout(initializeLiff, 500); // 延遲初始化，確保 LIFF SDK 完全載入
});

// 載入案件資料
function loadCases() {
  console.log('開始獲取已完成案件...');
  document.getElementById('casesContainer').innerHTML = 
    '<p class="text-center">載入案件中，請稍候...</p>';
    
  fetch('/api/get-completed-cases')
    .then(response => {
      if (!response.ok) {
        throw new Error(`網路回應不正常，狀態碼: ${response.status}`);
      }
      return response.json();
    })
    .then(cases => {
      console.log(`已獲取 ${cases.length} 個已完成案件`);
      displayCases(cases);
    })
    .catch(error => {
      console.error('獲取案件資料時出錯:', error);
      document.getElementById('casesContainer').innerHTML = 
        `<div class="alert alert-danger">載入案件時出錯：${error.message}</div>`;
    });
}

// 顯示案件資料
function displayCases(cases) {
  const casesContainer = document.getElementById('casesContainer');
  casesContainer.innerHTML = '';

  if (!cases || cases.length === 0) {
    casesContainer.innerHTML = '<p class="text-center py-3">沒有找到已完成的案件。</p>';
    return;
  }

  cases.forEach((caseData, index) => {
    console.log(`處理案件 ${index+1}/${cases.length}: ID=${caseData.caseId}`);
    
    // 創建案件元素
    const caseElement = document.createElement('div');
    caseElement.className = 'case-item';
    caseElement.id = `case-${caseData.caseId}`;

    // 基本案件資訊 HTML
    let caseInfoHtml = `
      <h3>案件編號: ${caseData.caseId}</h3>
      <p><strong>狀態：</strong> ${caseData.status || '已處理'}</p>
      <p><strong>類別：</strong> ${caseData.category || '未分類'}</p>
      <p><strong>詳細選項：</strong> ${caseData.detailOption || '無'}</p>
      <p><strong>額外詳情：</strong> ${caseData.extraDetails || '無'}</p>
      <p><strong>上傳時間：</strong> ${new Date(caseData.uploadTime).toLocaleString()}</p>
      <p><strong>回復時間：</strong> ${caseData.responseTime ? new Date(caseData.responseTime).toLocaleString() : '未回復'}</p>
    `;
    
    // 創建媒體容器
    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'media-container';
    
    // 計算總圖片數量
    let imageCount = 0;
    
    // 如果有修復圖片，添加到媒體容器
    if (caseData.repairImageUrl) {
      imageCount++;
      console.log(`案件 ${caseData.caseId} 有修復圖片: ${caseData.repairImageUrl}`);
      
      const imgContainer = document.createElement('div');
      imgContainer.className = 'image-container';
      
      const img = document.createElement('img');
      img.src = caseData.repairImageUrl;
      img.className = 'repair-image';
      img.alt = '維修圖片';
      
      const desc = document.createElement('p');
      desc.className = 'image-description';
      desc.textContent = '維修圖片';
      
      const time = document.createElement('p');
      time.className = 'image-upload-time';
      time.textContent = caseData.responseTime ? new Date(caseData.responseTime).toLocaleString() : '未知時間';
      
      imgContainer.appendChild(img);
      imgContainer.appendChild(desc);
      imgContainer.appendChild(time);
      mediaContainer.appendChild(imgContainer);
    }
    
    // 添加其他圖片到媒體容器
    if (caseData.additionalImageUrls && caseData.additionalImageUrls.length > 0) {
      console.log(`案件 ${caseData.caseId} 有 ${caseData.additionalImageUrls.length} 張額外圖片`);
      
      caseData.additionalImageUrls.forEach((imgData, imgIndex) => {
        imageCount++;
        
        const imgUrl = typeof imgData === 'string' ? imgData : imgData.imageUrl;
        const imgDesc = typeof imgData === 'object' ? (imgData.description || '無描述') : '無描述';
        const imgTime = typeof imgData === 'object' && imgData.uploadTime ? 
                        new Date(imgData.uploadTime).toLocaleString() : '未知上傳時間';
        
        console.log(`添加額外圖片 ${imgIndex+1}: ${imgUrl}`);
        
        const imgContainer = document.createElement('div');
        imgContainer.className = 'image-container';
        
        const img = document.createElement('img');
        img.src = imgUrl;
        img.className = 'additional-image';
        img.alt = `案件圖片 ${imgIndex + 1}`;
        
        const desc = document.createElement('p');
        desc.className = 'image-description';
        desc.textContent = imgDesc;
        
        const time = document.createElement('p');
        time.className = 'image-upload-time';
        time.textContent = imgTime;
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(desc);
        imgContainer.appendChild(time);
        mediaContainer.appendChild(imgContainer);
      });
    }
    
    // 按讚按鈕的 HTML
    const likeButtonHtml = `
      <button class="like-button ${caseData.userLiked ? 'liked' : ''}" data-case-id="${caseData.caseId}">
        <i class="fas fa-thumbs-up"></i> 
        <span class="like-count">${caseData.likes || 0}</span>
      </button>
    `;

    // 評論區塊的 HTML
    const commentsHtml = `
      <div class="comments-section">
        <button class="comments-toggle" data-case-id="${caseData.caseId}">
          <i class="fas fa-comments"></i> 查看討論
        </button>
        <div class="comments-container" id="comments-${caseData.caseId}">
          <div class="comments-list"></div>
          <div class="comment-form">
            <input type="text" class="comment-input" placeholder="發表您的意見...">
            <button class="comment-submit" data-case-id="${caseData.caseId}">送出</button>
          </div>
        </div>
      </div>
    `;

    // 添加基本資訊
    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = caseInfoHtml;
    caseElement.appendChild(infoDiv);
    
    // 只有在有圖片時才添加媒體容器
    if (imageCount > 0) {
      console.log(`案件 ${caseData.caseId} 總共有 ${imageCount} 張圖片`);
      caseElement.appendChild(mediaContainer);
    } else {
      console.log(`案件 ${caseData.caseId} 沒有圖片`);
    }
    
    // 添加按讚和評論區塊
    const actionsDiv = document.createElement('div');
    actionsDiv.innerHTML = likeButtonHtml + commentsHtml;
    caseElement.appendChild(actionsDiv);
    
    // 添加到容器
    casesContainer.appendChild(caseElement);
    
    // 為按讚按鈕添加事件監聽器
    const likeButton = caseElement.querySelector('.like-button');
    if (likeButton) {
      likeButton.addEventListener('click', function() {
        likeCaseFunc(caseData.caseId);
      });
    }

    // 為評論功能添加事件監聽器
    setupCommentListeners(caseElement, caseData.caseId);
  });
}

// 設置評論相關的事件監聽器
function setupCommentListeners(caseElement, caseId) {
  // 切換評論顯示/隱藏
  const commentsToggle = caseElement.querySelector('.comments-toggle');
  commentsToggle.addEventListener('click', function() {
    const commentsContainer = document.getElementById(`comments-${caseId}`);
    commentsContainer.classList.toggle('show');
    
    if (commentsContainer.classList.contains('show')) {
      this.innerHTML = '<i class="fas fa-comments"></i> 隱藏討論';
      loadComments(caseId);
    } else {
      this.innerHTML = '<i class="fas fa-comments"></i> 查看討論';
    }
  });

  // 提交評論
  const commentSubmit = caseElement.querySelector('.comment-submit');
  commentSubmit.addEventListener('click', function() {
    const input = this.parentElement.querySelector('.comment-input');
    const text = input.value.trim();
    
    if (text) {
      addComment(caseId, text);
      input.value = '';
    }
  });

  // 按 Enter 提交評論
  const commentInput = caseElement.querySelector('.comment-input');
  commentInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const text = this.value.trim();
      if (text) {
        addComment(caseId, text);
        this.value = '';
      }
    }
  });
}

// 案件點讚功能
function likeCaseFunc(caseId) {
  if (!userId) {
    alert('請先登入才能點讚');
    return;
  }
  
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
      
      // 更新按鈕樣式
      if (data.userLiked) {
        likeButton.classList.add('liked');
      } else {
        likeButton.classList.remove('liked');
      }
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

// 加載評論
async function loadComments(caseId) {
  console.log(`正在加載案件 ${caseId} 的評論`);
  const commentsListElement = document.querySelector(`#comments-${caseId} .comments-list`);
  
  try {
    commentsListElement.innerHTML = '<p class="loading">載入評論中...</p>';
    
    const response = await fetch(`/api/comments/${caseId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const comments = await response.json();
    
    if (comments.length === 0) {
      commentsListElement.innerHTML = '<p class="no-comments">目前還沒有評論。成為第一個評論的人吧！</p>';
    } else {
      commentsListElement.innerHTML = '';
      comments.forEach(comment => {
        const commentElement = createCommentElement(caseId, comment);
        commentsListElement.appendChild(commentElement);
      });
    }
    
  } catch (error) {
    console.error('加載評論時出錯:', error);
    commentsListElement.innerHTML = `<p class="error">載入評論時出錯：${error.message}</p>`;
  }
}

// 建立評論元素
function createCommentElement(caseId, comment) {
  const commentElement = document.createElement('div');
  commentElement.className = 'comment';
  commentElement.id = `comment-${comment.id}`;
  
  const timestamp = new Date(comment.timestamp).toLocaleString();
  
  commentElement.innerHTML = `
    <div class="comment-header">
      <span class="comment-user">${comment.userName || '匿名用戶'}</span>
      <span class="comment-time">${timestamp}</span>
    </div>
    <div class="comment-text">${escapeHtml(comment.text)}</div>
    <div class="comment-actions">
      <button class="comment-like ${comment.userLiked ? 'liked' : ''}" data-case-id="${caseId}" data-comment-id="${comment.id}">
        <i class="fas fa-thumbs-up"></i> <span class="like-count">${comment.likes || 0}</span>
      </button>
    </div>
  `;
  
  // 為評論點讚按鈕添加事件監聽器
  commentElement.querySelector('.comment-like').addEventListener('click', function() {
    likeComment(caseId, comment.id);
  });
  
  return commentElement;
}

// 添加評論
async function addComment(caseId, text) {
  console.log(`正在添加評論到案件 ${caseId}`);
  
  if (!userId) {
    alert('請先登入才能發表評論');
    return;
  }
  
  try {
    const response = await fetch(`/api/comments/${caseId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        userName,
        text
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('評論添加成功:', result);
    
    // 重新加載評論以顯示新評論
    loadComments(caseId);
    
  } catch (error) {
    console.error('添加評論時出錯:', error);
    alert(`發表評論失敗：${error.message}`);
  }
}

// 評論點讚功能
async function likeComment(caseId, commentId) {
  console.log(`對案件 ${caseId} 中的評論 ${commentId} 點讚`);
  
  if (!userId) {
    alert('請先登入才能點讚');
    return;
  }
  
  try {
    const response = await fetch(`/api/comments/${caseId}/${commentId}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('點讚結果:', result);
    
    const likeButton = document.querySelector(`#comment-${commentId} .comment-like`);
    const likeCount = likeButton.querySelector('.like-count');
    
    if (result.action === 'added') {
      likeButton.classList.add('liked');
    } else {
      likeButton.classList.remove('liked');
    }
    
    likeCount.textContent = result.likes;
    
  } catch (error) {
    console.error('點讚時出錯:', error);
    alert(`點讚失敗：${error.message}`);
  }
}

// HTML 轉義函數，防止 XSS 攻擊
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}