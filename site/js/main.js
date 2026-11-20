"use strict";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();  // 데이터가 오기 전에도 주소에 맞는 시장·화면 버튼을 표시해요
load();
