const express = require("express");
const multer = require("multer");
const fs = require("fs");
const exec = require("child_process").exec;
const { updateUserPoints, uploadImage, getUserCases, deleteCase, db, bucket, getCompletedCases, uploadCasePhoto, getInProgressCases, likeCase, recordUserLogin, recordPageView, getDashboardData} = require("./firebase.js");
const { bot, sendMessage } = require("./bot");
const fetch = require("node-fetch");
require('dotenv').config();
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

app.post("/webhook", bot.parser());

app.use(express.json());
// app.use(express.static('dist'));
app.use(express.static('public'));
app.use(express.static('dist', {
  setHeaders: (res, path, stat) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    }
  }
}));

app.use('src/style.css', function(req, res, next) {
  res.set('Content-Type', 'text/css');
  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "admin.html"));
});

app.get("/achievement_liff", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "achievement_liff.html"));
});

app.get('/in_progress_liff', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'in_progress_liff.html'));
});

// app.get('/in_progress_cases_liff.js', (req, res) => {
//   res.set('Content-Type', 'application/javascript');
//   res.sendFile(path.join(__dirname, 'dist', 'in_progress_cases_liff.js'));
// });

app.get('/api/get-in-progress-cases', async (req, res) => {
  try {
      const cases = await getInProgressCases();
      res.json(cases);
  } catch (error) {
      console.error('Error fetching in-progress and unprocessed cases:', error);
      res.status(500).json({ error: 'Failed to fetch cases' });
  }
});

app.get("/api/get-completed-cases", async (req, res) => {
  console.log("Received request for completed cases");
  try {
    const completedCases = await getCompletedCases();
    console.log("Completed cases fetched:", completedCases);
    res.json(completedCases);
  } catch (error) {
    console.error("Error fetching completed cases:", error);
    res.status(500).json({ error: "Failed to fetch completed cases", details: error.message });
  }
});

app.post("/detect", upload.single("image_file"), async function (req, res) {
  const imageFilePath = req.file.path;
  let { latitude, longitude, manualLocation, userId, category, subcategory, newFormOption, detailOption, extraDetails } = req.body;

  let location;
  if (latitude && longitude) {
      location = await getAddress(latitude, longitude);
  } else if (manualLocation) {
      const coords = await getLocationFromAddress(manualLocation);
      if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
          location = manualLocation;
      }
  }

  if (!location) {
      return res.json({ message: "Fail", detail: "無法讀取圖片位置" });
  }

  const fileName = `${Date.now()}-${req.file.originalname}`;
  const imageName = `images/${fileName}`;

  const pythonProcess = exec("python main.py", function (error, stdout, stderr) {
      if (error) {
          console.error("error: " + error);
          res.json({ message: "Error", detail: error.message });
          return;
      }
      console.log("stdout: " + stdout);
      console.log("stderr:" + stderr);

      if (stdout.trim() === "Success") {
          uploadImage(imageFilePath, imageName).then(async (imageUrl) => {
              const caseId = await generateCaseId(category);

              const caseRecord = {
                  caseId: caseId, // 設置案件編號
                  imageUrl: imageUrl,
                  status: "尚未處理",
                  uploadTime: new Date().toISOString(),
                  userId: userId,
                  latitude: latitude,
                  longitude: longitude,
                  category: category,
                  subcategory: subcategory,
                  newFormOption: newFormOption,
                  detailOption: detailOption,
                  extraDetails: extraDetails
              };

              const newCaseRef = db.ref("cases").push();
              newCaseRef.set(caseRecord);

              res.json({ message: "Success", detail: "圖片上傳成功" });
          }).catch(error => {
              res.json({ message: "Fail", detail: error.message });
          });
      } else {
          res.json({ message: "Fail", detail: "圖片不符合標準，請重新上傳" });
      }
  });
  pythonProcess.stdin.write(imageFilePath);
  pythonProcess.stdin.end();
});

app.post("/api/revert-case-status", async (req, res) => {
  console.log('接收到恢復狀態請求:', req.body);
  const { caseId, status } = req.body;
  try {
      await db.ref(`cases/${caseId}`).update({ status });
      res.status(200).send({ message: "案件狀態已更新" });
  } catch (error) {
      console.error("更新案件狀態錯誤:", error);
      res.status(500).send("伺服器錯誤");
  }
});

const uploadLock = new Map();

