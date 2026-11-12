# DialogLightbox

以瀏覽器原生 `<dialog>` 打造的燈箱、Modal、側邊抽屜與 SweetAlert 風格提示視窗。

- **零相依**：不需要 jQuery 或其他套件
- **無障礙**：焦點限制與歸還、`aria-live` 播報、鍵盤操作、`prefers-reduced-motion`、Windows 高對比
- **資安友善**：文字一律以 `textContent` 輸出、擋下 `javascript:` 等協定、iframe 網域白名單＋`sandbox`
- **MIT 授權**：商業專案可自由使用

## 快速開始

```html
<!-- 樣式 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/HuaiyingWang/dialog-lightbox@v1.3.0/dist/dialog-lightbox.min.css"
      integrity="sha384-Ox3COodi7394+8HLW0PSY2Mb4lvUQDel1KVa0yPu+ZPQiwMLEGLMbow9qiInVfAZ" crossorigin="anonymous">

<!-- 燈箱：同一個 data-lbx-group 會串成相簿 -->
<a href="large.jpg" data-lbx data-lbx-group="g1" aria-haspopup="dialog">
  <img src="thumb.jpg" alt="圖片替代文字">
</a>

<script src="https://cdn.jsdelivr.net/gh/HuaiyingWang/dialog-lightbox@v1.3.0/dist/dialog-lightbox.min.js"
        integrity="sha384-rFuCkHYyurmf9J3he3OuS8wLEkBHOk0VHQjkX5hC63oqueWDtCHHcCOpSGOU80Wy" crossorigin="anonymous"></script>
<script>
  const lightbox = new DialogLightbox({ thumbnails: true });
</script>
```

### SweetAlert 風格提示（選用）

需在 `dialog-lightbox` 之後載入：

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/HuaiyingWang/dialog-lightbox@v1.3.0/dist/dialog-alert.min.css"
      integrity="sha384-ShBx3oOpbRj1En8kn6ILuonK7LxBP1/y+ncydGX2nqtmQMFJd36mKn6DgdHmsAsP" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/gh/HuaiyingWang/dialog-lightbox@v1.3.0/dist/dialog-alert.min.js"
        integrity="sha384-8p00d4w2eKoxbA7NPj3Cx5OP/mbx4o4RtEkzdU2QVTKMQiD4/GYkA8fiaNsaa1aN" crossorigin="anonymous"></script>
<script>
  DialogAlert.fire({
    icon: 'warning',
    title: '確定要刪除嗎？',
    text: '刪除後將無法復原。',
    showCancelButton: true,
    focusCancel: true
  }).then((r) => { if (r.isConfirmed) { /* ... */ } });
</script>
```

## 元件一覽

| 元件 | 用法 |
|---|---|
| 圖片燈箱（縮放、縮圖列、滑動） | `new DialogLightbox({ thumbnails: true })` |
| Inline 內容／YouTube／影片＋字幕 | `data-lbx-type="inline \| iframe \| video"` |
| 一般 Modal | `new DialogLightbox({ variant: 'modal', selector: '[data-modal]' })` |
| 側邊抽屜 | `new DialogLightbox({ variant: 'drawer', selector: '[data-drawer]' })` |
| 首頁公告（今天不再顯示） | `instance.autoOpen('#tpl', { snooze: 'notice-id' })` |
| 提示視窗／Toast | `DialogAlert.fire({...})`、`DialogAlert.toast({...})` |

完整範例請見 [`examples/`](examples/)，每個檔案都可直接以瀏覽器開啟。

## 檔案

| 路徑 | 說明 |
|---|---|
| `dist/*.min.css`、`dist/*.min.js` | 壓縮版（建議正式環境使用） |
| `src/` | 原始碼（含中文註解） |
| `examples/` | 7 個可直接執行的範例 |

## 瀏覽器支援

Chrome／Edge 114+、Safari 17+、Firefox 125+。較舊瀏覽器仍可開啟燈箱，僅少了淡入淡出與 Toast 置頂效果。

## 授權

[MIT](LICENSE)
