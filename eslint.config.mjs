import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import prettierConfig from "eslint-config-prettier";  

export default defineConfig([
  // 根目錄的 JS 檔案 = 後端 = CommonJS
  { 
    files: ["*.js"],  // bot.js, firebase.js 等
    plugins: { js }, 
    extends: ["js/recommended"], 
    languageOptions: { 
      globals: { ...globals.node },
      sourceType: "commonjs" 
    } 
  },
  // src 資料夾的 JS 檔案 = 前端 = ES modules
  { 
    files: ["src/**/*.js"],
    plugins: { js }, 
    extends: ["js/recommended"], 
    languageOptions: { 
      globals: { ...globals.browser },
      sourceType: "module"  
    } 
  },
  prettierConfig,
]);