app.post("/api/upload-case-photo", upload.single("image"), async (req, res) => {
  const { caseId, description } = req.body;

  if (uploadLock.get(caseId)) {
      console.log(`Upload already in progress for caseId: ${caseId}`);
      return res.status(409).json({ message: "上傳已在進行中" });
  }

  uploadLock.set(caseId, true);

  try {
      if (!req.file) {
          return res.status(400).json({ message: "沒有收到圖片文件" });
      }

      const imageFilePath = req.file.path;
      const imageName = `case-photos/${Date.now()}-${req.file.originalname}`;
      const uploadTime = new Date().toISOString(); // 记录上传时间

      console.log(`Attempting to upload image for caseId: ${caseId}, imageName: ${imageName}`);

      // 上传图片并获取URL
      const imageUrl = await uploadCasePhoto(imageFilePath, imageName, caseId, description, uploadTime);

      console.log(`Successfully uploaded image. URL: ${imageUrl}`);

      res.json({ imageUrl: imageUrl });

  } catch (error) {
      console.error("Error uploading image or updating database:", error);
      res.status(500).json({ message: "伺服器錯誤" });
  } finally {
      // 刪除臨時文件
      if (req.file) {
          fs.unlink(req.file.path, (err) => {
              if (err) console.error("Error deleting temporary file:", err);
          });
      }
      uploadLock.delete(caseId);
  }
});

app.post("/api/like-case", async (req, res) => {
  const { caseId, userId } = req.body;
  console.log(`Received like request for caseId: ${caseId}, userId: ${userId}`);
  
  try {
    const likes = await likeCase(caseId, userId);
    console.log(`Like operation successful. New likes count: ${likes}`);
    res.status(200).json({ success: true, likes });
  } catch (error) {
    console.error("Error in like-case route:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新獲取儀表板數據的路由
app.get("/api/dashboard-data", async (req, res) => {
  try {
    const dashboardData = await getDashboardData();
    res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});


async function generateCaseId(category) {
  const categoryMap = {
    "道路養護": "A",
    "人行環境": "B",
    "交通工程": "C",
    "停車規劃與管理": "D",
    "節點及門牌數": "E"
  };

  const prefix = categoryMap[category] || "Z"; // 默認為 "Z" 如果類別未定義
  const snapshot = await db.ref("cases").orderByChild("category").equalTo(category).once("value");
  const count = snapshot.numChildren() + 1;
  const caseId = prefix + String(count).padStart(6, '0');
  return caseId;
}

app.post("/api/save-upload-info", (req, res) => {
  const { userId } = req.body;
  try {
    updateUserPoints(userId);
    sendMessage(userId, "感謝您回報道路狀況，成功集點一次");
    res.status(200).send("已更新積分");
  } catch (error) {
    console.error("紀錄失敗:", error);
    res.status(500).send("伺服器錯誤");
  }
});

app.get("/api/get-user-data", async (req, res) => {
  try {
    const snapshot = await db.ref("cases").once("value");
    const data = snapshot.val();
    res.json(data);
  } catch (error) {
    console.error("Error getting user data:", error);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

app.post("/api/update-case-status", async (req, res) => {
  const { caseId, status } = req.body;

  try {
    // 更新案件状态
    await db.ref(`cases/${caseId}`).update({ status });
    
    res.status(200).json({ message: "案件狀態已更新" });
  } catch (error) {
    console.error("Error updating case status:", error);
    res.status(500).json({ error: "更新案件狀態時出錯" });
  }
});

app.post("/api/delete-case", async (req, res) => {
  const { caseId } = req.body;
  try {
    await deleteCase(caseId);
    res.status(200).send("案件已刪除");
  } catch (error) {
    console.error("Error deleting case:", error);
    res.status(500).send("伺服器錯誤");
  }
});

// Add a simple in-memory store for deduplication
const recentLogins = new Set();
const recentPageViews = new Set();

app.post('/api/record-user-login', async (req, res) => {
  const { userId } = req.body;
  console.log('Received login request for user:', userId);

  try {
    const result = await recordUserLogin(userId);
    console.log('Login recorded for user:', userId, 'Result:', result);
    res.status(200).json({ message: 'User login recorded successfully', newUser: result.newUser, date: result.date });
  } catch (error) {
    console.error('Error recording user login:', error);
    res.status(500).json({ error: 'Failed to record user login' });
  }
});

app.post('/api/record-page-view', async (req, res) => {
  const requestId = Date.now().toString();
  console.log('Received page view request:', requestId);
  
  // Check if this page view was recently recorded
  if (recentPageViews.has(requestId)) {
    console.log('Recent page view detected:', requestId);
    return res.status(200).json({ message: 'Page view already recorded', increment: 0 });
  }

  try {
    const result = await recordPageView();
    // Add to recent page views set
    recentPageViews.add(requestId);
    // Remove from set after 5 minutes
    setTimeout(() => recentPageViews.delete(requestId), 5 * 60 * 1000);
    
    console.log('Page view recorded:', requestId);
    res.status(200).json({ message: 'Page view recorded successfully', increment: result.increment, date: result.date });
  } catch (error) {
    console.error('Error recording page view:', error);
    res.status(500).json({ error: 'Failed to record page view' });
  }
});


async function getAddress(lat, lon) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
  const data = await response.json();
  return data.display_name;
}

async function getLocationFromAddress(address) {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1`);
  const data = await response.json();
  if (data && data.length > 0) {
    return { latitude: data[0].lat, longitude: data[0].lon };
  }
  return null;
}

app.listen(process.env.PORT || 8080, async () => {
  console.log(`Server is running on port ${process.env.PORT || 8080}`);
});
