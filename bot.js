const linebot = require("linebot"); //引入linebot庫
const { getUserPoints, getUserCases} = require('./firebase');
require('dotenv').config();

//創建和配置linebot
const bot = linebot({
  channelId: process.env.CHANNEL_ID,
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

//設置事件監聽器，監聽用戶發送的消息，當收到消息時會觸發監聽器，並執行回調函數
bot.on("message", function (event) {
  const userId = event.source.userId;
    //回調函數中檢查收到的消息內容是否為測試，如果是，linebot會回復liff連結
  if (event.message.text === "回報") {
    event.reply("https://liff.line.me/2000183206-NjVg83LK");
  }
  else if(event.message.text === "成果") {
    event.reply("https://liff.line.me/2005908466-lQ188J90");
  }
  else if(event.message.text === "道路狀況") {
    event.reply("https://liff.line.me/2005958463-KeJ5Rme1");
  }
  else if(event.message.text === "查詢集點") {
    getUserPoints(userId).then(points => {
      event.reply(`您目前的集點為: ${points}點`);
    }).catch(err => {
      console.error("獲取積分失敗:", err);
      event.reply("無法獲集您的集點，請稍後再試");
    });
  }
  else if(event.message.text === "查詢案件狀態") {
    getUserCases(userId).then(cases => {
      if(cases.length > 0) {
        if (cases.length > 0) {
          let replyText = "您的案件狀態如下: \n";
          cases.forEach((caseInfo, index) => {
            replyText += `${index + 1}. 狀態: ${caseInfo.status}，上傳時間:${caseInfo.uploadTime}\n`;
          });
          event.reply(replyText);
        }
        else {
          event.reply("您目前沒有回報任何案件");
        }
      }
      }).catch(err => {
        console.error("查詢案件狀態失敗:", err);
        event.reply("查詢失敗，請稍後再試");
    });
  }
});

//主動發送訊息
function sendMessage(userId, messageText) {
  bot
      .push(userId, [messageText])
      .then(() => {
        console.log("訊息已傳送");
      })
      .catch((err) => {
        console.error("發送訊息失敗", err);
      }); 
}

//導出bot實例，使它可以在其他JS文件中被引入和使用
module.exports = {bot, sendMessage, getUserPoints, getUserCases};