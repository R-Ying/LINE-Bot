const admin = require("firebase-admin");
const fs = require("fs");
const events = require("events");

// 增加最大監聽器數量限制
events.EventEmitter.defaultMaxListeners = 15;

const serviceAccount = require("./test-6f72a-firebase-adminsdk-slyk6-42158157be.json");
require('dotenv').config();

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://test-6f72a-default-rtdb.firebaseio.com",
    storageBucket: "test-6f72a.appspot.com",
  });
} catch (error) {
  console.error("Error initializing Firebase app:", error);
}

const db = admin.database();
const bucket = admin.storage().bucket();

// 新的數據庫規則
const newRules = {
  "rules": {
    "cases": {
      ".read": true,
      ".write": "auth != null",
      "$caseId": {
        ".read": true,
        ".write": "auth != null",
        "likes": {
          ".read": true,
          ".write": "auth != null"
        },
        "userLikes": {
          ".read": true,
          ".write": "auth != null"
        }
      }
    }
  }
}

// 確保這段代碼被執行
db.setRules(JSON.stringify(newRules))
  .then(() => {
    console.log("Rules updated successfully.");
  })
  .catch((error) => {
    console.error("Error updating rules:", error);
  });

function updateUserPoints(userId) {
  const ref = db.ref("users/" + userId);
  ref.transaction((currentPoints) => {
    if (currentPoints === null) {
      return 1;
    } else {
      return currentPoints + 1;
    }
  });
}

function getUserPoints(userId) {
  return new Promise((resolve, reject) => {
    const ref = db.ref("users/" + userId);
    ref.once(
      "value",
      (snapshot) => {
        const points = snapshot.val();
        resolve(points || 0);
      },
      reject
    );
  });
}

