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
    ".read": false,
    ".write": false,
    "users": {
      "$userId": {
        ".read": "$userId === auth.uid",
        ".write": "$userId === auth.uid"
      }
    },
    "cases": {
      ".indexOn": ["status", "category"],
      ".read": "auth != null && (data.child('status').val() === '處理中' || data.child('userId').val() === auth.uid)",
      ".write": "auth != null && (!data.exists() || data.child('userId').val() === auth.uid)",
      "$caseId": {
        ".read": "auth != null && data.child('userId').val() === auth.uid",
        ".write": "auth != null && (!data.exists() || data.child('userId').val() === auth.uid)"
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
  
  console.log('Snapshot exists:', snapshot.exists());
  console.log('Snapshot value:', snapshot.val());

  if (!snapshot.exists()) {
    console.log('No cases found.');
    return [];
  }

  let cases = [];
  snapshot.forEach(childSnapshot => {
    let caseData = childSnapshot.val();
    console.log('Case data:', caseData);
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
      additionalImageUrls: caseData.additionalImageUrls || []
    });
  });

  console.log('All cases:', cases);
  
  // 過濾 status 為 "未處理" 或 "處理中" 的案件
  const filteredCases = cases.filter(caseItem => caseItem.status === '未處理' || caseItem.status === '處理中');
  console.log('Filtered cases:', filteredCases);
  
  return filteredCases;
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

module.exports = { updateUserPoints, getUserPoints, uploadImage, getUserCases, deleteCase, clearDatabase, db, bucket, getCompletedCases, uploadCasePhoto, getInProgressCases};