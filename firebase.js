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

const newRules = {
  "rules": {
    "users": {
      "$userId": {
        // 允許讀寫所有用戶數據
        ".read": true,
        ".write": true,
        
        // 點數必須是數字
        "points": {
          ".validate": "newData.isNumber()"
        },
        
        // 登入時間必須是字串
        "lastLogin": {
          ".validate": "newData.isString()"
        }
      }
    }
  }
};

// 更新資料庫規則
db.setRules(JSON.stringify(newRules))
  .then(() => {
    console.log("Database rules updated successfully");
  })
  .catch((error) => {
    console.error("Error updating database rules:", error);
  });

// 修改 getUserPoints 函數來配合新的資料結構
async function getUserPoints(userId) {
    console.log('Getting points for user:', userId);
    const userRef = db.ref('users').child(userId);
    
    try {
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();
        
        if (!userData || !userData.points) {
            return 0;
        }
        return userData.points;
    } catch (error) {
        console.error('Error fetching user points:', error);
        return 0;
    }
}

async function validateAndFixUserData(userId) {
  console.log('Validating and fixing user data for:', userId);
  const userRef = db.ref('users').child(userId);
  
  try {
      const snapshot = await userRef.once('value');
      const userData = snapshot.val();
      
      console.log('Current user data:', userData);

      // 如果用戶資料是數字（舊格式），轉換為新格式
      if (typeof userData === 'number') {
          console.log('Converting old number format to new structure');
          const newStructure = {
              points: userData,
              lastLogin: new Date().toISOString()
          };
          
          await userRef.set(newStructure);
          console.log('User data converted to new structure:', newStructure);
          return newStructure;
      }
      
      // 如果用戶資料不存在，創建新結構
      if (!userData) {
          console.log('Creating new user data structure');
          const newStructure = {
              points: 0,
              lastLogin: new Date().toISOString()
          };
          
          await userRef.set(newStructure);
          console.log('Created new user data structure:', newStructure);
          return newStructure;
      }

      // 如果已經是對象但缺少必要欄位，補充完整
      if (typeof userData === 'object') {
          const updatedStructure = {
              points: userData.points || 0,
              lastLogin: userData.lastLogin || new Date().toISOString()
          };
          
          await userRef.set(updatedStructure);
          console.log('Updated user data structure:', updatedStructure);
          return updatedStructure;
      }

      return userData;
  } catch (error) {
      console.error('Error in validateAndFixUserData:', error);
      throw error;
  }
}

async function updateUserPoints(userId) {
  console.log('Starting points update for user:', userId);
  const userRef = db.ref('users').child(userId);

  try {
      // 先確保資料結構正確
      await validateAndFixUserData(userId);
      
      // 再更新點數
      const result = await userRef.transaction((currentData) => {
          if (currentData === null || typeof currentData === 'number') {
              return {
                  points: 1,
                  lastLogin: new Date().toISOString()
              };
          }
          
          return {
              ...currentData,
              points: (currentData.points || 0) + 1
          };
      });

      if (!result.committed) {
          throw new Error('Transaction failed to commit');
      }

      const updatedData = result.snapshot.val();
      console.log('Points updated successfully:', updatedData);
      return updatedData.points;

  } catch (error) {
      console.error('Error updating points:', error);
      throw error;
  }
}

async function recordUserLogin(userId) {
  console.log('Recording login for user:', userId);
  const userRef = db.ref('users').child(userId);
  const dailyStatsRef = db.ref('daily_stats');
  const performanceRef = db.ref('performance');
  
  try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTimestamp = now.getTime();
      const currentHalfHourKey = Math.floor(currentTimestamp / (30 * 60 * 1000));

      // 確保資料結構正確
      const userData = await validateAndFixUserData(userId);
      
      // 更新登入時間，保留其他資料
      await userRef.update({
          lastLogin: now.toISOString()
      });

      // 檢查是否為新登入
      let isNewLogin = true;
      if (userData.lastLogin) {
          const lastLogin = new Date(userData.lastLogin);
          const lastLoginHalfHourKey = Math.floor(lastLogin.getTime() / (30 * 60 * 1000));
          isNewLogin = currentHalfHourKey !== lastLoginHalfHourKey;
      }

      if (isNewLogin) {
          await Promise.all([
              dailyStatsRef.child(today).update({
                  uniqueUsers: admin.database.ServerValue.increment(1),
                  loginCount: admin.database.ServerValue.increment(1)
              }),
              performanceRef.update({
                  totalUniqueUsers: admin.database.ServerValue.increment(1),
                  totalLoginCount: admin.database.ServerValue.increment(1)
              })
          ]);
      }

      return {
          date: today,
          halfHourKey: currentHalfHourKey,
          isNewLogin
      };
  } catch (error) {
      console.error('Error in recordUserLogin:', error);
      throw error;
  }
}

