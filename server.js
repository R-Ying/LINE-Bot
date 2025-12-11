const express = require("express");
const multer = require("multer");
const fs = require("fs");
const exec = require("child_process").exec;
const { updateUserPoints, uploadImage, deleteCase, db, getCompletedCases, uploadCasePhoto, getInProgressCases, likeCase, recordUserLogin, recordPageView, getDashboardData, saveARIData, addComment, getComments, likeComment, deleteComment } = require("./firebase.js");
const { bot, sendMessage } = require("./bot");
const fetch = require("node-fetch");
require('dotenv').config();
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

app.post("/webhook", bot.parser());

app.use(express.json());
app.use(express.static('public'));
app.use(express.static('dist', {
  setHeaders: (res, path) => {
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

app.post("/check-image", upload.single("image_file"), async function (req, res) {
    const imageFilePath = req.file.path;
    
    try {
        // 使用Python模型檢查圖片內容
        const pythonResult = await new Promise((resolve, reject) => {
            const pythonProcess = exec("python3 main.py", function (error, stdout) {
                if (error) {
                    console.error("Python model error:", error);
                    reject(error);
                    return;
                }
                resolve(stdout.trim());
            });
            pythonProcess.stdin.write(imageFilePath);
            pythonProcess.stdin.end();
        });

        // 返回檢查結果
        if (pythonResult === "Success") {
            res.json({ 
                message: "Success", 
                detail: "圖片符合標準" 
            });
        } else {
            res.json({ 
                message: "Fail", 
                detail: "圖片不符合標準，請重新上傳" 
            });
        }

    } catch (error) {
        console.error("Error checking image:", error);
        res.status(500).json({ 
            message: "Fail", 
            detail: "檢查圖片時發生錯誤" 
        });
    } finally {
        // 清理臨時檔案
        if (imageFilePath) {
            fs.unlink(imageFilePath, (err) => {
                if (err) console.error("Error deleting temp file:", err);
            });
        }
    }
});

app.post("/detect", upload.single("image_file"), async function (req, res) {
  const imageFilePath = req.file.path;
  let { 
      latitude, 
      longitude, 
      userId, 
      category, 
      subcategory, 
      newFormOption, 
      detailOption, 
      extraDetails 
  } = req.body;

  try {
      // 驗證必要欄位
      if (!latitude || !longitude || !userId) {
          return res.status(400).json({ 
              message: "Fail", 
              detail: "無法讀取圖片位置" 
          });
      }
      
      // 確認必要資料欄位
      if (!category) {
          return res.status(400).json({ 
              message: "Fail", 
              detail: "缺少必要欄位" 
          });
      }

      // 取得位置資訊
      const location = await getAddress(latitude, longitude);
      if (!location) {
          return res.json({ 
              message: "Fail", 
              detail: "無法取得地址資訊" 
          });
      }

      const fileName = `${Date.now()}-${req.file.originalname}`;
      const imageName = `images/${fileName}`;

      // 上傳圖片
      const imageUrl = await uploadImage(imageFilePath, imageName);
      const caseId = await generateCaseId(category);

      // 建立案件記錄
      const caseRecord = {
          caseId,
          imageUrl,
          status: "尚未處理",
          uploadTime: new Date().toISOString(),
          userId,
          latitude,
          longitude,
          category,
          subcategory,
          newFormOption,
          detailOption,
          extraDetails
      };

      // 儲存到資料庫
      const newCaseRef = db.ref("cases").push();
      await newCaseRef.set(caseRecord);

      res.json({ 
          message: "Success", 
          detail: "圖片上傳成功",
          caseId 
      });

  } catch (error) {
      console.error("Error processing upload:", error);
      res.status(500).json({ 
          message: "Fail", 
          detail: error.message || "上傳處理失敗" 
      });
  } finally {
      // 清理臨時檔案
      if (imageFilePath) {
          fs.unlink(imageFilePath, (err) => {
              if (err) console.error("Error deleting temp file:", err);
          });
      }
  }
});

// 新增：專門用於更新 ARI 數據的路由
app.post("/api/update-ari-data", async (req, res) => {
  const { caseId, ariData } = req.body;

  if (!caseId || !ariData) {
      return res.status(400).json({ message: "Missing required data" });
  }

  try {
      await saveARIData(caseId, ariData);
      res.json({ message: "Success", detail: "ARI 數據已更新" });
  } catch (error) {
      console.error("Error updating ARI data:", error);
      res.status(500).json({ message: "Fail", detail: "更新 ARI 數據失敗" });
  }
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
      const uploadTime = new Date().toISOString(); // 紀錄上傳時間

      console.log(`Attempting to upload image for caseId: ${caseId}, imageName: ${imageName}`);

      // 上傳圖片並獲取URL
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

  try {
      const prefix = categoryMap[category] || "Z";
      const casesRef = db.ref("cases");
      const snapshot = await casesRef.once("value");
      
      // 計算特定類別的案件數量
      let count = 0;
      snapshot.forEach((childSnapshot) => {
          const caseData = childSnapshot.val();
          if (caseData && caseData.category === category) {
              count++;
          }
      });
      
      // 生成新的案件ID
      const caseId = prefix + String(count + 1).padStart(6, '0');
      return caseId;
  } catch (error) {
      console.error("Error generating case ID:", error);
      throw new Error("無法生成案件編號");
  }
}

app.post("/api/save-upload-info", async (req, res) => {
  const { userId } = req.body;
  console.log('Saving upload info for user:', userId);

  try {
      const updatedPoints = await updateUserPoints(userId);
      await sendMessage(userId, `感謝您回報道路狀況，成功集點一次，目前總點數：${updatedPoints}`);
      res.status(200).json({
          success: true,
          points: updatedPoints,
          message: "已更新積分"
      });
  } catch (error) {
      console.error("紀錄失敗:", error);
      res.status(500).json({
          success: false,
          error: "伺服器錯誤"
      });
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
    // 更新案件狀態
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

  if (recentPageViews.has(requestId)) {
    console.log('Recent page view detected:', requestId);
    return res.status(200).json({ message: 'Page view already recorded', increment: 0 });
  }

  try {
    const result = await recordPageView();
    recentPageViews.add(requestId);
    setTimeout(() => recentPageViews.delete(requestId), 5 * 60 * 1000);
    
    console.log('Page view recorded:', requestId);
    res.status(200).json({ message: 'Page view recorded successfully', increment: result.increment, date: result.date });
  } catch (error) {
    console.error('Error recording page view:', error);
    res.status(500).json({ error: 'Failed to record page view' });
  }
});

app.get("/api/comments/:caseId", async (req, res) => {
  const { caseId } = req.params;
  console.log(`Received request for comments of case ${caseId}`);
  
  try {
    const comments = await getComments(caseId);
    res.status(200).json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

app.post("/api/comments/:caseId", async (req, res) => {
  const { caseId } = req.params;
  const { userId, userName, text } = req.body;
  console.log(`Received comment for case ${caseId} from user ${userId}`);
  
  if (!userId || !text) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  
  try {
    const commentId = await addComment(caseId, userId, userName, text);
    res.status(201).json({ commentId, message: "Comment added successfully" });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

app.post("/api/comments/:caseId/:commentId/like", async (req, res) => {
  const { caseId, commentId } = req.params;
  const { userId } = req.body;
  console.log(`Received like for comment ${commentId} in case ${caseId} from user ${userId}`);
  
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }
  
  try {
    const result = await likeComment(caseId, commentId, userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error liking comment:", error);
    res.status(500).json({ error: "Failed to like comment" });
  }
});

app.delete("/api/comments/:caseId/:commentId", async (req, res) => {
  const { caseId, commentId } = req.params;
  console.log(`Received delete request for comment ${commentId} in case ${caseId}`);
  
  try {
    await deleteComment(caseId, commentId);
    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});


async function getAddress(lat, lon) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`);
  const data = await response.json();
  return data.display_name;
}

app.listen(process.env.PORT || 8080, async () => {
  console.log(`Server is running on port ${process.env.PORT || 8080}`);
});