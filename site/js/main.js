"use strict";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
if (LAZY[screen]) needScreen(screen).catch(() => {});  // 주소로 바로 연 화면이 나중에 받는 파일이면 자료와 같이 받기 시작
render();  // 데이터가 오기 전에도 주소에 맞는 시장·화면 버튼을 표시해요
load();
