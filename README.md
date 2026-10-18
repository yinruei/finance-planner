# 財務規劃簿

每月收支「計畫 vs 實際」＋未來月份進度＋長期目標（例如結婚基金）追蹤。
網址：https://finance-planner-app.pages.dev

## 架構

```
public/index.html          網頁（畫面＋邏輯，單一檔案）
functions/api/state.js     後端 API（Cloudflare Pages Function）→ 讀寫 KV
.github/workflows/deploy.yml  自動部署
```

- 資料存在 Cloudflare KV（`finance-planner-kv`），用密碼（PASSCODE）保護，手機和電腦同步。
- **備份永久保存**：每天第一次修改前，會把當時的完整資料存一份 `backup:YYYY-MM-DD`，不會過期。
  網頁「範本與目標 → 雲端歷史備份」可以下載或還原任何一天。
- 兩台裝置同時修改時會跳出提示讓你選，不會互相覆蓋。

## 自動部署

push 到 `master` 就會自動部署。也可以到 GitHub → Actions → Deploy to Cloudflare Pages → Run workflow 手動執行。

GitHub Actions 每次部署都會自動做這些事：
1. 建立 KV `finance-planner-kv`（已經存在就沿用，資料不會動）
2. 建立 Pages 專案 `finance-planner-app`（已經存在就沿用）
3. 綁定 KV 和密碼
4. 部署，並檢查網站和 API 是否正常

### 一次性設定：3 個 GitHub Secrets

到 repo → Settings → Secrets and variables → Actions → New repository secret，新增以下三個：

| 名稱 | 去哪裡拿 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 後台 → Workers & Pages，右側欄的 Account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 後台 → 右上頭像 → My Profile → API Tokens → Create Token → Create Custom Token，權限加兩項：**Account › Cloudflare Pages › Edit**、**Account › Workers KV Storage › Edit** |
| `FINANCE_PASSCODE` | 自己設一組登入網站用的密碼 |

設好之後，到 Actions 重跑一次就完成了。

## 本機測試

```bash
cp .dev.vars.example .dev.vars   # 在裡面設一組測試密碼
npx wrangler@3 pages dev public --kv FINANCE_KV --compatibility-date 2024-09-23
```

打開 http://localhost:8788 。本機用的是另一份獨立的假 KV，不會動到線上資料。