function uploadImage(filePath, imageName, userId, latitude, longitude, ariData = null) {
  return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const uniqueImageName = `${timestamp}-${imageName}`;
      const file = bucket.file(uniqueImageName);
      
      const stream = file.createWriteStream({
          metadata: {
              contentType: "image/png",
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
              resolve(publicUrl);
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

async function likeCase(caseId, userId) {
  console.log(`likeCase function called with caseId: ${caseId}, userId: ${userId}`);
  const casesRef = db.ref('cases');
  const performanceRef = db.ref('performance/totalLikes');

  try {
    // 查找案件時增加錯誤處理
    const snapshot = await casesRef.orderByChild('caseId').equalTo(caseId).once('value');
    if (snapshot.numChildren() === 0) {
      console.log(`Case ${caseId} not found`);
      throw new Error(`Case ${caseId} not found`);
    }

    // 獲取實際的案件 key
    const caseKey = Object.keys(snapshot.val())[0];
    const caseRef = casesRef.child(caseKey);

    // 先檢查現有狀態，避免不必要的交易
    const currentSnapshot = await caseRef.once('value');
    const currentData = currentSnapshot.val();
    
    // 檢查用戶是否已點讚
    const userLikes = currentData.userLikes || {};
    const hasLiked = userLikes[userId] ? true : false;
    
    // 準備更新的數據
    let likes = currentData.likes || 0;
    if (hasLiked) {
      likes--;
      delete userLikes[userId];
    } else {
      likes++;
      userLikes[userId] = true;
    }
    
    // 使用一般 update 而非交易
    await caseRef.update({ 
      likes: likes,
      userLikes: userLikes
    });
    
    // 更新總讚數
    await performanceRef.transaction((totalLikes) => {
      return (totalLikes || 0) + (hasLiked ? -1 : 1);
    });

    return likes;
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

async function saveARIData(caseId, ariData) {
  try {
      const caseRef = db.ref(`cases/${caseId}`);
      const snapshot = await caseRef.once('value');
      
      if (!snapshot.exists()) {
          throw new Error('Case not found');
      }

      // 更新案件資料，添加 ARI 路段資訊
      await caseRef.update({
          ariSegments: ariData.badRoadSegments,
          totalBadSegments: ariData.badRoadSegments.length,
          ariLastUpdated: new Date().toISOString()
      });

      console.log(`ARI data saved for case ${caseId}`);
      return true;
  } catch (error) {
      console.error('Error saving ARI data:', error);
      throw error;
  }
}

// Function to add a comment to a case
async function addComment(caseId, userId, userName, text) {
  console.log(`Adding comment to case ${caseId} by user ${userId}`);
  const commentsRef = db.ref(`comments/${caseId}`);
  
  try {
    const newCommentRef = commentsRef.push();
    await newCommentRef.set({
      userId,
      userName,
      text,
      timestamp: new Date().toISOString(),
      likes: 0
    });
    
    console.log('Comment added successfully');
    return newCommentRef.key;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
}

// Function to get all comments for a case
async function getComments(caseId) {
  console.log(`Fetching comments for case ${caseId}`);
  const commentsRef = db.ref(`comments/${caseId}`).orderByChild('timestamp');
  
  try {
    const snapshot = await commentsRef.once('value');
    if (!snapshot.exists()) {
      console.log('No comments found for this case');
      return [];
    }
    
    const comments = [];
    snapshot.forEach((childSnapshot) => {
      comments.push({
        id: childSnapshot.key,
        ...childSnapshot.val()
      });
    });
    
    console.log(`Found ${comments.length} comments`);
    return comments;
  } catch (error) {
    console.error('Error fetching comments:', error);
    throw error;
  }
}

// Function to like a comment
async function likeComment(caseId, commentId, userId) {
  console.log(`Liking comment ${commentId} in case ${caseId} by user ${userId}`);
  const commentRef = db.ref(`comments/${caseId}/${commentId}`);
  const userLikesRef = db.ref(`comment_likes/${commentId}/${userId}`);
  
  try {
    // Check if user already liked this comment
    const userLikeSnapshot = await userLikesRef.once('value');
    const alreadyLiked = userLikeSnapshot.exists();
    
    if (alreadyLiked) {
      // Remove like
      await userLikesRef.remove();
      await commentRef.child('likes').transaction(currentLikes => {
        return (currentLikes || 0) - 1;
      });
      return { action: 'removed', likes: await getCommentLikes(caseId, commentId) };
    } else {
      // Add like
      await userLikesRef.set(true);
      await commentRef.child('likes').transaction(currentLikes => {
        return (currentLikes || 0) + 1;
      });
      return { action: 'added', likes: await getCommentLikes(caseId, commentId) };
    }
  } catch (error) {
    console.error('Error liking comment:', error);
    throw error;
  }
}

// Helper function to get the current likes of a comment
async function getCommentLikes(caseId, commentId) {
  const likesRef = db.ref(`comments/${caseId}/${commentId}/likes`);
  const snapshot = await likesRef.once('value');
  return snapshot.val() || 0;
}

// Function to delete a comment (for moderation purposes)
async function deleteComment(caseId, commentId) {
  console.log(`Deleting comment ${commentId} from case ${caseId}`);
  const commentRef = db.ref(`comments/${caseId}/${commentId}`);
  
  try {
    await commentRef.remove();
    console.log('Comment deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
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

// 清空 cases 路徑下的所有資料
// clearDatabase('cases');

// 清空 users 路徑下的所有資料
// clearDatabase('users');

// clearDatabase('daily_stats');

// clearDatabase('preferences');

// generateAndInsertHistoricalData(30)  // 生成30天的歷史數據
//   .then(() => console.log("歷史數據生成和總數更新完成"))
//   .catch(error => console.error("生成歷史數據時發生錯誤:", error));

module.exports = { updateUserPoints, getUserPoints, uploadImage, getUserCases, deleteCase, clearDatabase, db, bucket, getCompletedCases, uploadCasePhoto, getInProgressCases, likeCase, recordUserLogin, recordPageView, generateAndInsertHistoricalData, clearRealtimeDatabase, getDashboardData, saveARIData, addComment, getComments, likeComment, deleteComment};