function uploadImage(filePath, imageName, userId, latitude, longitude) {
  return new Promise((resolve, reject) => {
    // 加入時間戳確保文件名唯一
    const timestamp = Date.now();
    const uniqueImageName = `${timestamp}-${imageName}`;

    const file = bucket.file(uniqueImageName);
    const stream = file.createWriteStream({
      metadata: {
        contentType: "image/png", // 根據實際情況調整MIME類型
      },
    });

    stream.on("error", (e) => {
      console.log(e);
      reject(e);
    });

    stream.on("finish", async () => {
      try {
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueImageName}`;
        resolve(publicUrl); // 返回公開URL
      } catch (error) {
        console.error("上傳失敗", error);
        reject(error);
      }
    });

    fs.createReadStream(filePath).pipe(stream);
  });
}


function getUserCases(userId) {
  return new Promise((resolve, reject) => {
    const casesRef = db.ref("cases").orderByChild("userId").equalTo(userId);
    casesRef.once(
      "value",
      (snapshot) => {
        const cases = snapshot.val();
        if (cases) {
          resolve(Object.values(cases));
        } else {
          resolve([]);
        }
      },
      reject
    );
  });
}

async function clearRealtimeDatabase() {
  try {
    await db.ref('/').remove();
    console.log("Realtime Database has been cleared.");
  } catch (error) {
    console.error("Error clearing Realtime Database:", error);
  }
}

function deleteCase(caseId) {
  return db.ref(`cases/${caseId}`).remove();
}

function getCompletedCases() {
  return new Promise((resolve, reject) => {
    console.log("Fetching completed cases from Firebase...");
    const casesRef = db.ref("cases").orderByChild("status").equalTo("已處理");
    casesRef.once(
      "value",
      (snapshot) => {
        const cases = snapshot.val();
        console.log("Raw completed cases data:", cases);
        if (cases) {
          const completedCases = Object.values(cases).filter(caseItem => caseItem.status === "已處理");
          console.log("Filtered completed cases:", completedCases);
          resolve(completedCases);
        } else {
          console.log("No completed cases found");
          resolve([]);
        }
      },
      (error) => {
        console.error("Error fetching completed cases:", error);
        reject(error);
      }
    );
  });
}

async function uploadCasePhoto(imageFilePath, imageName, caseId, description, uploadTime) {
  try {
      const file = bucket.file(imageName);
      await new Promise((resolve, reject) => {
          fs.createReadStream(imageFilePath)
              .pipe(file.createWriteStream({
                  metadata: {
                      contentType: "image/jpeg",
                  },
              }))
              .on('error', reject)
              .on('finish', resolve);
      });

      await file.makePublic();
      const imageUrl = `https://storage.googleapis.com/${bucket.name}/${imageName}`;

      console.log(`Image uploaded to storage: ${imageUrl}`);

      const caseRef = db.ref(`cases/${caseId}`);
      await caseRef.transaction((currentData) => {
          if (currentData) {
              if (!currentData.additionalImageUrls) {
                  currentData.additionalImageUrls = [];
              }
              // 添加包含 imageUrl 和 description 的对象
              currentData.additionalImageUrls.push({
                  imageUrl: imageUrl,
                  description: description,
                  uploadTime: uploadTime // 记录上传时间
              });
          }
          return currentData;
      });

      return imageUrl;

  } catch (error) {
      console.error("Error in uploadCasePhoto:", error);
      throw error;
  }
}

async function getInProgressCases() {
  console.log('Fetching all cases...');
  const casesRef = db.ref('cases');
  const snapshot = await casesRef.once('value');
  
  if (!snapshot.exists()) {
    console.log('No cases found.');
    return [];
  }

  let cases = [];
  snapshot.forEach(childSnapshot => {
    let caseData = childSnapshot.val();
    cases.push({
      caseId: caseData.caseId,
      category: caseData.category,
      detailOption: caseData.detailOption,
      newFormOption: caseData.newFormOption,
      extraDetails: caseData.extraDetails,
      latitude: caseData.latitude,
      longitude: caseData.longitude,
      uploadTime: caseData.uploadTime,
      status: caseData.status,
      additionalImageUrls: caseData.additionalImageUrls || [],
      likes: caseData.likes || 0
    });
  });
  
  const filteredCases = cases.filter(caseItem => caseItem.status === '未處理' || caseItem.status === '處理中');
  console.log('Filtered cases:', filteredCases);
  
  return filteredCases;
}

// async function initializeTotalLikes() {
//   const casesRef = db.ref('cases');
//   const preferencesRef = db.ref('preferences');

//   try {
//     const snapshot = await casesRef.once('value');
//     let totalLikes = 0;
//     snapshot.forEach(childSnapshot => {
//       const caseData = childSnapshot.val();
//       totalLikes += caseData.likes || 0;
//     });

//     await preferencesRef.child('totalLikes').set(totalLikes);
//     console.log('Total likes initialized:', totalLikes);
//     return totalLikes;
//   } catch (error) {
//     console.error('Error initializing total likes:', error);
//     throw error;
//   }
// }

async function likeCase(caseId, userId) {
  console.log(`likeCase function called with caseId: ${caseId}, userId: ${userId}`);
  const casesRef = db.ref('cases');
  const performanceRef = db.ref('performance/totalLikes'); // 引用總讚數的路徑

  try {
    // 首先找到包含指定 caseId 的案件
    const snapshot = await casesRef.orderByChild('caseId').equalTo(caseId).once('value');
    if (snapshot.numChildren() === 0) {
      console.log(`Case ${caseId} not found`);
      throw new Error(`Case ${caseId} not found`);
    }

    // 獲取實際的案件 key
    const caseKey = Object.keys(snapshot.val())[0];
    const caseRef = casesRef.child(caseKey);

    let isLikeRemoved = false;  // 用於判斷是點讚還是收回讚

    const result = await caseRef.transaction((currentData) => {
      if (currentData === null) return null;

      let likes = currentData.likes || 0;
      let userLikes = currentData.userLikes || {};

      if (userLikes[userId]) {
        // 用戶收回讚
        likes--;
        delete userLikes[userId];
        isLikeRemoved = true;
      } else {
        // 用戶點讚
        likes++;
        userLikes[userId] = true;
        isLikeRemoved = false;
      }

      return { ...currentData, likes, userLikes };
    });

    if (!result.committed) {
      throw new Error("Transaction failed commitment");
    }

    const updatedData = result.snapshot.val();
    console.log('Transaction completed successfully');
    console.log('Updated data:', updatedData);

    // 同步更新 performance 的總讚數
    await performanceRef.transaction((totalLikes) => {
      if (totalLikes === null) totalLikes = 0; // 初始化總讚數
      if (isLikeRemoved) {
        // 如果是收回讚，減少總讚數
        totalLikes--;
      } else {
        // 如果是點讚，增加總讚數
        totalLikes++;
      }
      return totalLikes;
    });

    return updatedData.likes;
  } catch (error) {
    console.error("Error in likeCase:", error);
    throw error;
  }
}


// 修改 getDashboardData 函數（如果您有的話，如果沒有，請添加這個函數）
async function getDashboardData() {
  try {
    const performanceSnapshot = await db.ref("performance").once("value");
    const performanceData = performanceSnapshot.val() || {};

    const dailyStatsSnapshot = await db.ref("daily_stats").once("value");
    const dailyStatsData = dailyStatsSnapshot.val() || {};

    const casesSnapshot = await db.ref("cases").once("value");
    const casesData = casesSnapshot.val() || {};

    const totalLikes = performanceData.totalLikes || 0;

    // 計算各類別的點讚數
    let likesData = {};
    Object.values(casesData).forEach(caseData => {
      if (!likesData[caseData.category]) {
        likesData[caseData.category] = 0;
      }
      likesData[caseData.category] += caseData.likes || 0;
    });

    const likesDataArray = Object.entries(likesData).map(([category, likes]) => ({
      category,
      likes
    }));

    const dailyUsersData = Object.entries(dailyStatsData)
      .map(([date, data]) => ({ date, count: data.uniqueUsers || 0 }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const dailyPageViewsData = Object.entries(dailyStatsData)
      .map(([date, data]) => ({ date, views: data.pageViews || 0 }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      totalLikes,
      totalPageViews: performanceData.totalPageViews || 0,
      totalUniqueUsers: performanceData.totalUniqueUsers || 0,
      likesData: likesDataArray,
      dailyUsersData,
      dailyPageViewsData
    };
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    throw error;
  }
}

async function recordUserLogin(userId) {
  const userRef = db.ref('users').child(userId);
  const dailyStatsRef = db.ref('daily_stats');
  const performanceRef = db.ref('performance');
  
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTimestamp = now.getTime();
    const currentHalfHourKey = Math.floor(currentTimestamp / (30 * 60 * 1000));

    const userSnapshot = await userRef.once('value');
    const userData = userSnapshot.val();

    console.log('User data:', userData);

    let isNewLogin = true; // 默認為新登入

    if (userData && userData.lastLogin) {
      const lastLogin = new Date(userData.lastLogin);
      const lastLoginTimestamp = lastLogin.getTime();
      const lastLoginHalfHourKey = Math.floor(lastLoginTimestamp / (30 * 60 * 1000));

      // 檢查是否在同一個半小時內登入
      isNewLogin = currentHalfHourKey !== lastLoginHalfHourKey;
      
      console.log(`Last login: ${lastLogin.toISOString()}, Current login: ${now.toISOString()}, Is new login: ${isNewLogin}`);
    } else {
      console.log('New user or first login detected');
    }

    // 更新用戶的最後登錄時間
    await userRef.update({ lastLogin: now.toISOString() });

    if (isNewLogin) {
      // 更新 daily_stats
      await dailyStatsRef.child(today).transaction(currentStats => {
        if (currentStats === null) {
          return { uniqueUsers: 1, pageViews: 0, loginCount: 1 };
        }
        return { 
          ...currentStats, 
          uniqueUsers: (currentStats.uniqueUsers || 0) + 1,
          loginCount: (currentStats.loginCount || 0) + 1
        };
      });

      // 更新 performance
      await performanceRef.transaction(currentPerformance => {
        if (currentPerformance === null) {
          return { totalUniqueUsers: 1, totalPageViews: 0, totalLoginCount: 1 };
        }
        return { 
          ...currentPerformance, 
          totalUniqueUsers: (currentPerformance.totalUniqueUsers || 0) + 1,
          totalLoginCount: (currentPerformance.totalLoginCount || 0) + 1
        };
      });

      // 更新半小時統計
      const halfHourStatsRef = db.ref('half_hour_stats').child(currentHalfHourKey.toString());
      await halfHourStatsRef.transaction(currentStats => {
        if (currentStats === null) {
          return { uniqueUsers: 1, pageViews: 0 };
        }
        return { 
          ...currentStats, 
          uniqueUsers: (currentStats.uniqueUsers || 0) + 1
        };
      });
    }

    return { newUser: !userData, date: today, halfHourKey: currentHalfHourKey, isNewLogin };
  } catch (error) {
    console.error('Error in recordUserLogin:', error);
    throw error;
  }
}

async function recordPageView() {
  const dailyStatsRef = db.ref('daily_stats');
  const performanceRef = db.ref('performance');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  try {
    // 更新 daily_stats
    const dailyResult = await dailyStatsRef.child(today).transaction(currentStats => {
      if (currentStats) {
        currentStats.pageViews = (currentStats.pageViews || 0) + 1;
        return currentStats;
      }
      return { uniqueUsers: 0, pageViews: 1 };
    });

    // 更新 performance
    const performanceResult = await performanceRef.transaction(currentPerformance => {
      if (currentPerformance) {
        currentPerformance.totalPageViews = (currentPerformance.totalPageViews || 0) + 1;
        return currentPerformance;
      }
      return { totalUniqueUsers: 0, totalPageViews: 1 };
    });
    
    console.log('Daily stats transaction result:', dailyResult);
    console.log('Performance transaction result:', performanceResult);
    
    return { 
      success: true, 
      dailyIncrement: dailyResult.committed ? 1 : 0,
      totalIncrement: performanceResult.committed ? 1 : 0,
      date: today
    };
  } catch (error) {
    console.error('Error recording page view:', error);
    throw error;
  }
}

function generateRandomData(minUsers, maxUsers, minViews, maxViews) {
  return {
    uniqueUsers: Math.floor(Math.random() * (maxUsers - minUsers + 1)) + minUsers,
    pageViews: Math.floor(Math.random() * (maxViews - minViews + 1)) + minViews
  };
}

async function generateAndInsertHistoricalData(days = 30) {
  const dailyStatsRef = db.ref('daily_stats');
  const performanceRef = db.ref('performance');

  console.log(`開始生成 ${days} 天的歷史數據...`);

  let totalUniqueUsers = 0;
  let totalPageViews = 0;

  // 獲取當前日期
  const now = new Date();

  for (let i = 0; i < days; i++) {
    try {
      // 計算日期
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      console.log(`正在處理日期: ${dateString}`);

      // 生成隨機數據
      const data = generateRandomData(50, 200, 100, 1000);

      // 檢查該日期的數據是否已存在
      const snapshot = await dailyStatsRef.child(dateString).once('value');
      if (!snapshot.exists()) {
        // 如果數據不存在，則寫入新數據
        await dailyStatsRef.child(dateString).set(data);
        console.log(`成功插入 ${dateString} 的數據:`, data);

        // 累加總數
        totalUniqueUsers += data.uniqueUsers;
        totalPageViews += data.pageViews;
      } else {
        console.log(`${dateString} 的數據已存在，跳過。`);
        // 如果數據已存在，也要計入總數
        const existingData = snapshot.val();
        totalUniqueUsers += existingData.uniqueUsers || 0;
        totalPageViews += existingData.pageViews || 0;
      }
    } catch (error) {
      console.error(`處理 ${dateString} 時發生錯誤:`, error);
    }
  }

  console.log('歷史數據生成完成');

  // 更新 performance 中的總數
  try {
    await performanceRef.transaction(currentPerformance => {
      if (currentPerformance === null) {
        return { totalUniqueUsers, totalPageViews };
      }
      return {
        totalUniqueUsers: (currentPerformance.totalUniqueUsers || 0) + totalUniqueUsers,
        totalPageViews: (currentPerformance.totalPageViews || 0) + totalPageViews
      };
    });
    console.log('成功更新 performance 總數');
  } catch (error) {
    console.error('更新 performance 總數時發生錯誤:', error);
  }
}


// 新增刪除資料的功能
async function clearDatabase(path) {
  try { 
    await db.ref(path).remove();
    console.log(`Database path ${path} has been cleared.`);
  } catch (error) {
    console.error(`Error clearing database path ${path}:`, error);
  }
}

// // 示例：清空 cases 路徑下的所有資料
// clearDatabase('cases');

// // 示例：清空 users 路徑下的所有資料
// clearDatabase('users');

// clearDatabase('daily_stats');

// clearDatabase('preferences');

// generateAndInsertHistoricalData(30)  // 生成30天的歷史數據
//   .then(() => console.log("歷史數據生成和總數更新完成"))
//   .catch(error => console.error("生成歷史數據時發生錯誤:", error));

module.exports = { updateUserPoints, getUserPoints, uploadImage, getUserCases, deleteCase, clearDatabase, db, bucket, getCompletedCases, uploadCasePhoto, getInProgressCases, likeCase, recordUserLogin, recordPageView, generateAndInsertHistoricalData, clearRealtimeDatabase, getDashboardData };