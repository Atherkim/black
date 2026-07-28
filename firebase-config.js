// ============================================================
// Firebase 설정
// Firebase 콘솔 > 프로젝트 설정 > 일반 > 구성 탭에서 복사한 값입니다.
// databaseURL은 Realtime Database 화면 상단 URL을 그대로 넣었습니다
// (리전이 asia-southeast1이라 콘솔 "구성" 탭 스니펫에는 빠져있던 값).
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDM_uFj1KL_-VXE9h3QAUG7k9ggZ2_KgLE",
  authDomain: "ather-4879f.firebaseapp.com",
  databaseURL: "https://ather-4879f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ather-4879f",
  storageBucket: "ather-4879f.firebasestorage.app",
  messagingSenderId: "673788727472",
  appId: "1:673788727472:web:5381718e9b82dd5e97eb75"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
